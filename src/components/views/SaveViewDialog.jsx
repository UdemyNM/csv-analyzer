import { useEffect, useId, useRef, useState } from "react";
import { findMissingColumns } from "./viewConfig.js";

/**
 * ビューの保存・編集ダイアログ。マウントされている間だけ開いている（開閉は親）。
 * 「保存」で、config が参照する列が columnNames にあるか検証し、通れば onSubmit(名前)。
 * 通らなければ onSubmit を呼ばず、alert に理由（存在しない列名）を出す。
 * 保存の実行（Repository の create / update）と、成功後に閉じることは親の責務。
 * submitError: 親の保存が失敗したときの理由（任意）。
 */
export function SaveViewDialog({
  mode,
  initialName = "",
  config,
  columnNames,
  onSubmit,
  onCancel,
  submitError = null,
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(null);
  const titleId = useId();
  const title = mode === "edit" ? "ビューを編集" : "ビューを保存";

  // 閉じたら、開く前にフォーカスがあった所（「ビューを保存」など）へ戻す。
  // 入力欄の autoFocus より先に覚えるため、最初の描画で読む
  // （StrictMode の試しの付け外しでは戻さないよう、外れたままのときだけ戻す）
  const [opener] = useState(() => document.activeElement);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (mountedRef.current) return;
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      });
    };
  }, [opener]);

  const submit = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("ビュー名を入力してください。");
      return;
    }
    const missing = findMissingColumns(config, columnNames);
    if (missing.length > 0) {
      setError(
        `データにない列が設定に含まれているため保存できません: ${missing.join("、")}`,
      );
      return;
    }
    setError(null);
    onSubmit(trimmed);
  };

  const message = error ?? submitError;

  return (
    <div className="dialog-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog card"
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <h2 id={titleId} className="section-title">
          {title}
        </h2>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor={`${titleId}-name`}>ビュー名</label>
            <input
              id={`${titleId}-name`}
              type="text"
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {message && (
            <p role="alert" className="alert">
              {message}
            </p>
          )}
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={onCancel}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
