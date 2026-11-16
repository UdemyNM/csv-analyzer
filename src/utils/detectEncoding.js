/**
 * 文字コードを判定する（docs/03 2.1）。
 * BOM があれば UTF-8。厳密な UTF-8 デコードに成功すれば UTF-8、失敗すれば Shift_JIS。
 * @param {ArrayBuffer} buffer
 * @returns {'utf-8' | 'shift_jis'}
 */
export function detectEncoding(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "shift_jis";
  }
}
