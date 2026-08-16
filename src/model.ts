import type {
  Arrow,
  CellData,
  CellRef,
  ColorName,
  CornerData,
  CornerSymbol,
  EdgeData,
  EdgeSymbol,
  DiagonalDirection,
  GridSide,
  KillerCage,
  LittleKillerClue,
  LineConstraint,
  LineConstraintKind,
  Puzzle,
  GridSpec,
  Thermo,
} from "./types";
import {
  cellKey,
  littleKillerTargetVertex,
  sortCells,
} from "./geometry";
import { createGridSpec, maximumStandardSum, normalizeGridSpec } from "./grid";

// ----------------------------------------------------------------------------
// 谜题文档的创建 / 克隆 / 序列化
// ----------------------------------------------------------------------------

export const DEFAULT_RULES = "标准数独规则适用";

function normalizeCellToken(value: unknown): string {
  if (value === 0 || value == null) return "";
  return Array.from(String(value))[0] ?? "";
}

type SerializedLittleKiller = Partial<LittleKillerClue> & {
  r?: number;
  c?: number;
};

function normalizeLittleKiller(
  raw: SerializedLittleKiller,
  grid: GridSpec,
): LittleKillerClue | null {
  const direction = raw.direction as DiagonalDirection | undefined;
  const value = Number(raw.value);
  if (!direction || !Number.isFinite(value)) return null;

  let anchor = raw.anchor;
  // 旧格式保存的是盘面边界顶点；据箭头象限还原包含它的外圈虚拟格。
  if (!anchor && Number.isFinite(raw.r) && Number.isFinite(raw.c)) {
    const down = direction.startsWith("down");
    const right = direction.endsWith("right");
    anchor = {
      r: (raw.r as number) + (down ? 0 : 1),
      c: (raw.c as number) + (right ? 0 : 1),
    };
  }
  if (!anchor || !Number.isInteger(anchor.r) || !Number.isInteger(anchor.c)) return null;
  if (anchor.r < 0 || anchor.r >= grid.rows + 2 || anchor.c < 0 || anchor.c >= grid.cols + 2) {
    return null;
  }
  if (!littleKillerTargetVertex(anchor, direction, grid.rows, grid.cols)) return null;
  return {
    anchor: { r: anchor.r, c: anchor.c },
    direction,
    value: Math.max(1, Math.min(maximumStandardSum(grid), Math.round(value))),
  };
}

function emptyCell(): CellData {
  return { value: "", given: false, corner: [], center: [], colors: [], decorations: [] };
}

function emptyEdge(): EdgeData {
  return { bold: false, symbol: null, decorations: [] };
}

function emptyCorner(): CornerData {
  return { symbols: [] };
}

export function createEmptyPuzzle(
  title = "新数独",
  grid: GridSpec = createGridSpec(),
): Puzzle {
  const cells: CellData[][] = [];
  for (let r = 0; r < grid.rows; r++) {
    const row: CellData[] = [];
    for (let c = 0; c < grid.cols; c++) row.push(emptyCell());
    cells.push(row);
  }
  const edgeH: EdgeData[][] = [];
  for (let r = 0; r < grid.rows; r++) {
    const row: EdgeData[] = [];
    for (let c = 0; c < grid.cols - 1; c++) row.push(emptyEdge());
    edgeH.push(row);
  }
  const edgeV: EdgeData[][] = [];
  for (let r = 0; r < grid.rows - 1; r++) {
    const row: EdgeData[] = [];
    for (let c = 0; c < grid.cols; c++) row.push(emptyEdge());
    edgeV.push(row);
  }
  const corners: CornerData[][] = [];
  for (let r = 0; r <= grid.rows; r++) {
    const row: CornerData[] = [];
    for (let c = 0; c <= grid.cols; c++) row.push(emptyCorner());
    corners.push(row);
  }
  return {
    title,
    rules: DEFAULT_RULES,
    difficulty: 0,
    grid,
    cells,
    edgeH,
    edgeV,
    corners,
    cages: [],
    thermos: [],
    arrows: [],
    lines: [],
    globalConstraints: {
      diagonal: false,
      antiKnight: false,
      antiKing: false,
      nonConsecutive: false,
    },
    lookouts: [],
    skyscrapers: [],
    xSums: [],
    littleKillers: [],
    solveLines: [],
    disabledRuleKeys: [],
  };
}

