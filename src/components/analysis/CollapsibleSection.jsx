import { useId, useState } from "react";

/**
 * 見出し右端の開閉ボタンで表示/非表示を切り替えるセクション（初期は開いている）。
 * details/summary で作る（docs/05 3 章）。閉じても中身は DOM に残り、ブラウザが非表示にする
 * （aria-controls の参照先が常に存在し、region の名前も解決される）。
 * 見出し行のどこを押しても開閉する（ボタンのクリックも行に伝わる）。
 * キーボードでは右端の開閉ボタンだけに止まる（summary は tabIndex=-1。Tab の止まる所が
 * 1 セクションに 2 つでき、同じ開閉を 2 回読み上げるのを防ぐ）。
 * 開閉の状態は state で持ち、summary の標準の切替は止める（aria-expanded と常に一致させるため）。
 */
export function CollapsibleSection({ title, children }) {
  const [open, setOpen] = useState(true);
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const regionId = `${baseId}-region`;

  return (
    <details className="card section" open={open}>
      <summary
        className="section__header"
        tabIndex={-1}
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        <h2 id={headingId} className="section__title">
          {title}
        </h2>
        <button
          type="button"
          className="section__toggle"
          aria-expanded={open}
          aria-controls={regionId}
          aria-label={`${title}を${open ? "閉じる" : "開く"}`}
        >
          <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>
      </summary>
      <div
        id={regionId}
        role="region"
        aria-labelledby={headingId}
        className="section__body"
      >
        {children}
      </div>
    </details>
  );
}
