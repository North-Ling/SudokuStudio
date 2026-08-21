import { littleKillerTargetVertex } from "./geometry";
import { maximumStandardSum } from "./grid";
import { isFortressCell } from "./model";
import type {
  CellRef,
  DiagonalDirection,
  EdgeData,
  GridSide,
  LineConstraint,
  LookoutAnchor,
  Puzzle,
} from "./types";
import { cellTokenNumericValue } from "./tokens";

// ----------------------------------------------------------------------------
// 约束的局部判错：只针对「刚填入的某个格子」，判断它是否让某个约束明确不成立。
// 不做全局求解 / 唯一解校验。
// ----------------------------------------------------------------------------

function inBounds(p: Puzzle, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < p.grid.rows && c < p.grid.cols;
}

function pathFullyInBounds(p: Puzzle, cells: Array<readonly [number, number]>): boolean {
  return cells.every(([r, c]) => inBounds(p, r, c));
}

/** 单元格 token 的数值语义；自定义非数字 token 返回 null。 */
function num(p: Puzzle, r: number, c: number): number | null {
  if (!inBounds(p, r, c)) return null;
  const v = p.cells[r][c].value;
  if (v === "") return null;
  return cellTokenNumericValue(v, p.grid);
}

/**
 * 标准数独基础判错：给定格子的候选 token，是否与同行 / 列 / 宫的确定数字重复。
 * 用于候选（角标 / 中标）的可行性提示。
 */
export function hasStandardPeerConflict(
  p: Puzzle,
  r: number,
  c: number,
  token: string,
): boolean {
  const { rows, cols, validationMode, boxRows, boxCols } = p.grid;
  for (let cc = 0; cc < cols; cc++) {
    if (cc !== c && p.cells[r][cc].value === token) return true;
  }
  for (let rr = 0; rr < rows; rr++) {
    if (rr !== r && p.cells[rr][c].value === token) return true;
  }
  if (validationMode === "row-column-region" && boxRows && boxCols) {
    const br = Math.floor(r / boxRows) * boxRows;
    const bc = Math.floor(c / boxCols) * boxCols;
    for (let rr = br; rr < br + boxRows; rr++) {
      for (let cc = bc; cc < bc + boxCols; cc++) {
        if ((rr !== r || cc !== c) && p.cells[rr][cc].value === token) return true;
      }
    }
  }
  return false;
}

function lineContains(line: LineConstraint, r: number, c: number): boolean {
  return line.cells.some(([cr, cc]) => cr === r && cc === c);
}

// ----------------------------------------------------------------------------
// 全局约束
// ----------------------------------------------------------------------------

function checkDiagonal(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("diagonal") || !p.globalConstraints.diagonal) return null;
  const v = p.cells[r][c].value;
  if (v === "") return null;
  const { rows, cols } = p.grid;
  if (r === c) {
    for (let i = 0; i < rows; i++) {
      if (i !== r && p.cells[i][i].value === v) return "diagonal";
    }
  }
  if (r + c === cols - 1) {
    for (let i = 0; i < rows; i++) {
      const cc = cols - 1 - i;
      if (!(i === r && cc === c) && p.cells[i][cc].value === v) return "diagonal";
    }
  }
  return null;
}

function checkAntiKnight(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("anti-knight") || !p.globalConstraints.antiKnight) return null;
  const v = p.cells[r][c].value;
  if (v === "") return null;
  const moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [dr, dc] of moves) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(p, nr, nc) && p.cells[nr][nc].value === v) return "anti-knight";
  }
  return null;
}

function checkAntiKing(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("anti-king") || !p.globalConstraints.antiKing) return null;
  const v = p.cells[r][c].value;
  if (v === "") return null;
  const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diags) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(p, nr, nc) && p.cells[nr][nc].value === v) return "anti-king";
  }
  return null;
}

function checkNonConsecutive(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("non-consecutive") || !p.globalConstraints.nonConsecutive) return null;
  const n = num(p, r, c);
  if (n == null) return null;
  const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of ortho) {
    const m = num(p, r + dr, c + dc);
    if (m != null && Math.abs(m - n) === 1) return "non-consecutive";
  }
  return null;
}