export function clonePuzzle(p: Puzzle): Puzzle {
  return structuredClone(p);
}

export function serializePuzzle(p: Puzzle): string {
  return JSON.stringify(p);
}

export function deserializePuzzle(json: string): Puzzle {
  const data = JSON.parse(json) as Puzzle;
  // 规范化：确保所有结构都存在（向后兼容 / 防止缺字段）
  const fallbackRows = Array.isArray(data.cells) ? data.cells.length : 9;
  const fallbackCols = Array.isArray(data.cells?.[0]) ? data.cells[0].length : 9;
  const grid = normalizeGridSpec(data.grid, fallbackRows, fallbackCols);
  const base = createEmptyPuzzle("新数独", grid);
  const normalizeLine = (line: LineConstraint): LineConstraint => ({
    ...line,
    color: line.color || undefined,
    thickness: Number.isFinite(line.thickness)
      ? Math.max(0, Math.min(100, Number(line.thickness)))
      : undefined,
    description: line.description?.trim() || undefined,
  });
  const cells = Array.from({ length: grid.rows }, (_, r) =>
    Array.from({ length: grid.cols }, (_, c) => {
      const cell = data.cells?.[r]?.[c] ?? base.cells[r][c];
      return {
        ...cell,
        value: normalizeCellToken(cell.value as unknown),
        corner: (cell.corner ?? []).map(normalizeCellToken).filter(Boolean),
        center: (cell.center ?? []).map(normalizeCellToken).filter(Boolean),
        colors: cell.colors ?? [],
        decorations: cell.decorations ?? [],
      };
    })
  );
  const edgeH = Array.from({ length: grid.rows }, (_, r) =>
    Array.from({ length: Math.max(0, grid.cols - 1) }, (_, c) => {
      const edge = data.edgeH?.[r]?.[c] ?? base.edgeH[r][c];
      return { ...edge, decorations: edge.decorations ?? [] };
    })
  );
  const edgeV = Array.from({ length: Math.max(0, grid.rows - 1) }, (_, r) =>
    Array.from({ length: grid.cols }, (_, c) => {
      const edge = data.edgeV?.[r]?.[c] ?? base.edgeV[r][c];
      return { ...edge, decorations: edge.decorations ?? [] };
    })
  );
  const corners = Array.from({ length: grid.rows + 1 }, (_, r) =>
    Array.from({ length: grid.cols + 1 }, (_, c) =>
      data.corners?.[r]?.[c] ?? base.corners[r][c]
    )
  );
  const merged = {
    ...base,
    ...data,
    title: data.title ?? base.title,
    rules: data.rules?.trim() || DEFAULT_RULES,
    difficulty: Number.isFinite(data.difficulty)
      ? Math.max(0, Math.min(5, Math.round(data.difficulty * 2) / 2))
      : 0,
    grid,
    cells,
    edgeH,
    edgeV,
    corners,
    cages: (data.cages ?? []).map((cage) => ({
      ...cage,
      relation: cage.relation ?? (cage.sum == null ? "none" : "equal"),
      sum: cage.sum ?? null,
    })),
    thermos: (data.thermos ?? []).map((thermo) => ({
      ...thermo,
      color: thermo.color || undefined,
      thickness: Number.isFinite(thermo.thickness)
        ? Math.max(0, Math.min(100, Number(thermo.thickness)))
        : undefined,
    })),
    arrows: (data.arrows ?? []).map((arrow) => ({
      ...arrow,
      color: arrow.color || undefined,
      thickness: Number.isFinite(arrow.thickness)
        ? Math.max(0, Math.min(100, Number(arrow.thickness)))
        : undefined,
    })),
    lines: (data.lines ?? []).map(normalizeLine),
    solveLines: (data.solveLines ?? []).map(normalizeLine),
    globalConstraints: {
      diagonal: data.globalConstraints?.diagonal ?? false,
      antiKnight: data.globalConstraints?.antiKnight ?? false,
      antiKing: data.globalConstraints?.antiKing ?? false,
      nonConsecutive: data.globalConstraints?.nonConsecutive ?? false,
    },
    lookouts: (data.lookouts ?? []).map((clue) => ({
      ...clue,
      digits: (clue.digits ?? []).map(normalizeCellToken).filter(Boolean),
    })),
    skyscrapers: (data.skyscrapers ?? []).filter((clue) =>
      clue.index >= 0 && clue.index < (
        clue.side === "top" || clue.side === "bottom" ? grid.cols : grid.rows
      )
    ),
    xSums: (data.xSums ?? []).filter((clue) =>
      clue.index >= 0 && clue.index < (
        clue.side === "top" || clue.side === "bottom" ? grid.cols : grid.rows
      )
    ),
    littleKillers: ((data.littleKillers ?? []) as SerializedLittleKiller[])
      .map((clue) => normalizeLittleKiller(clue, grid))
      .filter((clue): clue is LittleKillerClue => clue != null),
    disabledRuleKeys: Array.isArray(data.disabledRuleKeys)
      ? data.disabledRuleKeys.map(String)
      : [],
  };
  return merged as Puzzle;
}

