// supabase-js の偽物（テストファイルではない）。
// 実物の振る舞い（公式リファレンス）に合わせる:
//   - signInWithPassword({ email, password }) → { data: { user, session }, error }。失敗は error（理由を区別しない）
//   - getSession() → { data: { session }, error }
//   - signOut() → { error }
//   - onAuthStateChange(cb) → { data: { subscription: { unsubscribe } } }。購読直後に INITIAL_SESSION を非同期で送る
// users: [{ id, email, password, displayName, userMetadata? }]（tests/repositories/contract/fixtures.js の USERS と同じ形）
//   displayName は app_metadata.display_name に入れる（管理者だけが設定できる。docs/06）
//   userMetadata は user_metadata（本人が updateUser で書き換えられる値。なりすましの再現用）
//
// from(table) と storage は、supabase/migrations/ の定義（列・GRANT・RLS・バケット）を手で写したもの。
// migration を変えたら、ここも合わせる。使える問い合わせは Repository が使う分だけ:
//   from(t).select(cols).eq(col, v).order(col, {ascending}).maybeSingle() / .single()
//   from(t).insert(row).select(cols).single()
//   from(t).update(patch).eq(col, v).select(cols)
//   from(t).delete().eq(col, v).select(cols)
//   storage.from(bucket).upload(path, body, {contentType, upsert}) / download(path) / remove([path])
// options.failNext: { table: 'datasets', op: 'insert' } のように渡すと、その操作を 1 回だけ失敗させる（テスト用）

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pgError = (code, message) => ({
  code,
  message,
  details: null,
  hint: null,
});
const denied = (table) =>
  pgError("42501", `permission denied for table ${table}`);
const rlsViolation = (table) =>
  pgError(
    "42501",
    `new row violates row-level security policy for table "${table}"`,
  );
const storageError = (status, message) => ({
  name: "StorageApiError",
  status,
  message,
});

const clone = (v) => JSON.parse(JSON.stringify(v));

// migration の GRANT（列単位）と既定値・制約
const SCHEMA = {
  datasets: {
    uuidColumns: ["id", "owner_id"],
    insertable: ["id", "name", "visibility", "meta", "file_size"],
    updatable: ["name", "visibility"],
    check(row) {
      if (!["private", "shared"].includes(row.visibility)) return "visibility";
      if (
        typeof row.name !== "string" ||
        row.name.length < 1 ||
        row.name.length > 255
      )
        return "name";
      if (!(row.file_size >= 0 && row.file_size <= 10485760))
        return "file_size";
      return null;
    },
  },
  views: {
    uuidColumns: ["id", "dataset_id", "owner_id"],
    insertable: ["dataset_id", "name", "config"],
    updatable: ["name", "config"],
    check(row) {
      if (
        typeof row.name !== "string" ||
        row.name.length < 1 ||
        row.name.length > 255
      )
        return "name";
      return null;
    },
  },
  profiles: {
    uuidColumns: [],
    insertable: [],
    updatable: [],
    check: () => null,
  },
};