function checkFortress(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("fortress") || p.fortressCells.length === 0) return null;
  const hereIsFortress = isFortressCell(p, r, c);
  const hereValue = num(p, r, c);
  if (hereValue == null) return null;
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(p, nr, nc)) continue;
    const neighborIsFortress = isFortressCell(p, nr, nc);
    if (neighborIsFortress === hereIsFortress) continue;
    const neighborValue = num(p, nr, nc);
    if (neighborValue == null) continue;
    const fortressValue = hereIsFortress ? hereValue : neighborValue;
    const outsideValue = hereIsFortress ? neighborValue : hereValue;
    if (fortressValue <= outsideValue) return "fortress";
  }
  return null;
}

// ----------------------------------------------------------------------------
// 边符号（黑白点 / 不等号 / XV）
// ----------------------------------------------------------------------------

function checkEdgeSymbols(p: Puzzle, r: number, c: number, disabled: Set<string>): string[] {
  const { rows, cols } = p.grid;
  const edges: Array<{ edge: EdgeData; a: CellRef; b: CellRef }> = [];
  if (c < cols - 1) edges.push({ edge: p.edgeH[r][c], a: [r, c], b: [r, c + 1] });
  if (c - 1 >= 0) edges.push({ edge: p.edgeH[r][c - 1], a: [r, c - 1], b: [r, c] });
  if (r < rows - 1) edges.push({ edge: p.edgeV[r][c], a: [r, c], b: [r + 1, c] });
  if (r - 1 >= 0) edges.push({ edge: p.edgeV[r - 1][c], a: [r - 1, c], b: [r, c] });

  const result: string[] = [];
  for (const { edge, a, b } of edges) {
    const sym = edge.symbol;
    if (!sym) continue;
    const na = num(p, a[0], a[1]);
    const nb = num(p, b[0], b[1]);
    if (na == null || nb == null) continue;

    if (sym.kind === "dot") {
      const key = sym.color === "white" ? "white-dot" : "black-dot";
      if (disabled.has(key)) continue;
      const ok = sym.color === "white"
        ? Math.abs(na - nb) === 1
        : na === nb * 2 || nb === na * 2;
      if (!ok) result.push(key);
    } else if (sym.kind === "ineq") {
      if (disabled.has("inequality")) continue;
      const ok = sym.greater === "first" ? na > nb : nb > na;
      if (!ok) result.push("inequality");
    } else if (sym.kind === "vx") {
      if (disabled.has("vx")) continue;
      const target = sym.value === "V" ? 5 : 10;
      if (na + nb !== target) result.push("vx");
    }
  }
  return result;
}

// ----------------------------------------------------------------------------
// 温度计 / 箭头
// ----------------------------------------------------------------------------

function checkThermo(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("thermometer")) return null;
  for (const thermo of p.thermos) {
    if (!pathFullyInBounds(p, thermo.cells)) continue;
    if (!thermo.cells.some(([cr, cc]) => cr === r && cc === c)) continue;
    const filled: number[] = [];
    for (const [cr, cc] of thermo.cells) {
      const n = num(p, cr, cc);
      if (n != null) filled.push(n);
    }
    for (let i = 1; i < filled.length; i++) {
      if (filled[i] <= filled[i - 1]) return "thermometer";
    }
  }
  return null;
}

function checkArrow(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("arrow")) return null;
  for (const arrow of p.arrows) {
    if (!pathFullyInBounds(p, arrow.cells)) continue;
    if (!arrow.cells.some(([cr, cc]) => cr === r && cc === c)) continue;
    if (arrow.cells.length < 2) continue;
    const [hr, hc] = arrow.cells[0];
    const circle = num(p, hr, hc);
    if (circle == null) continue;
    let sum = 0;
    let complete = true;
    for (let i = 1; i < arrow.cells.length; i++) {
      const n = num(p, arrow.cells[i][0], arrow.cells[i][1]);
      if (n == null) { complete = false; continue; }
      sum += n;
    }
    if (sum > circle || (complete && sum !== circle)) return "arrow";
  }
  return null;
}

// ----------------------------------------------------------------------------
// 格中心线路约束（局部可判的子集）
// ----------------------------------------------------------------------------

function lineIndex(line: LineConstraint, r: number, c: number): number {
  return line.cells.findIndex(([cr, cc]) => cr === r && cc === c);
}

