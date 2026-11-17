// Supabase 実装用の契約テスト環境ファクトリ（テストファイルではない）
//
// 本テストが固定する Supabase 実装のコンストラクタ:
//   new SupabaseDatasetRepository({ client, auth })  client は createClient() の戻り値。現在のユーザーは auth.getCurrentUser()
//   new SupabaseViewRepository({ client, auth })
//   new SupabaseProfileRepository({ client })        listDisplayNames() → { [userId]: 表示名 }
// 権限の判定は Supabase 側（RLS）。偽クライアントは supabase/migrations/ の RLS を写したもの
import { SupabaseAuth } from "../../../src/repositories/supabase/SupabaseAuth.js";
import { SupabaseDatasetRepository } from "../../../src/repositories/supabase/SupabaseDatasetRepository.js";
import { SupabaseViewRepository } from "../../../src/repositories/supabase/SupabaseViewRepository.js";
import { SupabaseProfileRepository } from "../../../src/repositories/supabase/SupabaseProfileRepository.js";
import { USERS } from "../contract/fixtures.js";
import { createFakeSupabaseClient } from "./fakeSupabaseClient.js";

export async function createSupabaseEnv(options = {}) {
  const client = createFakeSupabaseClient({ users: USERS, ...options });
  const auth = new SupabaseAuth({ client });
  return {
    client,
    auth,
    datasets: new SupabaseDatasetRepository({ client, auth }),
    views: new SupabaseViewRepository({ client, auth }),
    profiles: new SupabaseProfileRepository({ client }),
    users: USERS,
  };
}