export function createFakeSupabaseClient({
  users,
  signInError,
  failNext,
} = {}) {
  let session = null;
  let seq = 0;
  let pendingFailure = failNext ? { ...failNext } : null;
  const listeners = new Set();
  const emit = (event) => {
    for (const cb of [...listeners]) cb(event, session);
  };
  const toAuthUser = (u) => ({
    id: u.id,
    email: u.email,
    user_metadata: u.userMetadata ?? {},
    app_metadata: {
      provider: "email",
      ...(u.displayName ? { display_name: u.displayName } : {}),
    },
  });
  const uid = () => session?.user.id ?? null;
  // 作成日時が同じ時刻にならないよう、呼ぶたびに 1ms ずつ進める
  const now = () => new Date(Date.UTC(2026, 10, 17) + ++seq).toISOString();

  // ───── DB（行は snake_case のまま持つ）─────
  const tables = {
    profiles: (users ?? []).map((u) => ({
      id: u.id,
      // migration と同じ: app_metadata.display_name。無ければ空（メールアドレスは入れない）
      display_name: u.displayName || "",
      created_at: now(),
    })),
    datasets: [],
    views: [],
  };
  const storagePath = (d) => `${d.owner_id}/${d.id}.csv`;

  // migration の RLS（SELECT）
  const canSeeDataset = (d) =>
    uid() !== null && (d.owner_id === uid() || d.visibility === "shared");
  const canSee = {
    profiles: () => uid() !== null,
    datasets: canSeeDataset,
    views: (v) =>
      tables.datasets.some((d) => d.id === v.dataset_id && canSeeDataset(d)),
  };

  const takeFailure = (table, op) => {
    if (
      pendingFailure &&
      pendingFailure.table === table &&
      pendingFailure.op === op
    ) {
      pendingFailure = null;
      return pgError("XX000", "simulated failure");
    }
    return null;
  };

  const project = (row, cols) => {
    if (!cols || cols.trim() === "*") return clone(row);
    const out = {};
    for (const col of cols.split(",").map((c) => c.trim())) {
      if (!(col in row)) throw pgError("42703", `column ${col} does not exist`);
      out[col] = clone(row[col]);
    }
    return out;
  };

  class Query {
    #table;
    #op = "select";
    #cols = "*";
    #returning = null;
    #payload = null;
    #filters = [];
    #orders = [];
    #mode = "many";

    constructor(table) {
      this.#table = table;
    }
    select(cols = "*") {
      if (this.#op === "select") this.#cols = cols;
      else this.#returning = cols;
      return this;
    }
    insert(row) {
      this.#op = "insert";
      this.#payload = row;
      return this;
    }
    update(patch) {
      this.#op = "update";
      this.#payload = patch;
      return this;
    }
    delete() {
      this.#op = "delete";
      return this;
    }
    eq(col, value) {
      this.#filters.push([col, value]);
      return this;
    }
    order(col, { ascending = true } = {}) {
      this.#orders.push([col, ascending]);
      return this;
    }
    maybeSingle() {
      this.#mode = "maybe";
      return this;
    }
    single() {
      this.#mode = "single";
      return this;
    }
    then(resolve, reject) {
      return Promise.resolve()
        .then(() => this.#run())
        .then(resolve, reject);
    }

    #run() {
      try {
        const rows = this.#execute();
        return this.#shape(rows);
      } catch (error) {
        if (error && typeof error.code === "string")
          return { data: null, error };
        throw error;
      }
    }

    #shape(rows) {
      if (rows === null) return { data: null, error: null };
      if (this.#mode === "many") return { data: rows, error: null };
      if (rows.length > 1)
        return { data: null, error: pgError("PGRST116", "multiple rows") };
      if (rows.length === 0) {
        return this.#mode === "maybe"
          ? { data: null, error: null }
          : {
              data: null,
              error: pgError("PGRST116", "The result contains 0 rows"),
            };
      }
      return { data: rows[0], error: null };
    }

    #matches(row) {
      return this.#filters.every(([col, value]) => row[col] === value);
    }

    #assertFilterTypes() {
      const schema = SCHEMA[this.#table];
      for (const [col, value] of this.#filters) {
        if (schema.uuidColumns.includes(col) && !UUID.test(String(value))) {
          // 実際の型は uuid だが、偽物ではユーザー id（u-alice）を通すため id / dataset_id だけ見る
          if (col === "id" || col === "dataset_id") {
            throw pgError(
              "22P02",
              `invalid input syntax for type uuid: "${value}"`,
            );
          }
        }
      }
    }

    #execute() {
      const table = this.#table;
      if (!(table in tables))
        throw pgError("42P01", `relation "${table}" does not exist`);
      // anon には GRANT が無い
      if (uid() === null) throw denied(table);
      const failure = takeFailure(table, this.#op);
      if (failure) throw failure;
      this.#assertFilterTypes();
      const schema = SCHEMA[table];

      if (this.#op === "select") {
        const rows = tables[table].filter(
          (r) => canSee[table](r) && this.#matches(r),
        );
        const sorted = [...rows].sort((a, b) => {
          for (const [col, asc] of this.#orders) {
            if (a[col] < b[col]) return asc ? -1 : 1;
            if (a[col] > b[col]) return asc ? 1 : -1;
          }
          return 0;
        });
        return sorted.map((r) => project(r, this.#cols));
      }

      if (this.#op === "insert") {
        const payload = this.#payload;
        for (const col of Object.keys(payload)) {
          if (!schema.insertable.includes(col)) throw denied(table);
        }
        const t = now();
        const row = {
          ...(table === "datasets"
            ? { visibility: "private", meta: {} }
            : { config: {} }),
          ...clone(payload),
          id: payload.id ?? crypto.randomUUID(),
          owner_id: uid(), // 既定値 auth.uid()
          created_at: t,
          updated_at: t,
        };
        if (!UUID.test(row.id))
          throw pgError("22P02", "invalid input syntax for type uuid");
        if (table === "views" && !UUID.test(row.dataset_id)) {
          throw pgError("22P02", "invalid input syntax for type uuid");
        }
        if (tables[table].some((r) => r.id === row.id)) {
          throw pgError(
            "23505",
            "duplicate key value violates unique constraint",
          );
        }
        if (schema.check(row))
          throw pgError("23514", `check constraint (${schema.check(row)})`);
        // RLS（INSERT の WITH CHECK）
        if (table === "views" && !canSee.views(row)) throw rlsViolation(table);
        if (table === "datasets") row.storage_path = storagePath(row);
        tables[table].push(row);
        return this.#returning === null
          ? null
          : [project(row, this.#returning)];
      }

      if (this.#op === "update") {
        for (const col of Object.keys(this.#payload)) {
          if (!schema.updatable.includes(col)) throw denied(table);
        }
        // RLS: 見えて、かつ作成者の行だけが対象（対象外は 0 件で、エラーにはならない）
        const targets = tables[table].filter(
          (r) => canSee[table](r) && r.owner_id === uid() && this.#matches(r),
        );
        for (const r of targets) {
          const next = { ...r, ...clone(this.#payload), updated_at: now() };
          if (schema.check(next))
            throw pgError("23514", `check constraint (${schema.check(next)})`);
        }
        for (const r of targets)
          Object.assign(r, clone(this.#payload), { updated_at: now() });
        return this.#returning === null
          ? null
          : targets.map((r) => project(r, this.#returning));
      }

      if (this.#op === "delete") {
        const targets = tables[table].filter(
          (r) => canSee[table](r) && r.owner_id === uid() && this.#matches(r),
        );
        const ids = new Set(targets.map((r) => r.id));
        tables[table] = tables[table].filter((r) => !ids.has(r.id));
        // on delete cascade（RLS に関係なく消える）
        if (table === "datasets") {
          tables.views = tables.views.filter((v) => !ids.has(v.dataset_id));
        }
        return this.#returning === null
          ? null
          : targets.map((r) => project(r, this.#returning));
      }
      throw new Error(`未対応の操作: ${this.#op}`);
    }
  }

  // ───── Storage（private バケット csv-files）─────
  const buckets = { "csv-files": new Map() };
  const folderOf = (path) => path.split("/")[0];
  const canReadObject = (path) =>
    uid() !== null &&
    (folderOf(path) === uid() ||
      tables.datasets.some((d) => d.storage_path === path && canSeeDataset(d)));

  const toBytes = async (body) => {
    if (
      body instanceof ArrayBuffer ||
      Object.prototype.toString.call(body) === "[object ArrayBuffer]"
    ) {
      return new Uint8Array(body.slice(0));
    }
    if (ArrayBuffer.isView(body)) return new Uint8Array(body);
    if (typeof body?.arrayBuffer === "function")
      return new Uint8Array(await body.arrayBuffer());
    throw new TypeError("未対応の body");
  };

  const storage = {
    from(bucket) {
      const objects = buckets[bucket];
      return {
        async upload(path, body, { contentType, upsert = false } = {}) {
          if (!objects)
            return { data: null, error: storageError(400, "Bucket not found") };
          if (uid() === null || folderOf(path) !== uid()) {
            return {
              data: null,
              error: storageError(
                403,
                "new row violates row-level security policy",
              ),
            };
          }
          if (contentType !== "text/csv") {
            return {
              data: null,
              error: storageError(
                415,
                `mime type ${contentType} is not supported`,
              ),
            };
          }
          if (objects.has(path) && !upsert) {
            return {
              data: null,
              error: storageError(409, "The resource already exists"),
            };
          }
          objects.set(path, { bytes: await toBytes(body), contentType });
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        },
        async download(path) {
          const obj = objects?.get(path);
          if (!obj || !canReadObject(path)) {
            return { data: null, error: storageError(400, "Object not found") };
          }
          return {
            data: new Blob([obj.bytes], { type: obj.contentType }),
            error: null,
          };
        },
        async remove(paths) {
          const removed = [];
          for (const path of paths) {
            // DELETE は自分のフォルダだけ（見えないものは黙って対象外）
            if (
              objects?.has(path) &&
              uid() !== null &&
              folderOf(path) === uid()
            ) {
              objects.delete(path);
              removed.push({ name: path });
            }
          }
          return { data: removed, error: null };
        },
      };
    },
  };

  const auth = {
    async signInWithPassword({ email, password }) {
      if (signInError) {
        return { data: { user: null, session: null }, error: signInError };
      }
      const found = users.find(
        (u) => u.email === email && u.password === password,
      );
      if (!email || !password || !found) {
        return {
          data: { user: null, session: null },
          error: {
            name: "AuthApiError",
            code: "invalid_credentials",
            status: 400,
            message: "Invalid login credentials",
          },
        };
      }
      const user = toAuthUser(found);
      session = { access_token: `token-${found.id}`, user };
      emit("SIGNED_IN");
      return { data: { user, session }, error: null };
    },
    async signOut() {
      session = null;
      emit("SIGNED_OUT");
      return { error: null };
    },
    async getSession() {
      return { data: { session }, error: null };
    },
    onAuthStateChange(cb) {
      listeners.add(cb);
      setTimeout(() => {
        if (listeners.has(cb)) cb("INITIAL_SESSION", session);
      }, 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(cb),
          },
        },
      };
    },
    /** テスト用: トークン更新（同じユーザーのまま）を起こす */
    __refresh() {
      emit("TOKEN_REFRESHED");
    },
  };

  return {
    auth,
    from: (table) => new Query(table),
    storage,
    /** テスト用: 中身を直接見る */
    __inspect: {
      objectPaths: (bucket = "csv-files") => [...buckets[bucket].keys()],
      rows: (table) => clone(tables[table]),
    },
  };
}
