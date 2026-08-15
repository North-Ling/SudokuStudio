import type { CellRef, DiagonalDirection, GridSide } from "./types";

// ----------------------------------------------------------------------------
// 网格布局与命中检测
// ----------------------------------------------------------------------------

/** 盘面四周各预留一格宽度，组成 (rows+2)×(cols+2) 的虚拟显示区域。 */
export const OUTSIDE_RING = 1;

export interface Layout {
  /** Canvas 的 CSS 像素尺寸。 */
  width: number;
  height: number;
  rows: number;
  cols: number;
  displayRows: number;
  displayCols: number;
  /** 真实网格距画布边缘的距离，固定为一个虚拟格宽。 */
  pad: number;
  /** 单个格子的边长 */
  cell: number;
}

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LinePath {
  points: Array<{ x: number; y: number }>;
  closed: boolean;
}

/**
 * 将端点相接的独立线段串成路径。
 * Canvas 的虚线会在每个新子路径重新计数，因此区域轮廓必须先连接，
 * 否则跨越单元格的长边会在每个格线处出现规律性断口。
 */
export function connectLineSegments(segments: LineSegment[]): LinePath[] {
  const coordinateKey = (x: number, y: number) =>
    `${Math.round(x * 1_000_000)},${Math.round(y * 1_000_000)}`;
  const nodes = new Map<string, { point: { x: number; y: number }; edges: number[] }>();
  const edges = segments.map((segment, index) => {
    const from = coordinateKey(segment.x1, segment.y1);
    const to = coordinateKey(segment.x2, segment.y2);
    const addNode = (key: string, x: number, y: number) => {
      const node = nodes.get(key);
      if (node) node.edges.push(index);
      else nodes.set(key, { point: { x, y }, edges: [index] });
    };
    addNode(from, segment.x1, segment.y1);
    addNode(to, segment.x2, segment.y2);
    return { from, to };
  });
  const used = new Set<number>();
  const paths: LinePath[] = [];

  for (let startEdge = 0; startEdge < edges.length; startEdge++) {
    if (used.has(startEdge)) continue;
    const startKey = edges[startEdge].from;
    const points = [{ ...nodes.get(startKey)!.point }];
    let edgeIndex = startEdge;
    let currentKey = startKey;
    let closed = false;

    while (!used.has(edgeIndex)) {
      used.add(edgeIndex);
      const edge = edges[edgeIndex];
      const nextKey = edge.from === currentKey ? edge.to : edge.from;
      if (nextKey === startKey) {
        closed = true;
        break;
      }
      points.push({ ...nodes.get(nextKey)!.point });
      currentKey = nextKey;
      const nextEdge = nodes.get(currentKey)!.edges.find((candidate) => !used.has(candidate));
      if (nextEdge == null) break;
      edgeIndex = nextEdge;
    }
    paths.push({ points, closed });
  }
  return paths;
}

/** 根据画布尺寸计算布局 */
export function computeLayout(width: number, height: number, rows: number, cols: number): Layout {
  const displayRows = rows + OUTSIDE_RING * 2;
  const displayCols = cols + OUTSIDE_RING * 2;
  const cell = Math.min(width / displayCols, height / displayRows);
  const pad = cell * OUTSIDE_RING;
  return { width, height, rows, cols, displayRows, displayCols, pad, cell };
}

export function cellRect(layout: Layout, r: number, c: number) {
  const { pad, cell } = layout;
  return {
    x: pad + c * cell,
    y: pad + r * cell,
    w: cell,
    h: cell,
  };
}

export function cellCenter(layout: Layout, r: number, c: number) {
  const { pad, cell } = layout;
  return {
    x: pad + (c + 0.5) * cell,
    y: pad + (r + 0.5) * cell,
  };
}

/**
 * 生成缩进到格子内部的 Killer 笼轮廓线段。
 * 相邻笼格之间不画线，外边界按 inset 向笼内收缩。
 * 凸角向内缩短，凹角则延长到两条内缩边的交点，避免转角断开。
 */
