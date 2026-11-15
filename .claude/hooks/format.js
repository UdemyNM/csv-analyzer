// PostToolUse hook: 編集したファイルを Prettier で整える
// Prettier が未導入なら何もしない（ライブラリは自動で追加しない）
const { spawnSync } = require("node:child_process");
const path = require("node:path");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let file = "";
  try {
    file = JSON.parse(raw).tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  if (!file) process.exit(0);

  const target = path.resolve(file);
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const rel = path.relative(root, target).split(path.sep).join("/");

  const supported = /\.(jsx?|tsx?|json|css|html|md)$/i.test(rel);
  const skipped = rel.startsWith("..") || /^(node_modules|\.claude|\.scratchpad)\//.test(rel);
  if (!supported || skipped) process.exit(0);

  const result = spawnSync("npx", ["--no-install", "prettier", "--write", target], {
    cwd: root,
    shell: true,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    // 失敗しても作業は止めない
    console.error("Prettier をスキップしました（未導入、または整形に失敗）");
  }
  process.exit(0);
});
