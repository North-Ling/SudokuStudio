import type { GridSpec } from "./types";

/** 单个格子中允许保存的最大可见字符（grapheme）数量。 */
export const MAX_CELL_TOKEN_LENGTH = 3;

const graphemeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function splitGraphemes(value: string): string[] {
  const normalized = value.normalize("NFC");
  if (!graphemeSegmenter) return Array.from(normalized);
  return Array.from(graphemeSegmenter.segment(normalized), ({ segment }) => segment);
}

/**
 * 将任意导入值规范化为格内 token。
 * 数字 0 仍按旧版 JSON 语义视为空格；字符串 "0" 可以作为通用网格字符使用。
 */
export function normalizeCellToken(value: unknown): string {
  if (value === 0 || value == null) return "";
  return splitGraphemes(String(value).trim())
    .slice(0, MAX_CELL_TOKEN_LENGTH)
    .join("");
}

/**
 * 返回 token 在算术约束中的数值语义。
 * 新题使用十进制 1…N；同时兼容旧版 12/16 宫中 A=10…G=16 的数据。
 */
export function cellTokenNumericValue(token: string, grid: GridSpec): number | null {
  const normalized = normalizeCellToken(token);
  if (/^\d{1,3}$/.test(normalized)) return Number(normalized);

  const legacy = /^[A-G]$/i.exec(normalized);
  if (!legacy) return null;
  const value = legacy[0].toUpperCase().charCodeAt(0) - "A".charCodeAt(0) + 10;
  return value <= Math.max(grid.rows, grid.cols) ? value : null;
}

/**
 * 解析瞭望塔等“多个标准 token”输入。
 * 支持 `10 11 12`、逗号分隔，也兼容旧的紧凑写法 `34`。
 */
export function parseGridTokenList(raw: string, palette: readonly string[]): string[] {
  const source = raw.trim().toUpperCase();
  if (!source) return [];
  const canonical = new Map(palette.map((token) => [token.toUpperCase(), token]));
  const separated = source.split(/[\s,，、;；]+/).filter(Boolean);
  if (separated.length > 1) {
    return separated.flatMap((token) => {
      const match = canonical.get(normalizeCellToken(token).toUpperCase());
      return match ? [match] : [];
    });
  }

  const candidates = Array.from(canonical.keys()).sort((a, b) => b.length - a.length);
  const result: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    const match = candidates.find((candidate) => source.startsWith(candidate, offset));
    if (match) {
      result.push(canonical.get(match)!);
      offset += match.length;
      continue;
    }
    const skipped = splitGraphemes(source.slice(offset))[0];
    if (!skipped) break;
    offset += skipped.length;
  }
  return result;
}
