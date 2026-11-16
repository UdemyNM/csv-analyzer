import { useState } from "react";

/**
 * 「？」の解説を、同時に 1 つだけ開くための状態。
 *
 *   const { current, toggle, close } = useHelpTerm(term, onTermChange)
 *
 * - onTermChange を渡したら、開いている用語は呼び出し側（term）が持つ（表をまたいで 1 つにしたいとき）
 * - 渡さなければ、この hook の中で持つ
 * - 開いている用語をもう一度 toggle すると閉じる
 */
export function useHelpTerm(term, onTermChange) {
  const [own, setOwn] = useState(null);
  const controlled = onTermChange !== undefined;
  const current = controlled ? (term ?? null) : own;
  const set = controlled ? onTermChange : setOwn;
  return {
    current,
    toggle: (target) => set(current === target ? null : target),
    close: () => set(null),
  };
}