export function cageInsetSegments(
  layout: Layout,
  cells: CellRef[],
  inset = layout.cell * 0.1,
): LineSegment[] {
  const keys = new Set(cells.map(([r, c]) => `${r},${c}`));
  const contains = (r: number, c: number) => keys.has(`${r},${c}`);
  const segments: LineSegment[] = [];
  for (const [r, c] of cells) {
    const x = layout.pad + c * layout.cell;
    const y = layout.pad + r * layout.cell;
    const rightX = x + layout.cell;
    const bottomY = y + layout.cell;
    const top = !contains(r - 1, c);
    const right = !contains(r, c + 1);
    const bottom = !contains(r + 1, c);
    const left = !contains(r, c - 1);

    // 角偏移：凸角（两条外边相交）向内缩进；凹角（恰一条外边、且对角格
    // 在笼内）向外扩以连接内凹边；其余（平直边 / 全内部）保持 0，从而保证
    // 连续的竖直 / 水平边界不会在相邻格子交界处断开。
    const cornerOffset = (a: boolean, b: boolean, diag: boolean) =>
      a && b ? inset : a !== b && diag ? -inset : 0;

    const topLeftInset = cornerOffset(top, left, contains(r - 1, c - 1));
    const topRightInset = cornerOffset(top, right, contains(r - 1, c + 1));
    const bottomRightInset = cornerOffset(bottom, right, contains(r + 1, c + 1));
    const bottomLeftInset = cornerOffset(bottom, left, contains(r + 1, c - 1));

    if (top) segments.push({
      x1: x + topLeftInset,
      y1: y + inset,
      x2: rightX - topRightInset,
      y2: y + inset,
    });
    if (right) segments.push({
      x1: rightX - inset,
      y1: y + topRightInset,
      x2: rightX - inset,
      y2: bottomY - bottomRightInset,
    });
    if (bottom) segments.push({
      x1: rightX - bottomRightInset,
      y1: bottomY - inset,
      x2: x + bottomLeftInset,
      y2: bottomY - inset,
    });
    if (left) segments.push({
      x1: x + inset,
      y1: bottomY - bottomLeftInset,
      x2: x + inset,
      y2: y + topLeftInset,
    });
  }
  return segments;
}

/** 顶点 (vr, vc) 的像素坐标，vr,vc ∈ 0..9 */
export function vertexPoint(layout: Layout, vr: number, vc: number) {
  return {
    x: layout.pad + vc * layout.cell,
    y: layout.pad + vr * layout.cell,
  };
}

export interface CellHit {
  kind: "cell";
  r: number;
  c: number;
}

export interface EdgeHit {
  kind: "edgeH" | "edgeV";
  r: number;
  c: number;
  /** 命中点到边的最近距离 */
  dist: number;
}

export interface CornerHit {
  kind: "corner";
  r: number;
  c: number;
}

export interface OutsideHit {
  kind: "outside";
  side: GridSide;
  index: number;
}

export interface OuterCellHit {
  kind: "outerCell";
  /** 虚拟网格坐标，只会落在最外圈 */
  r: number;
  c: number;
}

export type HitTarget = CellHit | EdgeHit | CornerHit | OutsideHit | OuterCellHit;

export function outerCellCenter(layout: Layout, r: number, c: number) {
  return {
    x: (c + 0.5) * layout.cell,
    y: (r + 0.5) * layout.cell,
  };
}

export function hitOuterCell(layout: Layout, x: number, y: number): OuterCellHit | null {
  const c = Math.floor(x / layout.cell);
  const r = Math.floor(y / layout.cell);
  if (r < 0 || r >= layout.displayRows || c < 0 || c >= layout.displayCols) return null;
  if (r !== 0 && r !== layout.displayRows - 1 && c !== 0 && c !== layout.displayCols - 1) {
    return null;
  }
  return { kind: "outerCell", r, c };
}

/** 由盘外虚拟格和箭头方向计算其指向的盘面边界顶点。 */
export function littleKillerTargetVertex(
  anchor: { r: number; c: number },
  direction: DiagonalDirection,
  rows: number,
  cols: number,
): { r: number; c: number } | null {
  const down = direction.startsWith("down");
  const right = direction.endsWith("right");
  const virtualR = anchor.r + (down ? 1 : 0);
  const virtualC = anchor.c + (right ? 1 : 0);
  const r = virtualR - OUTSIDE_RING;
  const c = virtualC - OUTSIDE_RING;
  const anchorIsOuter = anchor.r === 0 || anchor.r === rows + 1 ||
    anchor.c === 0 || anchor.c === cols + 1;
  const targetIsVertex = r >= 0 && r <= rows && c >= 0 && c <= cols;
  const targetIsBoundary = r === 0 || r === rows || c === 0 || c === cols;
  return anchorIsOuter && targetIsVertex && targetIsBoundary ? { r, c } : null;
}

