/**
 * Repository の契約（JSDoc）と共通エラー。docs/03 3 章。
 * Local 実装（IndexedDB）と Supabase 実装は、同じ契約テスト（tests/repositories/contract/）を通すこと。
 */

/** 権限がない（見えているが、作成者でないため更新・削除できない など）。 */
export class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermissionError";
  }
}

/** 見つからない（存在しない、または閲覧権限がなく見えない）。URL 直打ちは「見つかりません」。 */
export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * @typedef {'private' | 'shared'} Visibility
 */

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 */

/**
 * @typedef {object} Dataset
 * @property {string} id
 * @property {string} ownerId
 * @property {string} name
 * @property {Visibility} visibility
 * @property {object} meta  create に渡した値をそのまま保持する（行数・文字コード・列情報など）
 * @property {number} fileSize  原本のバイト数
 * @property {string} createdAt  ISO 8601
 * @property {string} updatedAt  ISO 8601
 */

/**
 * @typedef {object} View
 * @property {string} id
 * @property {string} datasetId
 * @property {string} ownerId
 * @property {string} name
 * @property {object} config  { filters, sort, aggregation, chart }
 * @property {string} createdAt  ISO 8601
 * @property {string} updatedAt  ISO 8601
 */

/**
 * サインアップはアプリに実装しない（管理者がユーザーを作成する）。
 * @typedef {object} AuthRepository
 * @property {(email: string, password: string) => Promise<User>} signIn  失敗時は reject（現在のユーザーは変えない・通知しない）
 * @property {() => Promise<void>} signOut
 * @property {() => Promise<User | null>} getCurrentUser  未ログインは null
 * @property {(cb: (user: User | null) => void) => () => void} onAuthChange  解除関数を返す
 */

/**
 * 見えない dataset と存在しない dataset は、どちらも NotFoundError。
 * 他人の shared への update / remove は PermissionError。
 * @typedef {object} DatasetRepository
 * @property {() => Promise<Dataset[]>} list  閲覧可能なものだけ返す
 * @property {(id: string) => Promise<Dataset>} get
 * @property {(input: {name: string, visibility: Visibility, file: File, meta: object}) => Promise<Dataset>} create  未ログインは PermissionError
 * @property {(id: string, patch: {name?: string, visibility?: Visibility}) => Promise<Dataset>} update  作成者のみ
 * @property {(id: string) => Promise<void>} remove  作成者のみ。view も消える
 * @property {(id: string) => Promise<ArrayBuffer>} downloadCsv  原本のバイト列（無変換）
 */

/**
 * view は「親 dataset が見える人」だけが見られる。update / remove は作成者のみ（dataset の所有者でも他人の view は不可）。
 * @typedef {object} ViewRepository
 * @property {(datasetId: string) => Promise<View[]>} listByDataset  見えない・存在しない dataset は []
 * @property {(input: {datasetId: string, name: string, config: object}) => Promise<View>} create
 * @property {(id: string, patch: {name?: string, config?: object}) => Promise<View>} update
 * @property {(id: string) => Promise<void>} remove
 */
