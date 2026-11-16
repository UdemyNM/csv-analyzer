// Local 実装用の契約テスト環境ファクトリ（テストファイルではない）
//
// 本テストが固定する Local 実装のコンストラクタ（docs/03 に記載がないため、実装担当への指示）:
//   new LocalAuth({ users })                    users: [{ id, email, password, displayName }]
//   new LocalDatasetRepository({ auth, dbName }) 現在のユーザーは auth.getCurrentUser() から取る
//   new LocalViewRepository({ auth, dbName })    同じ dbName の IndexedDB から親 dataset を引いて可視性を判定する
// 配置:
//   src/repositories/local/LocalAuth.js / LocalDatasetRepository.js / LocalViewRepository.js（それぞれ名前付き export）
import { LocalAuth } from "../../../src/repositories/local/LocalAuth.js";
import { LocalDatasetRepository } from "../../../src/repositories/local/LocalDatasetRepository.js";
import { LocalViewRepository } from "../../../src/repositories/local/LocalViewRepository.js";
import { USERS } from "../contract/fixtures.js";

let seq = 0;

export const uniqueDbName = () => `test-db-${Date.now()}-${++seq}`;

export async function createLocalEnv({ dbName = uniqueDbName() } = {}) {
  const auth = new LocalAuth({ users: USERS });
  const datasets = new LocalDatasetRepository({ auth, dbName });
  const views = new LocalViewRepository({ auth, dbName });
  return { auth, datasets, views, users: USERS, dbName };
}
