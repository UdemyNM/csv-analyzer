import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { SupabaseAuth } from "./repositories/supabase/SupabaseAuth.js";
import { SupabaseDatasetRepository } from "./repositories/supabase/SupabaseDatasetRepository.js";
import { SupabaseProfileRepository } from "./repositories/supabase/SupabaseProfileRepository.js";
import { SupabaseViewRepository } from "./repositories/supabase/SupabaseViewRepository.js";
import { createSupabaseClient } from "./repositories/supabase/createSupabaseClient.js";

// 認証・データ・CSV 原本はすべて Supabase（テーブル・RLS・Storage は supabase/migrations/）

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
    const datasets = new SupabaseDatasetRepository({ client, auth });
    const views = new SupabaseViewRepository({ client, auth });
    const profiles = new SupabaseProfileRepository({ client });
    return (
      <App auth={auth} datasets={datasets} views={views} profiles={profiles} />
    );
  } catch (e) {
    if (e?.name !== "SupabaseConfigError") throw e;
    return <ConfigError message={e.message} />;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>{createApp()}</StrictMode>,
);
