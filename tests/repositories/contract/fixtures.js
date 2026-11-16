// Repository 契約テスト用の共通データ（テストファイルではない）

export const USERS = [
  { id: 'u-alice', email: 'alice@example.com', password: 'alice-pass', displayName: 'Alice' },
  { id: 'u-bob', email: 'bob@example.com', password: 'bob-pass', displayName: 'Bob' },
  { id: 'u-carol', email: 'carol@example.com', password: 'carol-pass', displayName: 'Carol' },
]

export const utf8Bytes = (text) => new TextEncoder().encode(text)

// 「名前,売上\n東京,1000\n」を Shift_JIS で符号化したバイト列（TextDecoder('shift_jis') で往復確認済み）
export const SHIFT_JIS_BYTES = new Uint8Array([
  0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x94, 0x84, 0x8f, 0xe3, 0x0a, 0x93, 0x8c, 0x8b, 0x9e, 0x2c, 0x31,
  0x30, 0x30, 0x30, 0x0a,
])

export const makeCsvFile = (bytes, name = 'data.csv') =>
  new File([bytes], name, { type: 'text/csv' })

export const CSV_TEXT = '店舗,売上\n東京,100\n大阪,200\n'

export const META = {
  rowCount: 2,
  encoding: 'utf-8',
  columns: [
    { name: '店舗', type: 'string' },
    { name: '売上', type: 'number' },
  ],
}

export const sampleCreateInput = (overrides = {}) => ({
  name: 'sales.csv',
  visibility: 'private',
  file: makeCsvFile(utf8Bytes(CSV_TEXT), 'sales.csv'),
  meta: META,
  ...overrides,
})

export const VIEW_CONFIG = {
  filters: [{ column: '店舗', op: 'eq', value: '東京' }],
  sort: { column: '売上', direction: 'desc' },
  aggregation: { groupBy: ['店舗'], metrics: [{ column: '売上', fn: 'sum' }] },
  chart: { type: 'bar', x: '店舗', y: '売上_sum' },
}

export const toBytes = (arrayBuffer) => Array.from(new Uint8Array(arrayBuffer))

// ArrayBuffer かどうか（jsdom と Node の realm 違いで instanceof が使えないため）
export const isArrayBuffer = (v) => Object.prototype.toString.call(v) === '[object ArrayBuffer]'

export const signInAs = (env, key) => {
  const u = env.users.find((x) => x.id === `u-${key}`)
  return env.auth.signIn(u.email, u.password)
}

// 権限なし・見えない のどちらでも拒否とみなす場合の判定（仕様上どちらも可の箇所）
export const rejectsAsDenied = async (promise) => {
  const { PermissionError, NotFoundError } = await import('../../../src/repositories/types.js')
  let error
  try {
    await promise
  } catch (e) {
    error = e
  }
  if (!error) throw new Error('拒否されるはずが成功した')
  if (!(error instanceof PermissionError) && !(error instanceof NotFoundError)) {
    throw new Error(`PermissionError か NotFoundError のはずが ${error?.name}: ${error?.message}`)
  }
}
