import { cellKey } from "./geometry";
import type { CellRef, Puzzle } from "./types";

/**
 * 返回违反标准数独规则的格子：任意非空字符在同行、同列、同宫中不能重复。
 * 同一组里出现重复时会标记所有冲突格，而不只标记最后输入的格子。
 */
export function findStandardRuleConflicts(puzzle: Puzzle): Set<string> {
  const conflicts = new Set<string>();
  const { rows, cols, validationMode, boxRows, boxCols } = puzzle.grid;
  if (validationMode === "none") return conflicts;

  const checkGroup = (cells: CellRef[]) => {
    const positions = new Map<string, CellRef[]>();
    for (const [r, c] of cells) {
      const value = puzzle.cells[r][c].value;
      if (value === "") continue;
      const existing = positions.get(value);
      if (existing) existing.push([r, c]);
      else positions.set(value, [[r, c]]);
    }
    for (const duplicated of positions.values()) {
      if (duplicated.length < 2) continue;
      for (const [r, c] of duplicated) conflicts.add(cellKey(r, c));
    }
  };

  for (let r = 0; r < rows; r++) {
    checkGroup(Array.from({ length: cols }, (_, c) => [r, c] as CellRef));
  }
  for (let c = 0; c < cols; c++) {
    checkGroup(Array.from({ length: rows }, (_, r) => [r, c] as CellRef));
  }
  if (validationMode !== "row-column-region" || !boxRows || !boxCols) {
    return conflicts;
  }
  for (let boxR = 0; boxR < rows; boxR += boxRows) {
    for (let boxC = 0; boxC < cols; boxC += boxCols) {
      const cells: CellRef[] = [];
      for (let dr = 0; dr < boxRows; dr++) {
        for (let dc = 0; dc < boxCols; dc++) cells.push([boxR + dr, boxC + dc]);
      }
      checkGroup(cells);
    }
  }

  return conflicts;
}
