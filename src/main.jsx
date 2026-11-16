import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { LocalAuth } from "./repositories/local/LocalAuth.js";
import { LocalDatasetRepository } from "./repositories/local/LocalDatasetRepository.js";
import { LocalViewRepository } from "./repositories/local/LocalViewRepository.js";

// Local 実装（IndexedDB）用の擬似ユーザー。開発・動作確認用で、Supabase 移行（Phase 8）で置き換える。
const DEMO_USERS = [
  {
    id: "u-alice",
    email: "alice@example.com",
    password: "alice-pass",
    displayName: "Alice",
  },
  {
    id: "u-bob",
    email: "bob@example.com",
    password: "bob-pass",
    displayName: "Bob",
  },
  {
    id: "u-carol",
    email: "carol@example.com",
    password: "carol-pass",
    displayName: "Carol",
  },
];
const DB_NAME = "csv-analyzer";

const auth = new LocalAuth({ users: DEMO_USERS });
const datasets = new LocalDatasetRepository({ auth, dbName: DB_NAME });
const views = new LocalViewRepository({ auth, dbName: DB_NAME });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App auth={auth} datasets={datasets} views={views} />
  </StrictMode>,
);
