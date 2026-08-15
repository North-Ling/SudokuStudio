import type { GridSpec, StandardGridSize } from "./types";

export interface StandardGridPreset {
  size: StandardGridSize;
  boxRows: number;
  boxCols: number;
}

export const STANDARD_GRID_PRESETS: readonly StandardGridPreset[] = [
  { size: 6, boxRows: 2, boxCols: 3 },
  { size: 8, boxRows: 2, boxCols: 4 },
  { size: 9, boxRows: 3, boxCols: 3 },
  { size: 12, boxRows: 3, boxCols: 4 },
  { size: 16, boxRows: 4, boxCols: 4 },
];

const SYMBOLS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "A", "B", "C", "D", "E", "F", "G",
] as const;
const LETTER_SYMBOLS = "ABCDEFGHIJKLMNOP".split("");

export function standardPresetFor(rows: number, cols: number): StandardGridPreset | null {
  if (rows !== cols) return null;
  return STANDARD_GRID_PRESETS.find((preset) => preset.size === rows) ?? null;
}

export function createGridSpec(
  rows = 9,
  cols = rows,
  useStandardRegions = true,
): GridSpec {
  const safeRows = Math.max(1, Math.min(16, Math.round(rows)));
  const safeCols = Math.max(1, Math.min(16, Math.round(cols)));
  const preset = standardPresetFor(safeRows, safeCols);
  if (!preset) {
    return {
      rows: safeRows,
      cols: safeCols,
      preset: null,
      regionMode: "none",
      validationMode: "none",
    };
  }
  return {
    rows: safeRows,
    cols: safeCols,
    preset: preset.size,
    regionMode: useStandardRegions ? "standard" : "none",
    boxRows: useStandardRegions ? preset.boxRows : undefined,
    boxCols: useStandardRegions ? preset.boxCols : undefined,
    validationMode: useStandardRegions ? "row-column-region" : "row-column",
  };
}

export function normalizeGridSpec(
  raw: Partial<GridSpec> | null | undefined,
  fallbackRows = 9,
  fallbackCols = 9,
): GridSpec {
  const rows = Number.isFinite(raw?.rows) ? Number(raw?.rows) : fallbackRows;
  const cols = Number.isFinite(raw?.cols) ? Number(raw?.cols) : fallbackCols;
  const preset = standardPresetFor(Math.round(rows), Math.round(cols));
  const wantsRegions = preset != null && raw?.regionMode !== "none";
  return createGridSpec(rows, cols, wantsRegions);
}

export function gridTokens(grid: GridSpec): string[] {
  return SYMBOLS.slice(0, Math.max(grid.rows, grid.cols));
}

export function letterGridTokens(grid: GridSpec): string[] {
  return LETTER_SYMBOLS.slice(0, Math.max(grid.rows, grid.cols));
}

export function candidateGridShape(grid: GridSpec): { rows: number; cols: number } {
  const preset = standardPresetFor(grid.rows, grid.cols);
  if (preset) return { rows: preset.boxRows, cols: preset.boxCols };
  const count = Math.max(grid.rows, grid.cols);
  const cols = Math.ceil(Math.sqrt(count));
  return { rows: Math.ceil(count / cols), cols };
}

export function maximumStandardSum(grid: GridSpec): number {
  const size = Math.max(grid.rows, grid.cols);
  return size * (size + 1) / 2;
}

export function validationDescription(grid: GridSpec): string {
  if (grid.validationMode === "row-column-region") return "行 / 列 / 宫冲突自动标红";
  if (grid.validationMode === "row-column") return "仅行 / 列冲突自动标红";
  return "自由网格：不启用自动判错";
}
