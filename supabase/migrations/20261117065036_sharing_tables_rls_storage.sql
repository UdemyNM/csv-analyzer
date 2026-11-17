-- Phase 8b: データ・CSV 原本の共有（profiles / datasets / views、RLS、Storage）
-- 方針（docs/02 3 章）:
--   - 権限はすべて RLS で強制する。ブラウザは authenticated ロールだけを使い、anon には何も許さない
--   - プロジェクト作成時に「Automatically expose new tables」をオフにしているため、GRANT はここで明示する
--   - 列ごとの GRANT で、書き換えてよい列を絞る（owner_id・id・作成日時は変えさせない）
-- アプリ側の偽物（tests/repositories/supabase/fakeSupabaseClient.js）は、この定義に合わせてある。変えるときは両方を直す

-- ───────── 共通 ─────────
-- 公開しない関数の置き場（Data API の対象外）
create schema if not exists private;
revoke all on schema private from public;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────── profiles（作成者名の表示用）─────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

-- 少人数のチームで使うため、ログイン中のユーザーは全員の表示名を読める（書き込みは下のトリガーだけ）
create policy "profiles: ログイン中なら読める"
on public.profiles for select to authenticated
using (true);

-- 管理者がダッシュボードでユーザーを作る・表示名を変えると、profiles に反映する
-- 表示名は user_metadata.display_name。無ければメールアドレス（SupabaseAuth の表示と同じ）
create function private.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new.email, '')
  )
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.sync_profile() to supabase_auth_admin;

create trigger on_auth_user_saved
after insert or update of raw_user_meta_data, email on auth.users
for each row execute function private.sync_profile();

-- 既にいるユーザー（Phase 8a で発行済み）の分
insert into public.profiles (id, display_name)
select id, coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), email, '')
from auth.users
on conflict (id) do nothing;

-- ───────── datasets ─────────
create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  meta jsonb not null default '{}'::jsonb,
  -- アプリの上限（DropZone の MAX_BYTES = 10MB）と同じ
  file_size bigint not null check (file_size between 0 and 10485760),
  -- CSV 原本の場所。owner_id と id から決まり、書き換えられない（他人のファイルを指せない）
  storage_path text generated always as (owner_id::text || '/' || id::text || '.csv') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index datasets_owner_id_idx on public.datasets (owner_id);
create index datasets_storage_path_idx on public.datasets (storage_path);

create trigger datasets_set_updated_at
before update on public.datasets
for each row execute function private.set_updated_at();

alter table public.datasets enable row level security;
revoke all on table public.datasets from anon, authenticated;
grant select, delete on table public.datasets to authenticated;
grant insert (id, name, visibility, meta, file_size) on table public.datasets to authenticated;
grant update (name, visibility) on table public.datasets to authenticated;

create policy "datasets: 自分のもの・全員公開を読める"
on public.datasets for select to authenticated
using (owner_id = (select auth.uid()) or visibility = 'shared');

create policy "datasets: 自分を作成者として作れる"
on public.datasets for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "datasets: 作成者だけが更新できる"
on public.datasets for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "datasets: 作成者だけが削除できる"
on public.datasets for delete to authenticated
using (owner_id = (select auth.uid()));

-- ───────── views（保存したビュー設定）─────────
create table public.views (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index views_dataset_id_idx on public.views (dataset_id);
create index views_owner_id_idx on public.views (owner_id);

create trigger views_set_updated_at
before update on public.views
for each row execute function private.set_updated_at();

alter table public.views enable row level security;
revoke all on table public.views from anon, authenticated;
grant select, delete on table public.views to authenticated;
grant insert (dataset_id, name, config) on table public.views to authenticated;
grant update (name, config) on table public.views to authenticated;

-- 親 dataset が見える人だけ（サブクエリにも datasets の RLS がかかる）
create policy "views: 親 dataset が見えれば読める"
on public.views for select to authenticated
using (exists (select 1 from public.datasets d where d.id = views.dataset_id));

create policy "views: 親 dataset が見えれば、自分を作成者として作れる"
on public.views for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.datasets d where d.id = views.dataset_id)
);

create policy "views: 作成者だけが更新できる"
on public.views for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "views: 作成者だけが削除できる"
on public.views for delete to authenticated
using (owner_id = (select auth.uid()));

-- ───────── Storage（CSV 原本。private バケット）─────────
-- パスは {owner_id}/{dataset_id}.csv（datasets.storage_path と同じ）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('csv-files', 'csv-files', false, 10485760, array['text/csv'])
on conflict (id) do nothing;

create policy "csv-files: 自分のフォルダにだけ置ける"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'csv-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 自分のファイル、または「見える dataset」の原本を読める
-- objects.name と書く（datasets にも name 列があるため、修飾しないと datasets.name になる）
create policy "csv-files: 自分のもの・見える dataset の原本を読める"
on storage.objects for select to authenticated
using (
  bucket_id = 'csv-files'
  and (
    (storage.foldername(objects.name))[1] = (select auth.uid())::text
    or exists (select 1 from public.datasets d where d.storage_path = objects.name)
  )
);

create policy "csv-files: 自分のフォルダのものだけ消せる"
on storage.objects for delete to authenticated
using (
  bucket_id = 'csv-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
