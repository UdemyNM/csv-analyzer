// 対象: src/styles.css（共通CSS）
// 仕様: docs/05 7 章「デザインの基本」、8 章「タッチ領域は 44px 以上」「文字のコントラストは 4.5:1 以上」
// jsdom は CSS を適用しないため、ファイルの中身（トークン・規則）を文字列として確かめる。
// 配色の値は docs/05 7 章のとおり（アクセントは「変更可」だが、既定の #2A55D6 を固定した）。
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// jsdom 環境では import.meta.url が file: にならないため、プロジェクト直下（vitest の実行位置）から引く
const CSS_URL = resolve(process.cwd(), 'src/styles.css')
const css = () => readFileSync(CSS_URL, "utf8");

const hasColor = (hex) => css().toLowerCase().includes(hex.toLowerCase());

// WCAG 2.x の相対輝度とコントラスト比
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("styles.css: ファイルと配色", () => {
  it("src/styles.css がある", () => {
    expect(existsSync(CSS_URL)).toBe(true);
  });

  it.each([
    ["背景", "#F6F7F9"],
    ["面", "#FFFFFF"],
    ["枠線", "#DDE1E8"],
    ["文字", "#1B2130"],
    ["補助文字", "#566075"],
    ["アクセント", "#2A55D6"],
    ["公開バッジの背景", "#E3F4EC"],
    ["公開バッジの文字", "#12603A"],
  ])("%s %s を定義している", (_name, hex) => {
    expect(hasColor(hex)).toBe(true);
  });
});

describe("styles.css: フォント・角丸・タッチ領域", () => {
  it("フォントは Noto Sans JP（代替に sans-serif を添える）", () => {
    expect(css()).toMatch(/font-family\s*:[^;]*Noto Sans JP[^;]*sans-serif/i);
  });

  it("角丸はカード 12px、ボタン・入力 8px", () => {
    expect(css()).toMatch(/(border-radius|--radius[\w-]*)\s*:\s*12px/i);
    expect(css()).toMatch(/(border-radius|--radius[\w-]*)\s*:\s*8px/i);
  });

  it("タッチ領域 44px を min-height で確保する規則がある", () => {
    expect(css()).toMatch(/44px/);
    expect(css()).toMatch(/min-height\s*:/i);
  });
});

describe("styles.css: コントラスト 4.5:1 以上（配色の組み合わせ）", () => {
  it.each([
    ["文字 / 背景", "#1B2130", "#F6F7F9"],
    ["文字 / 面", "#1B2130", "#FFFFFF"],
    ["補助文字 / 面", "#566075", "#FFFFFF"],
    ["補助文字 / 背景", "#566075", "#F6F7F9"],
    ["白文字 / アクセント", "#FFFFFF", "#2A55D6"],
    ["公開バッジの文字 / 背景", "#12603A", "#E3F4EC"],
  ])("%s", (_name, fg, bg) => {
    // CSS にこの色が定義されていることが前提
    expect(hasColor(fg)).toBe(true);
    expect(hasColor(bg)).toBe(true);
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
