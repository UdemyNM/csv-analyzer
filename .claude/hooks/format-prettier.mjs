// PostToolUse フック: Edit / Write したファイルを Prettier で整形する。
// Prettier が未インストールのときは何もしない（ライブラリは自動で追加しない）。
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";

const TARGET_EXT = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx",
  ".json", ".css", ".html", ".md",
]);

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path;
if (!file || !existsSync(file)) process.exit(0);
if (!TARGET_EXT.has(extname(file).toLowerCase())) process.exit(0);

const normalized = file.replaceAll("\\", "/");
if (/\/(node_modules|\.scratchpad|\.claude)\//.test(normalized)) process.exit(0);

try {
  // --no-install: 未インストールならダウンロードせず失敗させる
  execFileSync("npx", ["--no-install", "prettier", "--write", file], {
    stdio: ["ignore", "ignore", "pipe"],
    shell: process.platform === "win32",
    timeout: 20000,
  });
} catch (e) {
  const msg = e.stderr?.toString().trim();
  if (msg) console.error(`[prettier hook] ${msg}`);
}
process.exit(0);
