import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { LocalDatasetRepository } from "./repositories/local/LocalDatasetRepository.js";
import { LocalViewRepository } from "./repositories/local/LocalViewRepository.js";
import { SupabaseAuth } from "./repositories/supabase/SupabaseAuth.js";
import { createSupabaseClient } from "./repositories/supabase/createSupabaseClient.js";

// データ・ファイルは当面ブラウザ内（IndexedDB）。Supabase への移行（テーブル・RLS・Storage）は次の段階
const DB_NAME = "csv-analyzer";

/** 接続設定が無い・不正なときの画面。擬似ユーザーなどへは逃がさない。 */
function ConfigError({ message }) {
  return (
    <main className="page page--narrow">
      <div role="alert" className="alert">
        <p>Supabase の接続設定に問題があるため、アプリを開けません。</p>
        <p>{message}</p>
        <p>管理者に連絡してください。</p>
      </div>
    </main>
  );
}

function createApp() {
  try {
    const client = createSupabaseClient({
      url: import.meta.env.VITE_SUPABASE_URL,
      key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    const auth = new SupabaseAuth({ client });
    const datasets = new LocalDatasetRepository({ auth, dbName: DB_NAME });
    const views = new LocalViewRepository({ auth, dbName: DB_NAME });
    return <App auth={auth} datasets={datasets} views={views} />;
  } catch (e) {
    if (e?.name !== "SupabaseConfigError") throw e;
    return <ConfigError message={e.message} />;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>{createApp()}</StrictMode>,
);
