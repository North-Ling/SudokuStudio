import type {
  CellRef,
  EdgeData,
  LineConstraint,
  LookoutAnchor,
  Puzzle,
} from "./types";

// ----------------------------------------------------------------------------
// 约束的局部判错：只针对「刚填入的某个格子」，判断它是否让某个约束明确不成立。
// 不做全局求解 / 唯一解校验。
// ----------------------------------------------------------------------------

function inBounds(p: Puzzle, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < p.grid.rows && c < p.grid.cols;
}

/** 单元格数字值；非数字（空 / 字母等）返回 null。 */
function num(p: Puzzle, r: number, c: number): number | null {
  if (!inBounds(p, r, c)) return null;
  const v = p.cells[r][c].value;
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  for (const key of checkEdgeSymbols(puzzle, r, c, disabled)) push(key);
  push(checkThermo(puzzle, r, c, disabled));
  push(checkArrow(puzzle, r, c, disabled));
  push(checkCage(puzzle, r, c, disabled));
  push(checkLookout(puzzle, r, c, disabled));

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
  ];
}