function checkLine(p: Puzzle, line: LineConstraint, r: number, c: number): boolean {
  const cells = line.cells;
  if (!pathFullyInBounds(p, cells)) return false;
  const n = cells.length;
  const idx = lineIndex(line, r, c);
  if (idx < 0) return false;
  const value = num(p, r, c);

  if (line.kind === "german-whisper" || line.kind === "dutch-whisper") {
    const minDiff = line.kind === "german-whisper" ? 5 : 4;
    if (value == null) return false;
    for (const j of [idx - 1, idx + 1]) {
      if (j < 0 || j >= n) continue;
      const m = num(p, cells[j][0], cells[j][1]);
      if (m != null && Math.abs(m - value) < minDiff) return true;
    }
    return false;
  }

  if (line.kind === "parity") {
    if (value == null) return false;
    for (const j of [idx - 1, idx + 1]) {
      if (j < 0 || j >= n) continue;
      const m = num(p, cells[j][0], cells[j][1]);
      if (m != null && (m % 2) === (value % 2)) return true;
    }
    return false;
  }

  if (line.kind === "between") {
    if (value == null || n < 3 || idx === 0 || idx === n - 1) return false;
    const e1 = num(p, cells[0][0], cells[0][1]);
    const e2 = num(p, cells[n - 1][0], cells[n - 1][1]);
    if (e1 == null || e2 == null) return false;
    const lo = Math.min(e1, e2);
    const hi = Math.max(e1, e2);
    return value < lo || value > hi;
  }

  if (line.kind === "palindrome") {
    if (value == null) return false;
    const mirror = n - 1 - idx;
    if (mirror < 0 || mirror >= n || mirror === idx) return false;
    const m = num(p, cells[mirror][0], cells[mirror][1]);
    return m != null && m !== value;
  }

  if (line.kind === "zipper") {
    const mid = (n - 1) / 2;
    const pairSums: number[] = [];
    let centerValue: number | null = null;
    for (let i = 0; i <= mid; i++) {
      const j = n - 1 - i;
      if (i === j) {
        const center = num(p, cells[i][0], cells[i][1]);
        if (center != null) centerValue = center;
      } else {
        const ni = num(p, cells[i][0], cells[i][1]);
        const nj = num(p, cells[j][0], cells[j][1]);
        if (ni != null && nj != null) pairSums.push(ni + nj);
      }
    }
    for (let i = 1; i < pairSums.length; i++) {
      if (pairSums[i] !== pairSums[0]) return true;
    }
    if (centerValue != null && pairSums.length > 0 && centerValue !== pairSums[0]) return true;
    return false;
  }

  if (line.kind === "renban") {
    const seen = new Set<number>();
    const values: number[] = [];
    for (const [cr, cc] of cells) {
      const v = num(p, cr, cc);
      if (v == null) continue;
      if (seen.has(v)) return true;
      seen.add(v);
      values.push(v);
    }
    if (values.length >= 2) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (max - min + 1 > n) return true;
    }
    return false;
  }

  if (line.kind === "entropy") {
    for (let start = Math.max(0, idx - 2); start <= Math.min(idx, n - 3); start++) {
      const bands: number[] = [];
      for (let k = start; k < start + 3; k++) {
        const v = num(p, cells[k][0], cells[k][1]);
        if (v == null) continue;
        bands.push(v <= 3 ? 0 : v <= 6 ? 1 : 2);
      }
      if (new Set(bands).size !== bands.length) return true;
    }
    return false;
  }

  if (line.kind === "region-sum") {
    const { boxRows, boxCols } = p.grid;
    if (!boxRows || !boxCols) return false;
    const groups = new Map<string, { sum: number; complete: boolean }>();
    for (const [cr, cc] of cells) {
      const key = `${Math.floor(cr / boxRows)},${Math.floor(cc / boxCols)}`;
      const g = groups.get(key) ?? { sum: 0, complete: true };
      const v = num(p, cr, cc);
      if (v == null) g.complete = false;
      else g.sum += v;
      groups.set(key, g);
    }
    const full: number[] = [];
    for (const g of groups.values()) {
      if (g.complete) full.push(g.sum);
    }
    for (let i = 1; i < full.length; i++) {
      if (full[i] !== full[0]) return true;
    }
    return false;
  }

  if (line.kind === "ten-sum") {
    let sum = 0;
    for (const [cr, cc] of cells) {
      const v = num(p, cr, cc);
      if (v == null) { sum = 0; continue; }
      sum += v;
      if (sum > 10) return true;
      if (sum === 10) sum = 0;
    }
    return false;
  }

  if (line.kind === "anti-factor") {
    const len = n;
    for (const [cr, cc] of cells) {
      const v = num(p, cr, cc);
      if (v == null || v === 1) continue;
      if (len % v === 0 || v % len === 0) return true;
    }
    return false;
  }

  return false;
}

