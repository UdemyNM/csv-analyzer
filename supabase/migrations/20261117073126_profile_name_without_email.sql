-- 作成者名にメールアドレスを出さない（自動セキュリティレビューの指摘）
-- profiles はログイン中の全員が読めるため、表示名が無い人をメールアドレスで埋めると、全員のメールアドレスが見えてしまう。
-- 表示名（app_metadata.display_name。管理者だけが設定できる）が無い人は空にする。画面は「不明なユーザー」と出す
-- 20261117072023 は本番に反映済みのため、書き換えずにこの migration で上書きする

create or replace function private.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_app_meta_data ->> 'display_name', ''))
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$;

-- メールアドレスは使わなくなったので、app_metadata の更新だけで動かす
drop trigger if exists on_auth_user_saved on auth.users;
create trigger on_auth_user_saved
after insert or update of raw_app_meta_data on auth.users
for each row execute function private.sync_profile();

-- 既に入っているメールアドレスを消す（app_metadata の表示名だけで作り直す）
update public.profiles p
set display_name = coalesce(u.raw_app_meta_data ->> 'display_name', '')
from auth.users u
where u.id = p.id;
