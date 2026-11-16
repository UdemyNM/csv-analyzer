import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCsvAnalysis } from "../../hooks/useCsvAnalysis.js";

export const MAX_BYTES = 10 * 1024 * 1024; // docs/01 FR-10「10MBまで」

const MESSAGES = {
  extension: "CSVファイル（.csv）を選んでください。",
  empty: "データがありません。中身のあるCSVファイルを選んでください。",
  header:
    "ヘッダー（1行目の列名）がありません。1行目に列名があるCSVファイルを選んでください。",
  size: "ファイルが大きすぎます。10MBまでのCSVファイルを選んでください。",
};

/** 取り込めない理由（メッセージ）。取り込めるなら null。 */
function validate(file) {
  if (!file.name.toLowerCase().endsWith(".csv")) return MESSAGES.extension;
  if (file.size === 0) return MESSAGES.empty;
  if (file.size > MAX_BYTES) return MESSAGES.size;
  return null;
}

const hasFiles = (event) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

/**
 * CSV のドロップ枠。落とす／「ファイルを選ぶ」で選ぶと、検証 → パース → 保存（非公開）をして、
 * 分析画面（/datasets/:id）へ移る。失敗したら理由を枠の中に出し、移動しない。
 */
export function DropZone({ datasets, createWorker }) {
  const navigate = useNavigate();
  const { parse } = useCsvAnalysis({ createWorker });
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file || busyRef.current) return;
    const problem = validate(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    busyRef.current = true;
    setBusy(true);
    try {
      let meta;
      try {
        // 保存に要るのは行数・文字コード・列の型だけ。行は分析画面が改めてパースするので、ここでは受け取らない
        const { encoding, rowCount, columns } = await parse(
          await file.arrayBuffer(),
          { metaOnly: true },
        );
        meta = { rowCount, encoding, columns };
      } catch (e) {
        throw e?.name === "EmptyCsvError"
          ? new Error(MESSAGES.empty)
          : e?.name === "MissingHeaderError"
            ? new Error(MESSAGES.header)
            : new Error(`CSVを読み込めませんでした。${e?.message ?? ""}`);
      }
      let dataset;
      try {
        dataset = await datasets.create({
          name: file.name,
          visibility: "private",
          file,
          meta,
        });
      } catch (e) {
        throw new Error(`保存できませんでした。${e?.message ?? ""}`);
      }
      navigate(`/datasets/${dataset.id}`, { state: { justUploaded: true } });
    } catch (e) {
      setError(e.message);
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleDragOver(event) {
    if (!hasFiles(event)) return;
    event.preventDefault(); // これが無いと、ブラウザがファイルを開いてしまう
    setDragging(true);
  }

  function handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return; // 枠の中の部品へ動いただけ
    setDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer?.files?.[0]);
  }

  function handleSelect(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = ""; // 同じファイルをもう一度選べるようにする
    handleFile(file);
  }

  return (
    <div
      data-testid="drop-zone"
      className={`drop-zone${dragging ? " drop-zone--active" : ""}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <p className="drop-zone__hint" aria-live="polite">
        {dragging
          ? "ここで離すと、分析を始めます"
          : "CSVファイルをここにドラッグ＆ドロップ"}
      </p>
      <button
        type="button"
        className="btn btn-primary btn-large"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        ファイルを選ぶ
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={handleSelect}
      />
      <p className="drop-zone__note muted">.csv ・ 10MBまで</p>
      {busy && (
        <p role="status" className="muted">
          読み込んでいます…
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </div>
  );
}