// ----------------------------------------------------------------------------
// Killer 笼
// ----------------------------------------------------------------------------

function checkCage(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  for (const cage of p.cages) {
    if (!cage.cells.some(([cr, cc]) => cr === r && cc === c)) continue;
    const relation = cage.relation ?? (cage.sum == null ? "none" : "equal");
    if (relation === "none" || relation === "custom" || cage.sum == null) continue;
    const key = relation === "equal" ? "cage-equal" : relation === "at-least" ? "cage-at-least" : "cage-at-most";
    if (disabled.has(key)) continue;

    let sum = 0;
    let complete = true;
    for (const [cr, cc] of cage.cells) {
      const n = num(p, cr, cc);
      if (n == null) { complete = false; continue; }
      sum += n;
    }
    if (relation === "equal" && (complete ? sum !== cage.sum : sum > cage.sum)) return "cage-equal";
    if (relation === "at-least" && complete && sum < cage.sum) return "cage-at-least";
    if (relation === "at-most" && sum > cage.sum) return "cage-at-most";
  }
  return null;
}

// ----------------------------------------------------------------------------
// 瞭望塔
// ----------------------------------------------------------------------------

function anchorNeighbors(p: Puzzle, anchor: LookoutAnchor): CellRef[] {
  const result: CellRef[] = [];
  const add = (r: number, c: number) => {
    if (inBounds(p, r, c)) result.push([r, c]);
  };
  if (anchor.kind === "corner") {
    add(anchor.r - 1, anchor.c - 1);
    add(anchor.r - 1, anchor.c);
    add(anchor.r, anchor.c - 1);
    add(anchor.r, anchor.c);
  } else if (anchor.kind === "edgeH") {
    add(anchor.r, anchor.c);
    add(anchor.r, anchor.c + 1);
  } else if ("side" in anchor && anchor.side === "top") {
    add(0, anchor.index);
  } else if ("side" in anchor && anchor.side === "bottom") {
    add(p.grid.rows - 1, anchor.index);
  } else if ("side" in anchor && anchor.side === "left") {
    add(anchor.index, 0);
  } else if ("side" in anchor) {
    add(anchor.index, p.grid.cols - 1);
  } else {
    add(anchor.r, anchor.c);
    add(anchor.r + 1, anchor.c);
  }
  return result;
}

function checkLookout(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("lookout")) return null;
  for (const clue of p.lookouts) {
    const neighbors = anchorNeighbors(p, clue.anchor);
    if (!neighbors.some(([nr, nc]) => nr === r && nc === c)) continue;
    for (const digit of clue.digits) {
      const found = neighbors.some(([nr, nc]) => p.cells[nr][nc].value === digit);
      if (!found) return "lookout";
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// 盘外约束（摩天楼 / X 和 / 小杀手）
// ----------------------------------------------------------------------------

function skyscraperCells(p: Puzzle, side: GridSide, index: number): CellRef[] {
  const { rows, cols } = p.grid;
  const cells: CellRef[] = [];
  if (side === "top") for (let r = 0; r < rows; r++) cells.push([r, index]);
  else if (side === "bottom") for (let r = rows - 1; r >= 0; r--) cells.push([r, index]);
  else if (side === "left") for (let c = 0; c < cols; c++) cells.push([index, c]);
  else for (let c = cols - 1; c >= 0; c--) cells.push([index, c]);
  return cells;
}

function countVisible(values: number[]): number {
  let visible = 0;
  let max = 0;
  for (const v of values) {
    if (v > max) { visible++; max = v; }
  }
  return visible;
}

function littleKillerCells(
  p: Puzzle,
  anchor: { r: number; c: number },
  direction: DiagonalDirection,
): CellRef[] {
  const target = littleKillerTargetVertex(anchor, direction, p.grid.rows, p.grid.cols);
  if (!target) return [];
  const diagonalRC = direction === "down-right" || direction === "up-left";
  const constant = diagonalRC ? target.r - target.c : target.r + target.c;
  const cells: CellRef[] = [];
  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      if ((diagonalRC ? r - c : r + c) === constant) cells.push([r, c]);
    }
  }
  return cells;
}