// ----------------------------------------------------------------------------
// 符号构造辅助
// ----------------------------------------------------------------------------

export const dotSymbol = (color: "white" | "black"): EdgeSymbol => ({
  kind: "dot",
  color,
});
export const vxSymbol = (value: "V" | "X"): EdgeSymbol => ({ kind: "vx", value });
export const inequalitySymbol = (
  greater: "first" | "second",
): EdgeSymbol => ({ kind: "ineq", greater });
export const edgeTextSymbol = (text: string): EdgeSymbol => ({ kind: "text", text });
export const arrowSymbol = (
  dir: "up" | "down" | "left" | "right",
): CornerSymbol => ({ kind: "arrow", dir });
export const cornerTextSymbol = (text: string): CornerSymbol => ({ kind: "text", text });

export const COLOR_PALETTE: ColorName[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
  "grey",
];

// ----------------------------------------------------------------------------
// 高层约束的辅助
// ----------------------------------------------------------------------------

export function nextId(p: Puzzle): number {
  let max = 0;
  for (const c of p.cages) max = Math.max(max, c.id);
  for (const t of p.thermos) max = Math.max(max, t.id);
  for (const a of p.arrows) max = Math.max(max, a.id);
  for (const line of p.lines) max = Math.max(max, line.id);
  for (const line of p.solveLines) max = Math.max(max, line.id);
  return max + 1;
}

export const LINE_RULE_DESCRIPTIONS: Record<LineConstraintKind, string> = {
  "region-sum": "线穿过每个宫时，在线上经过的数字之和都相等。",
  zipper: "线上与中心等距离的两个数字之和相等；奇数长度时等于中心位置的数字。",
  "ten-sum": "线上数字可以划分为若干个和为 10 的连续子段。",
  renban: "线上是一组互不重复的连续数字，顺序可以打乱。",
  "anti-factor": "线上不能出现线长的倍数或约数（1 除外），且线上数字之和是线长的倍数。",
  "german-whisper": "线上相邻数字至少相差 5。",
  "dutch-whisper": "线上相邻数字至少相差 4。",
  parity: "线上相邻数字的奇偶性不同。",
  entropy: "线上任意三个连续格分别来自 123、456、789 三个区间。",
  between: "线上的数字位于两端数字组成的闭区间之间。",
  palindrome: "线上的数字序列从任意一端读取都完全相同。",
  custom: "此线没有内置规则，含义由出题人在文字说明中定义。",
};