export function outsideCluePoint(
  layout: Layout,
  side: GridSide,
  index: number,
): { x: number; y: number } {
  const { width, height, pad, cell } = layout;
  const alongX = pad + (index + 0.5) * cell;
  const alongY = pad + (index + 0.5) * cell;
  // 盘外提示放在虚拟外圈单元格的正中心。
  const near = pad / 2;
  if (side === "top") return { x: alongX, y: near };
  if (side === "bottom") return { x: alongX, y: height - pad / 2 };
  if (side === "left") return { x: near, y: alongY };
  return { x: width - pad / 2, y: alongY };
}

export function hitOutside(
  layout: Layout,
  x: number,
  y: number,
  tolerance: number,
): OutsideHit | null {
  let best: OutsideHit | null = null;
  let bestDist = tolerance;
  const sides: GridSide[] = ["top", "right", "bottom", "left"];
  for (const side of sides) {
    const count = side === "top" || side === "bottom" ? layout.cols : layout.rows;
    for (let index = 0; index < count; index++) {
      const point = outsideCluePoint(layout, side, index);
      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance < bestDist) {
        bestDist = distance;
        best = { kind: "outside", side, index };
      }
    }
  }
  return best;
}

/** 命中单元格：返回点所在的格子（点在网格内时） */
export function hitCell(layout: Layout, x: number, y: number): CellHit | null {
  const { pad, cell } = layout;
  const c = Math.floor((x - pad) / cell);
  const r = Math.floor((y - pad) / cell);
  if (r < 0 || r >= layout.rows || c < 0 || c >= layout.cols) return null;
  return { kind: "cell", r, c };
}

export function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.hypot(dx, dy);
}

/** 命中最近的边（两条相邻格之间的边框），在容差内返回 */
export function hitEdge(
  layout: Layout,
  x: number,
  y: number,
  tolerance: number,
): EdgeHit | null {
  const { pad, cell } = layout;
  let best: EdgeHit | null = null;
  let bestDist = tolerance;

  // 横向相邻边（竖直线段）：edgeH[r][c]，分隔 (r,c) 与 (r,c+1)
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols - 1; c++) {
      const ax = pad + (c + 1) * cell;
      const ay = pad + r * cell;
      const by = pad + (r + 1) * cell;
      const d = segmentDistance(x, y, ax, ay, ax, by);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: "edgeH", r, c, dist: d };
      }
    }
  }

  // 纵向相邻边（水平线段）：edgeV[r][c]，分隔 (r,c) 与 (r+1,c)
  for (let r = 0; r < layout.rows - 1; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const ay = pad + (r + 1) * cell;
      const ax = pad + c * cell;
      const bx = pad + (c + 1) * cell;
      const d = segmentDistance(x, y, ax, ay, bx, ay);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: "edgeV", r, c, dist: d };
      }
    }
  }

  return best;
}

/** 命中最近的顶点，在容差内返回 */
export function hitCorner(
  layout: Layout,
  x: number,
  y: number,
  tolerance: number,
): CornerHit | null {
  let best: CornerHit | null = null;
  let bestDist = tolerance;
  for (let r = 0; r <= layout.rows; r++) {
    for (let c = 0; c <= layout.cols; c++) {
      const p = vertexPoint(layout, r, c);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: "corner", r, c };
      }
    }
  }
  return best;
}

/** 两个格子是否八邻相邻（约束连线支持横、竖和斜向绘制） */
export function areAdjacent(a: CellRef, b: CellRef): boolean {
  const dr = Math.abs(a[0] - b[0]);
  const dc = Math.abs(a[1] - b[1]);
  return Math.max(dr, dc) === 1;
}

export function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

/** 将一组格子排序为字典序（逐行） */
export function sortCells(cells: CellRef[]): CellRef[] {
  return [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