function checkSkyscraper(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("skyscraper")) return null;
  for (const clue of p.skyscrapers) {
    const cells = skyscraperCells(p, clue.side, clue.index);
    if (clue.value < 1 || clue.value > cells.length) continue;
    if (!cells.some(([cr, cc]) => cr === r && cc === c)) continue;
    if (!cells.every(([cr, cc]) => num(p, cr, cc) != null)) continue;
    const values = cells.map(([cr, cc]) => num(p, cr, cc)!);
    if (countVisible(values) !== clue.value) return "skyscraper";
  }
  return null;
}

function checkXSum(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("x-sum")) return null;
  for (const clue of p.xSums) {
    if (clue.value < 1 || clue.value > maximumStandardSum(p.grid)) continue;
    const cells = skyscraperCells(p, clue.side, clue.index);
    if (!cells.some(([cr, cc]) => cr === r && cc === c)) continue;
    const first = num(p, cells[0][0], cells[0][1]);
    if (first == null || first < 1 || first > cells.length) continue;
    const prefix = cells.slice(0, first);
    let sum = 0;
    let complete = true;
    for (const [cr, cc] of prefix) {
      const v = num(p, cr, cc);
      if (v == null) { complete = false; continue; }
      sum += v;
    }
    if (sum > clue.value || (complete && sum !== clue.value)) return "x-sum";
  }
  return null;
}

function checkLittleKiller(p: Puzzle, r: number, c: number, disabled: Set<string>): string | null {
  if (disabled.has("little-killer")) return null;
  for (const clue of p.littleKillers) {
    if (clue.value < 1 || clue.value > maximumStandardSum(p.grid)) continue;
    const cells = littleKillerCells(p, clue.anchor, clue.direction);
    if (!cells.some(([cr, cc]) => cr === r && cc === c)) continue;
    let sum = 0;
    let complete = true;
    for (const [cr, cc] of cells) {
      const v = num(p, cr, cc);
      if (v == null) { complete = false; continue; }
      sum += v;
    }
    if (sum > clue.value || (complete && sum !== clue.value)) return "little-killer";
  }
  return null;
}

// ----------------------------------------------------------------------------
// 入口
// ----------------------------------------------------------------------------

/**
 * 返回给定格子违反的约束规则 key（与约束介绍卡片的 key 一致）。
 * 只做局部判错，不判断全局是否有解。
 */
export function findViolatedRules(
  puzzle: Puzzle,
  cell: CellRef,
  disabled: Set<string>,
): string[] {
  const [r, c] = cell;
  const result: string[] = [];
  const push = (key: string | null) => {
    if (key && !result.includes(key)) result.push(key);
  };

  push(checkDiagonal(puzzle, r, c, disabled));
  push(checkAntiKnight(puzzle, r, c, disabled));
  push(checkAntiKing(puzzle, r, c, disabled));
  push(checkNonConsecutive(puzzle, r, c, disabled));
  push(checkFortress(puzzle, r, c, disabled));
  for (const key of checkEdgeSymbols(puzzle, r, c, disabled)) push(key);
  push(checkThermo(puzzle, r, c, disabled));
  push(checkArrow(puzzle, r, c, disabled));
  push(checkCage(puzzle, r, c, disabled));
  push(checkLookout(puzzle, r, c, disabled));
  push(checkSkyscraper(puzzle, r, c, disabled));
  push(checkXSum(puzzle, r, c, disabled));
  push(checkLittleKiller(puzzle, r, c, disabled));

  for (const line of puzzle.lines) {
    if (line.kind === "custom") continue;
    const key = `line-${line.kind}`;
    if (disabled.has(key) || !lineContains(line, r, c)) continue;
    if (checkLine(puzzle, line, r, c)) push(key);
  }

  return result;
}

/** 判错使用的 key 集合，未在此列出的规则不参与判错。 */
export function validatableRuleKeys(): string[] {
  return [
    "diagonal",
    "anti-knight",
    "anti-king",
    "non-consecutive",
    "fortress",
    "white-dot",
    "black-dot",
    "inequality",
    "vx",
    "thermometer",
    "arrow",
    "cage-equal",
    "cage-at-least",
    "cage-at-most",
    "lookout",
    "line-german-whisper",
    "line-dutch-whisper",
    "line-parity",
    "line-between",
    "line-palindrome",
    "line-zipper",
    "line-renban",
    "line-entropy",
    "line-region-sum",
    "line-ten-sum",
    "line-anti-factor",
    "skyscraper",
    "x-sum",
    "little-killer",
  ];
}