export const LINE_DEFAULT_COLORS: Record<LineConstraintKind, string> = {
  "region-sum": "#7dd3fc",
  zipper: "#c084fc",
  "ten-sum": "#f97316",
  renban: "#6b21a8",
  "anti-factor": "#a3e635",
  "german-whisper": "#166534",
  "dutch-whisper": "#86efac",
  parity: "#ef4444",
  entropy: "#d4a017",
  between: "#4b5563",
  palindrome: "#fde68a",
  custom: "#64748b",
};

export const THERMO_DEFAULT_STYLE = { color: "#94a3b8", thickness: 20 } as const;
export const ARROW_DEFAULT_STYLE = { color: "#475569", thickness: 10 } as const;

export function setSkyscraperClue(
  p: Puzzle,
  side: GridSide,
  index: number,
  value: number,
): void {
  const existing = p.skyscrapers.find(
    (clue) => clue.side === side && clue.index === index,
  );
  if (existing) existing.value = value;
  else p.skyscrapers.push({ side, index, value });
}

/** 给定一个笼的格子集合，计算其内部边界边（分隔笼内与笼外的边） */
export function cageBoundary(cells: CellRef[], rows = 9, cols = 9): {
  edgeH: CellRef[];
  edgeV: CellRef[];
} {
  const set = new Set(cells.map(([r, c]) => cellKey(r, c)));
  const inCage = (r: number, c: number) => set.has(cellKey(r, c));
  const edgeH: CellRef[] = [];
  const edgeV: CellRef[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (inCage(r, c) !== inCage(r, c + 1)) edgeH.push([r, c]);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (inCage(r, c) !== inCage(r + 1, c)) edgeV.push([r, c]);
    }
  }
  return { edgeH, edgeV };
}

/** 笼的和提示所在的格子（最靠左上角的格子） */
export function cageAnchor(cells: CellRef[]): CellRef {
  return sortCells(cells)[0];
}

/** 找包含指定格子的笼（用于编辑/删除） */
export function findCageAt(p: Puzzle, r: number, c: number): KillerCage | null {
  for (const cage of p.cages) {
    if (cage.cells.some(([cr, cc]) => cr === r && cc === c)) return cage;
  }
  return null;
}

export function removeCage(p: Puzzle, id: number): void {
  p.cages = p.cages.filter((c) => c.id !== id);
}

/** Killer 笼使用上下左右四方向连通；单格笼也视为有效。 */
export function isOrthogonallyConnected(cells: CellRef[]): boolean {
  if (cells.length <= 1) return true;
  const keys = new Set(cells.map(([r, c]) => cellKey(r, c)));
  const visited = new Set<string>();
  const queue: CellRef[] = [cells[0]];
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = cellKey(r, c);
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nextKey = cellKey(r + dr, c + dc);
      if (keys.has(nextKey) && !visited.has(nextKey)) queue.push([r + dr, c + dc]);
    }
  }
  return visited.size === keys.size;
}

export function touchesOrthogonally(cells: CellRef[], r: number, c: number): boolean {
  return cells.length === 0 || cells.some(
    ([cr, cc]) => Math.abs(cr - r) + Math.abs(cc - c) === 1,
  );
}

// ---- 温度计 / 箭头路径辅助 ----

export function pathContains(cells: CellRef[], r: number, c: number): boolean {
  return cells.some(([cr, cc]) => cr === r && cc === c);
}

/** 从有序路径里移除一个格子（用于回溯编辑） */
export function pathWithout(cells: CellRef[], r: number, c: number): CellRef[] {
  return cells.filter(([cr, cc]) => !(cr === r && cc === c));
}

export function isThermo(p: Puzzle, id: number): Thermo | undefined {
  return p.thermos.find((t) => t.id === id);
}

export function isArrow(p: Puzzle, id: number): Arrow | undefined {
  return p.arrows.find((a) => a.id === id);
}
