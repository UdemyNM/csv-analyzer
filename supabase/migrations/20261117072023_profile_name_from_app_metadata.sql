-- 作成者名の見直し（セキュリティレビューの指摘 2 件）
-- 1. なりすまし対策: 表示名の元を user_metadata から app_metadata に変える
--   - user_metadata（raw_user_meta_data）は、ログイン中の本人が supabase.auth.updateUser({ data }) で書き換えられる。
--     それを profiles に写すと、他人の名前を名乗ってデータを共有できてしまう
--   - app_metadata（raw_app_meta_data）は、本人には書き換えられない（管理者がダッシュボードの SQL などで設定する。docs/06）
-- 2. メールアドレスを他人に見せない: 表示名が無い人は空にする（メールアドレスで埋めない）。画面は「不明なユーザー」と出す
-- 20261117065036 は本番に反映済みのため、書き換えずにこの migration で上書きする

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

-- 本人の書き換え（raw_user_meta_data の更新）では動かないようにする
drop trigger if exists on_auth_user_saved on auth.users;
create trigger on_auth_user_saved
after insert or update of raw_app_meta_data on auth.users
for each row execute function private.sync_profile();

-- 既にいるユーザーの表示名も、app_metadata だけで作り直す（メールアドレスを消す）
-- user_metadata で付けていた表示名は引き継がない（本人が書き換えた値の可能性があるため）。管理者が docs/06 の手順で付け直す
update public.profiles p
set display_name = coalesce(u.raw_app_meta_data ->> 'display_name', '')
from auth.users u
where u.id = p.id;
