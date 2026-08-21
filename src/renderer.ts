import type { PendingPath } from "./app";
import type {
  CellDecoration,
  CellRef,
  ColorName,
  Direction,
  EdgeData,
  EdgeDecoration,
  EightDirection,
  GridSide,
  LineConstraint,
  LineConstraintKind,
  LineStyle,
  LookoutAnchor,
  PathNodeRef,
  Puzzle,
} from "./types";
import {
  type HitTarget,
  type Layout,
  cageInsetSegments,
  cellCenter,
  cellRect,
  connectLineSegments,
  littleKillerTargetVertex,
  outerCellCenter,
  outsideCluePoint,
  vertexPoint,
} from "./geometry";
import { candidateGridShape, gridTokens } from "./grid";
import {
  ARROW_DEFAULT_STYLE,
  cageAnchor,
  isFortressCell,
  LINE_DEFAULT_COLORS,
  THERMO_DEFAULT_STYLE,
} from "./model";
import { findStandardRuleConflicts } from "./validation";

function addConnectedSegments(
  ctx: CanvasRenderingContext2D,
  segments: ReturnType<typeof cageInsetSegments>,
): void {
  for (const path of connectLineSegments(segments)) {
    if (path.points.length < 2) continue;
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (const point of path.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (path.closed) ctx.closePath();
  }
}

/** 自绘圆角矩形路径（避免依赖 ctx.roundRect 的兼容性） */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ----------------------------------------------------------------------------
// Canvas 渲染器
// ----------------------------------------------------------------------------

export interface RenderOpts {
  selection: CellRef | null;
  /** 数字、候选和颜色工具支持同时选中的全部格子。 */
  selectedCells?: CellRef[];
  /** 同字符高亮（空字符串表示不高亮） */
  highlightValue: string;
  /** 悬停目标（用于边/角的预览高亮） */
  hover: HitTarget | null;
  /** 正在构建的笼（预览） */
  pendingCage: CellRef[] | null;
  /** 正在构建的路径（温度计 / 箭头预览） */
  pendingPath: PendingPath | null;
  /** 正在构建的自由线边集合（自定义线 / 解题画线预览） */
  pendingCustomEdges?: Array<[PathNodeRef, PathNodeRef]>;
  /** 自由线当前锚点格（预览起点） */
  pendingCustomCell?: PathNodeRef | null;
  /** 自由线预览颜色 */
  pendingCustomColor?: string;
  /** 自由线预览粗细（相对单元格百分比） */
  pendingCustomThickness?: number;
  /** 违反约束的格子（只标最近填入的），用橙色标红。 */
  constraintConflicts?: CellRef[];
  /** 违反约束的候选字符：cellKey -> 冲突 token 集合（仅变色）。 */
  conflictingCandidates?: Map<string, Set<string>>;
  /** 导出图片时可关闭编辑器的自动判错高亮。 */
  showConflicts?: boolean;
}

const COLORS = {
  bg: "#ffffff",
  thinLine: "#bfc6d0",
  boxLine: "#344861",
  border: "#344861",
  givenDigit: "#344861",
  filledDigit: "#2563eb",
  conflictDigit: "#dc2626",
  conflictFill: "rgba(239,68,68,0.2)",
  conflictBorder: "rgba(220,38,38,0.82)",
  constraintDigit: "#ea580c",
  constraintFill: "rgba(249,115,22,0.2)",
  constraintBorder: "rgba(234,88,12,0.85)",
  pencil: "#6b7280",
  selection: "#2563eb",
  sameDigitFill: "rgba(96,165,250,0.22)",
  hoverFill: "rgba(37,99,235,0.28)",
  cagePreviewFill: "rgba(34,197,94,0.18)",
  cagePreviewLine: "#16a34a",
  fortressFill: "rgba(148,163,184,0.52)",
  fortressArrow: "#64748b",
  thermo: "#94a3b8",
  arrowLine: "#475569",
  dotBlack: "#1f2937",
  text: "#1f2937",
};

const CELL_COLORS: Record<ColorName, string> = {
  red: "rgba(239,68,68,0.32)",
  orange: "rgba(249,115,22,0.32)",
  yellow: "rgba(234,179,8,0.34)",
  green: "rgba(34,197,94,0.30)",
  cyan: "rgba(6,182,212,0.30)",
  blue: "rgba(59,130,246,0.30)",
  purple: "rgba(168,85,247,0.30)",
  pink: "rgba(236,72,153,0.30)",
  grey: "rgba(148,163,184,0.35)",
};

const FONT =
  '"Segoe UI", "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

/** 设置一个能完整放入指定宽度的字体，供 1–3 字符 token 自适应缩放。 */
function setFittedFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  preferredSize: number,
  maxWidth: number,
  minimumScale = 0.42,
): number {
  ctx.font = `${weight} ${preferredSize}px ${FONT}`;
  const measured = ctx.measureText(text).width;
  const size = measured > maxWidth
    ? Math.max(preferredSize * minimumScale, preferredSize * maxWidth / measured)
    : preferredSize;
  ctx.font = `${weight} ${size}px ${FONT}`;
  return size;
}

export function render(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  layout: Layout,
  opts: RenderOpts,
): void {
  const { width, height } = layout;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const standardConflicts = opts.showConflicts === false
    ? new Set<string>()
    : findStandardRuleConflicts(puzzle);
  const constraintConflicts = new Set(
    (opts.constraintConflicts ?? []).map(([r, c]) => `${r},${c}`)
  );

  drawCellFills(ctx, puzzle, layout);
  drawFortressFills(ctx, puzzle, layout);
  drawSameDigit(ctx, puzzle, layout, opts.highlightValue);
  drawStandardConflicts(ctx, layout, standardConflicts);
  drawConstraintConflicts(ctx, layout, constraintConflicts);
  drawGridLines(ctx, puzzle, layout);
  // 约束线高于基础网格，但低于笼框、边/点符号和数字。
  drawGlobalConstraints(ctx, puzzle, layout);
  drawConstraints(ctx, puzzle, layout);
  drawSolveLines(ctx, puzzle, layout);
  drawPending(ctx, layout, opts);
  drawOutsideClues(ctx, puzzle, layout);
  drawBoldEdges(ctx, puzzle, layout);
  drawCageBorders(ctx, puzzle, layout);
  drawFortressArrows(ctx, puzzle, layout);
  drawEdgeSymbols(ctx, puzzle, layout);
  drawEdgeDecorations(ctx, puzzle, layout);
  drawCornerSymbols(ctx, puzzle, layout);
  drawLookouts(ctx, puzzle, layout);
  drawCellDecorations(ctx, puzzle, layout);
  drawHover(ctx, layout, opts.hover);
  drawSelection(ctx, layout, opts.selectedCells ?? [], opts.selection);
  drawMarks(ctx, puzzle, layout, opts.conflictingCandidates);
  drawDigits(ctx, puzzle, layout, standardConflicts, constraintConflicts);
}

function drawStandardConflicts(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  conflicts: Set<string>,
): void {
  if (conflicts.size === 0) return;
  const { cell } = layout;
  for (const key of conflicts) {
    const [r, c] = key.split(",").map(Number);
    const rect = cellRect(layout, r, c);
    ctx.fillStyle = COLORS.conflictFill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = COLORS.conflictBorder;
    ctx.lineWidth = Math.max(1.5, cell * 0.045);
    ctx.strokeRect(
      rect.x + cell * 0.055,
      rect.y + cell * 0.055,
      rect.w - cell * 0.11,
      rect.h - cell * 0.11,
    );
  }
}

/** 约束冲突（橙色）：只标最近填入、导致约束不成立的格子。 */
function drawConstraintConflicts(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  conflicts: Set<string>,
): void {
  if (conflicts.size === 0) return;
  const { cell } = layout;
  for (const key of conflicts) {
    const [r, c] = key.split(",").map(Number);
    const rect = cellRect(layout, r, c);
    ctx.fillStyle = COLORS.constraintFill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = COLORS.constraintBorder;
    ctx.lineWidth = Math.max(1.5, cell * 0.05);
    ctx.strokeRect(
      rect.x + cell * 0.045,
      rect.y + cell * 0.045,
      rect.w - cell * 0.09,
      rect.h - cell * 0.09,
    );
  }
}

// ---- 盘外提示 ----
function drawOutsideClues(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
): void {
  const { cell } = layout;
  ctx.fillStyle = COLORS.text;
  for (const clue of p.skyscrapers) {
    const point = outsideCluePoint(layout, clue.side, clue.index);
    const text = String(clue.value);
    setFittedFont(ctx, text, 700, Math.max(11, cell * 0.34), cell * 0.82, 0.32);
    ctx.fillText(text, point.x, point.y);
  }
  ctx.fillStyle = "#ea580c";
  for (const clue of p.xSums) {
    const point = outsideCluePoint(layout, clue.side, clue.index);
    const text = String(clue.value);
    setFittedFont(ctx, text, 700, Math.max(11, cell * 0.32), cell * 0.82, 0.32);
    ctx.fillText(text, point.x, point.y);
  }
  drawLittleKillers(ctx, p, layout);
}

function drawLittleKillers(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
): void {
  const color = "#7c3aed";
  const { cell } = layout;
  for (const clue of p.littleKillers) {
    const targetVertex = littleKillerTargetVertex(
      clue.anchor,
      clue.direction,
      p.grid.rows,
      p.grid.cols,
    );
    if (!targetVertex) continue;
    const anchor = outerCellCenter(layout, clue.anchor.r, clue.anchor.c);
    const target = vertexPoint(layout, targetVertex.r, targetVertex.c);
    const dx = target.x - anchor.x;
    const dy = target.y - anchor.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const label = {
      x: anchor.x,
      y: anchor.y,
    };
    const shaftStart = {
      x: anchor.x + ux * cell * 0.2,
      y: anchor.y + uy * cell * 0.2,
    };
    const headLength = cell * 0.18;
    const headHalfWidth = cell * 0.085;
    const headBase = {
      x: target.x - ux * headLength,
      y: target.y - uy * headLength,
    };

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cell * 0.045);
    ctx.beginPath();
    ctx.moveTo(shaftStart.x, shaftStart.y);
    ctx.lineTo(headBase.x, headBase.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(
      headBase.x - uy * headHalfWidth,
      headBase.y + ux * headHalfWidth,
    );
    ctx.lineTo(
      headBase.x + uy * headHalfWidth,
      headBase.y - ux * headHalfWidth,
    );
    ctx.closePath();
    ctx.fill();

    const text = String(clue.value);
    const fontSize = setFittedFont(ctx, text, 700, Math.max(10, cell * 0.27), cell * 0.72, 0.32);
    const width = ctx.measureText(text).width + fontSize * 0.45;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundRectPath(
      ctx,
      label.x - width / 2,
      label.y - fontSize * 0.62,
      width,
      fontSize * 1.24,
      fontSize * 0.3,
    );
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, label.x, label.y);
  }
}

function drawGlobalConstraints(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  if (!p.globalConstraints.diagonal) return;
  const first = cellCenter(layout, 0, 0);
  const last = cellCenter(layout, p.grid.rows - 1, p.grid.cols - 1);
  const otherFirst = cellCenter(layout, 0, p.grid.cols - 1);
  const otherLast = cellCenter(layout, p.grid.rows - 1, 0);
  ctx.strokeStyle = "rgba(99,102,241,0.22)";
  ctx.lineWidth = layout.cell * 0.18;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  ctx.lineTo(last.x, last.y);
  ctx.moveTo(otherFirst.x, otherFirst.y);
  ctx.lineTo(otherLast.x, otherLast.y);
  ctx.stroke();
}

// ---- 格子着色 ----
function drawCellFills(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      const cell = p.cells[r][c];
      if (cell.colors.length === 0) continue;
      const rect = cellRect(layout, r, c);

      // 单色继续铺满整格；多色则从格子中心切成面积相同的扇形，
      // 避免整层半透明颜色互相覆盖变脏。
      const colors = Array.from(new Set(cell.colors));
      if (colors.length === 1) {
        ctx.fillStyle = CELL_COLORS[colors[0]] ?? CELL_COLORS.grey;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        continue;
      }

      const centerX = rect.x + rect.w / 2;
      const centerY = rect.y + rect.h / 2;
      const perimeterPoint = (position: number) => {
        const side = ((position % 4) + 4) % 4;
        if (side < 1) return { x: rect.x + rect.w * side, y: rect.y };
        if (side < 2) return { x: rect.x + rect.w, y: rect.y + rect.h * (side - 1) };
        if (side < 3) return { x: rect.x + rect.w * (3 - side), y: rect.y + rect.h };
        return { x: rect.x, y: rect.y + rect.h * (4 - side) };
      };
      const perimeterPerColor = 4 / colors.length;

      // 沿正方形周长等距分界。格子是正方形，中心到四边距离相同，
      // 因此每段周长与中心围成的扇形面积也完全相同。
      colors.forEach((color, index) => {
        const from = perimeterPerColor * index;
        const to = from + perimeterPerColor;
        const start = perimeterPoint(from);
        const end = perimeterPoint(to);
        ctx.fillStyle = CELL_COLORS[color] ?? CELL_COLORS.grey;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(start.x, start.y);
        for (let corner = Math.floor(from) + 1; corner < to; corner++) {
          const point = perimeterPoint(corner);
          ctx.lineTo(point.x, point.y);
        }
        ctx.lineTo(end.x, end.y);
        ctx.closePath();
        ctx.fill();
      });
    }
  }
}

function drawFortressFills(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  if (p.fortressCells.length === 0) return;
  ctx.fillStyle = COLORS.fortressFill;
  for (const [r, c] of p.fortressCells) {
    const rect = cellRect(layout, r, c);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

/**
 * 箭头由堡垒与非堡垒格的共享边实时派生；盘面外没有相邻数字，因此不画箭头。
 * 箭身和箭头均收在本格边界内，避免与边符号混淆。
 */
function drawFortressArrows(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  if (p.fortressCells.length === 0) return;
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ] as const;
  ctx.save();
  ctx.strokeStyle = COLORS.fortressArrow;
  ctx.lineWidth = Math.max(1.2, layout.cell * 0.035);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [r, c] of p.fortressCells) {
    const center = cellCenter(layout, r, c);
    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= p.grid.rows || nc >= p.grid.cols) continue;
      if (isFortressCell(p, nr, nc)) continue;
      const dx = dc;
      const dy = dr;
      const px = -dy;
      const py = dx;
      const start = {
        x: center.x + dx * layout.cell * 0.37,
        y: center.y + dy * layout.cell * 0.37,
      };
      const end = {
        x: center.x + dx * layout.cell * 0.48,
        y: center.y + dy * layout.cell * 0.48,
      };
      const headBack = layout.cell * 0.04;
      const headWing = layout.cell * 0.035;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - dx * headBack + px * headWing, end.y - dy * headBack + py * headWing);
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - dx * headBack - px * headWing, end.y - dy * headBack - py * headWing);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSameDigit(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
  value: string,
): void {
  if (!value) return;
  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      if (p.cells[r][c].value === value) {
        const rect = cellRect(layout, r, c);
        ctx.fillStyle = COLORS.sameDigitFill;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
  }
}

// ---- 网格线 ----
function drawGridLines(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  const { pad, cell } = layout;
  const endX = pad + p.grid.cols * cell;
  const endY = pad + p.grid.rows * cell;

  ctx.strokeStyle = COLORS.thinLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < p.grid.cols; i++) {
    if (p.grid.regionMode === "standard" && p.grid.boxCols && i % p.grid.boxCols === 0) continue;
    const x = pad + i * cell;
    ctx.moveTo(x, pad);
    ctx.lineTo(x, endY);
  }
  for (let i = 1; i < p.grid.rows; i++) {
    if (p.grid.regionMode === "standard" && p.grid.boxRows && i % p.grid.boxRows === 0) continue;
    const y = pad + i * cell;
    ctx.moveTo(pad, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  if (p.grid.regionMode === "standard" && p.grid.boxRows && p.grid.boxCols) {
    ctx.strokeStyle = COLORS.boxLine;
    ctx.lineWidth = Math.max(1.5, cell * 0.035);
    ctx.beginPath();
    for (let i = p.grid.boxCols; i < p.grid.cols; i += p.grid.boxCols) {
      const x = pad + i * cell;
      ctx.moveTo(x, pad);
      ctx.lineTo(x, endY);
    }
    for (let i = p.grid.boxRows; i < p.grid.rows; i += p.grid.boxRows) {
      const y = pad + i * cell;
      ctx.moveTo(pad, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  // 外边框
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = Math.max(2.5, cell * 0.06);
  ctx.strokeRect(pad, pad, p.grid.cols * cell, p.grid.rows * cell);
}

// ---- 加粗边（手动） ----
function drawBoldEdges(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  const { pad, cell } = layout;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = Math.max(2, cell * 0.09);
  ctx.beginPath();
  // edgeH（竖直线段，分隔左右相邻格）
  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols - 1; c++) {
      if (!p.edgeH[r][c].bold) continue;
      const x = pad + (c + 1) * cell;
      ctx.moveTo(x, pad + r * cell);
      ctx.lineTo(x, pad + (r + 1) * cell);
    }
  }
  // edgeV（水平线段，分隔上下相邻格）
  for (let r = 0; r < p.grid.rows - 1; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      if (!p.edgeV[r][c].bold) continue;
      const y = pad + (r + 1) * cell;
      ctx.moveTo(pad + c * cell, y);
      ctx.lineTo(pad + (c + 1) * cell, y);
    }
  }
  forEachBorderEdge(p, layout, (edge, placement) => {
    if (!edge.bold) return;
    ctx.moveTo(placement.x1, placement.y1);
    ctx.lineTo(placement.x2, placement.y2);
  });
  ctx.stroke();
}

// ---- 笼边框 ----
function drawCageBorders(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  const { cell } = layout;
  if (p.cages.length === 0) return;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = Math.max(1.25, cell * 0.035);
  ctx.lineCap = "round";
  ctx.setLineDash([cell * 0.08, cell * 0.055]);
  ctx.beginPath();
  for (const cage of p.cages) {
    addConnectedSegments(ctx, cageInsetSegments(layout, cage.cells));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = "butt";

  // 和提示
  for (const cage of p.cages) {
    const relation = cage.relation ?? (cage.sum == null ? "none" : "equal");
    if (relation === "none") continue;
    const [ar, ac] = cageAnchor(cage.cells);
    const rect = cellRect(layout, ar, ac);
    const prefix = relation === "at-least" ? "≥" : relation === "at-most" ? "≤" : "";
    const label = relation === "custom"
      ? (cage.text ?? "")
      : `${prefix}${cage.sum == null ? "?" : cage.sum}`;
    if (!label) continue;
    const inset = cell * 0.12;
    const fontSizePct = Math.max(10, Math.min(50, cage.fontSize ?? 20));
    const fontSize = Math.max(8, cell * (fontSizePct / 100));
    ctx.font = `600 ${fontSize}px ${FONT}`;
    const tw = ctx.measureText(label).width;
    const px = rect.x + inset + tw / 2 + fontSize * 0.18;
    const py = rect.y + inset + fontSize * 0.58;
    // 白色底衬
    ctx.fillStyle = "#ffffff";
    roundRectPath(
      ctx,
      px - tw / 2 - fontSize * 0.18,
      py - fontSize * 0.48,
      tw + fontSize * 0.36,
      fontSize * 1.05,
      fontSize * 0.24,
    );
    ctx.fill();
    ctx.fillStyle = cage.color || COLORS.text;
    ctx.fillText(label, px, py);
  }
}

// ---- 格中心线路约束（温度计 / 箭头 / 变形线） ----
function drawConstraints(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  // 温度计
  for (const thermo of p.thermos) {
    if (thermo.cells.length < 2) continue;
    drawThermoConstraint(ctx, thermo.cells, layout, thermo);
  }

  // 箭头
  for (const arrow of p.arrows) {
    if (arrow.cells.length < 2) continue;
    drawArrowConstraint(ctx, arrow.cells, layout, arrow);
  }

  for (const line of p.lines) {
    drawLineConstraint(ctx, line, layout);
  }
}

function drawLineConstraint(
  ctx: CanvasRenderingContext2D,
  line: LineConstraint,
  layout: Layout,
): void {
  if (line.kind === "custom" && line.edges && line.edges.length > 0) {
    drawFreeformLine(ctx, line, layout);
  } else {
    drawVariantLine(ctx, line.kind, line.cells, layout, line);
  }
}

function drawSolveLines(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
): void {
  for (const line of p.solveLines) {
    drawLineConstraint(ctx, line, layout);
  }
}

function drawThermoConstraint(
  ctx: CanvasRenderingContext2D,
  cells: PathNodeRef[],
  layout: Layout,
  style: LineStyle = {},
): void {
  if (cells.length < 1) return;
  const color = style.color || THERMO_DEFAULT_STYLE.color;
  const thickness = Math.max(0, Math.min(100, style.thickness ?? THERMO_DEFAULT_STYLE.thickness));
  const lineWidth = layout.cell * (thickness / 100);
  const start = cellCenter(layout, cells[0][0], cells[0][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < cells.length; i++) {
    const point = cellCenter(layout, cells[i][0], cells[i][1]);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(start.x, start.y, Math.max(layout.cell * 0.2, lineWidth * 1.4), 0, Math.PI * 2);
  ctx.fill();
}

function drawArrowConstraint(
  ctx: CanvasRenderingContext2D,
  cells: PathNodeRef[],
  layout: Layout,
  style: LineStyle = {},
): void {
  if (cells.length < 1) return;
  const { cell } = layout;
  const first = cellCenter(layout, cells[0][0], cells[0][1]);
  const color = style.color || ARROW_DEFAULT_STYLE.color;
  const thickness = Math.max(0, Math.min(100, style.thickness ?? ARROW_DEFAULT_STYLE.thickness));
  const strokeWidth = cell * (thickness / 100);

  // 先画线路，再用白色圆底遮住圆内部分，让线路从圆边缘自然伸出。
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < cells.length; i++) {
    const point = cellCenter(layout, cells[i][0], cells[i][1]);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.arc(first.x, first.y, cell * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (cells.length >= 2) {
    const n = cells.length;
    const tail = cellCenter(layout, cells[n - 2][0], cells[n - 2][1]);
    const tip = cellCenter(layout, cells[n - 1][0], cells[n - 1][1]);
    const dx = tip.x - tail.x;
    const dy = tip.y - tail.y;
    const len = Math.hypot(dx, dy) || 1;
    drawArrowHead(ctx, tip.x, tip.y, dx / len, dy / len, cell * 0.34, color);
  }
}

function drawVariantLine(
  ctx: CanvasRenderingContext2D,
  kind: LineConstraintKind,
  cells: PathNodeRef[],
  layout: Layout,
  style: Pick<LineConstraint, "color" | "thickness"> = {},
  preview = false,
): void {
  if (cells.length < 1) return;
  const points = cells.map(([r, c]) => cellCenter(layout, r, c));
  const color = style.color || LINE_DEFAULT_COLORS[kind];
  const thickness = Math.max(0, Math.min(100, style.thickness ?? 10));
  const lineWidth = layout.cell * ((thickness + (preview ? 2 : 0)) / 100);
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  };
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = lineWidth + layout.cell * 0.07;
  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  trace();

  if (kind === "zipper") {
    const middle = (points.length - 1) / 2;
    const a = points[Math.floor(middle)];
    const b = points[Math.ceil(middle)];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.max(layout.cell * 0.12, lineWidth * 1.5),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else if (kind === "between" && points.length >= 2) {
    ctx.fillStyle = color;
    for (const point of [points[0], points[points.length - 1]]) {
      ctx.beginPath();
      ctx.arc(
        point.x,
        point.y,
        Math.max(layout.cell * 0.12, lineWidth * 1.5),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/** 按边集合绘制自由线（支持分叉与环）。 */
function drawFreeformLine(
  ctx: CanvasRenderingContext2D,
  line: LineConstraint,
  layout: Layout,
): void {
  const edges = line.edges ?? [];
  if (edges.length === 0) return;
  const color = line.color || LINE_DEFAULT_COLORS.custom;
  const thickness = Math.max(0, Math.min(100, line.thickness ?? 10));
  const lineWidth = layout.cell * (thickness / 100);
  const trace = () => {
    ctx.beginPath();
    for (const [[r1, c1], [r2, c2]] of edges) {
      const a = cellCenter(layout, r1, c1);
      const b = cellCenter(layout, r2, c2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = lineWidth + layout.cell * 0.07;
  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  trace();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ux: number,
  uy: number,
  size: number,
  color = COLORS.arrowLine,
): void {
  const px = -uy;
  const py = ux;
  const tipX = x + ux * size * 0.5;
  const tipY = y + uy * size * 0.5;
  const backX = x - ux * size * 0.25;
  const backY = y - uy * size * 0.25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(backX + px * size * 0.5, backY + py * size * 0.5);
  ctx.lineTo(backX - px * size * 0.5, backY - py * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

// ---- 边符号 ----
function drawEdgeSymbols(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  const { pad, cell } = layout;
  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols - 1; c++) {
      const sym = p.edgeH[r][c].symbol;
      if (!sym) continue;
      const mx = pad + (c + 1) * cell;
      const my = pad + (r + 0.5) * cell;
      drawEdgeSymbol(ctx, sym, mx, my, cell, 1, 0);
    }
  }
  for (let r = 0; r < p.grid.rows - 1; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      const sym = p.edgeV[r][c].symbol;
      if (!sym) continue;
      const mx = pad + (c + 0.5) * cell;
      const my = pad + (r + 1) * cell;
      drawEdgeSymbol(ctx, sym, mx, my, cell, 0, 1);
    }
  }
  forEachBorderEdge(p, layout, (edge, placement) => {
    if (!edge.symbol) return;
    drawEdgeSymbol(
      ctx,
      edge.symbol,
      placement.mx,
      placement.my,
      cell,
      placement.inwardX,
      placement.inwardY,
    );
  });
}

function drawEdgeDecorations(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
): void {
  const { pad, cell } = layout;
  const drawMarks = (
    edge: EdgeData,
    mx: number,
    my: number,
    tangentX: number,
    tangentY: number,
  ) => {
    const count = edge.decorations.length;
    edge.decorations.forEach((decoration, index) => {
      const centered = (index - (count - 1) / 2) * cell * 0.27;
      const constraintOffset = edge.symbol ? cell * 0.25 : 0;
      const offset = centered + constraintOffset;
      drawEdgeDecoration(
        ctx,
        decoration,
        mx + tangentX * offset,
        my + tangentY * offset,
        cell,
      );
    });
  };

  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols - 1; c++) {
      const edge = p.edgeH[r][c];
      if (edge.decorations.length === 0) continue;
      drawMarks(edge, pad + (c + 1) * cell, pad + (r + 0.5) * cell, 0, 1);
    }
  }
  for (let r = 0; r < p.grid.rows - 1; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      const edge = p.edgeV[r][c];
      if (edge.decorations.length === 0) continue;
      drawMarks(edge, pad + (c + 0.5) * cell, pad + (r + 1) * cell, 1, 0);
    }
  }
  forEachBorderEdge(p, layout, (edge, placement) => {
    if (edge.decorations.length === 0) return;
    drawMarks(edge, placement.mx, placement.my, placement.tangentX, placement.tangentY);
  });
}

function drawEdgeDecoration(
  ctx: CanvasRenderingContext2D,
  decoration: EdgeDecoration,
  x: number,
  y: number,
  cell: number,
): void {
  const size = cell * 0.115;
  const color = "#2563eb";
  ctx.strokeStyle = color;
  ctx.fillStyle = "rgba(219,234,254,0.94)";
  ctx.lineWidth = Math.max(1.4, cell * 0.035);
  if (decoration.kind === "custom") {
    const fontSize = Math.max(9, cell * 0.2);
    ctx.font = `700 ${fontSize}px ${FONT}`;
    const width = ctx.measureText(decoration.text).width + fontSize * 0.35;
    roundRectPath(ctx, x - width / 2, y - fontSize * 0.58, width, fontSize * 1.16, fontSize * 0.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(decoration.text, x, y);
    return;
  }
  if (decoration.kind === "circle") {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (decoration.kind === "square") {
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);
  } else if (decoration.kind === "triangle") {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 1.18);
    ctx.lineTo(x + size * 1.05, y + size * 0.92);
    ctx.lineTo(x - size * 1.05, y + size * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (decoration.kind === "cross") {
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
  }
}

function drawEdgeSymbol(
  ctx: CanvasRenderingContext2D,
  sym: import("./types").EdgeSymbol,
  mx: number,
  my: number,
  cell: number,
  firstToSecondX: number,
  firstToSecondY: number,
): void {
  if (sym.kind === "dot") {
    const radius = cell * 0.11;
    ctx.fillStyle = sym.color === "black" ? COLORS.dotBlack : "#ffffff";
    ctx.beginPath();
    ctx.arc(mx, my, radius, 0, Math.PI * 2);
    ctx.fill();
    if (sym.color === "white") {
      ctx.strokeStyle = COLORS.boxLine;
      ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.stroke();
    }
  } else if (sym.kind === "vx") {
    // 白色圆底
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(mx, my, cell * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${cell * 0.34}px ${FONT}`;
    ctx.fillText(sym.value, mx, my + cell * 0.01);
  } else if (sym.kind === "ineq") {
    const direction = sym.greater === "first" ? 1 : -1;
    const nx = firstToSecondX * direction;
    const ny = firstToSecondY * direction;
    const tx = -ny;
    const ty = nx;
    const depth = cell * 0.18;
    const spread = cell * 0.16;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(mx, my, cell * 0.23, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = Math.max(1.5, cell * 0.045);
    ctx.beginPath();
    ctx.moveTo(mx - nx * depth + tx * spread, my - ny * depth + ty * spread);
    ctx.lineTo(mx + nx * depth, my + ny * depth);
    ctx.lineTo(mx - nx * depth - tx * spread, my - ny * depth - ty * spread);
    ctx.stroke();
  } else {
    // 文字
    const fontSize = Math.max(9, cell * 0.3);
    ctx.font = `600 ${fontSize}px ${FONT}`;
    const tw = ctx.measureText(sym.text).width;
    ctx.fillStyle = "#ffffff";
    const h = fontSize * 1.15;
    roundRectPath(ctx, mx - tw / 2 - fontSize * 0.14, my - h / 2, tw + fontSize * 0.28, h, fontSize * 0.2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.fillText(sym.text, mx, my + cell * 0.005);
  }
}

interface BorderEdgePlacement {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  tangentX: number;
  tangentY: number;
  inwardX: number;
  inwardY: number;
}

function borderEdgePlacement(
  layout: Layout,
  side: GridSide,
  index: number,
): BorderEdgePlacement {
  const { pad, cell, rows, cols } = layout;
  if (side === "top" || side === "bottom") {
    const y = side === "top" ? pad : pad + rows * cell;
    const x1 = pad + index * cell;
    return {
      x1, y1: y, x2: x1 + cell, y2: y,
      mx: x1 + cell / 2, my: y,
      tangentX: 1, tangentY: 0,
      inwardX: 0, inwardY: side === "top" ? 1 : -1,
    };
  }
  const x = side === "left" ? pad : pad + cols * cell;
  const y1 = pad + index * cell;
  return {
    x1: x, y1, x2: x, y2: y1 + cell,
    mx: x, my: y1 + cell / 2,
    tangentX: 0, tangentY: 1,
    inwardX: side === "left" ? 1 : -1, inwardY: 0,
  };
}

function forEachBorderEdge(
  puzzle: Puzzle,
  layout: Layout,
  visit: (edge: EdgeData, placement: BorderEdgePlacement) => void,
): void {
  for (const side of ["top", "right", "bottom", "left"] as const) {
    puzzle.borderEdges[side].forEach((edge, index) => {
      visit(edge, borderEdgePlacement(layout, side, index));
    });
  }
}

// ---- 角符号 ----
function drawCornerSymbols(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  const { cell } = layout;
  for (let r = 0; r <= p.grid.rows; r++) {
    for (let c = 0; c <= p.grid.cols; c++) {
      const data = p.corners[r][c];
      if (data.symbols.length === 0) continue;
      const pt = vertexPoint(layout, r, c);
      let textIndex = 0;
      for (const sym of data.symbols) {
        if (sym.kind === "arrow") {
          drawCornerArrow(ctx, pt.x, pt.y, sym.dir, cell);
        } else {
          const offset = textIndex * cell * 0.16;
          drawCornerText(ctx, sym.text, pt.x + offset, pt.y + offset, cell);
          textIndex++;
        }
      }
    }
  }
}

function drawCornerArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: Direction,
  cell: number,
): void {
  const size = cell * 0.24;
  const dirs: Record<Direction, [number, number]> = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };
  const [ux, uy] = dirs[dir];
  const px = -uy;
  const py = ux;
  const tipX = x + ux * size;
  const tipY = y + uy * size;
  const backX = x + ux * size * 0.2;
  const backY = y + uy * size * 0.2;
  ctx.fillStyle = COLORS.boxLine;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(backX + px * size * 0.62, backY + py * size * 0.62);
  ctx.lineTo(backX - px * size * 0.62, backY - py * size * 0.62);
  ctx.closePath();
  ctx.fill();
}

function drawCornerText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  cell: number,
): void {
  const fontSize = Math.max(9, cell * 0.3);
  ctx.font = `600 ${fontSize}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const h = fontSize * 1.15;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, x - tw / 2 - fontSize * 0.12, y - h / 2, tw + fontSize * 0.24, h, fontSize * 0.2);
  ctx.fill();
  ctx.fillStyle = COLORS.text;
  ctx.fillText(text, x, y);
}

function lookoutPoint(layout: Layout, anchor: LookoutAnchor): { x: number; y: number } {
  if (anchor.kind === "corner") return vertexPoint(layout, anchor.r, anchor.c);
  if (anchor.kind === "borderEdge") {
    const edge = borderEdgePlacement(layout, anchor.side, anchor.index);
    return { x: edge.mx, y: edge.my };
  }
  if (anchor.kind === "edgeH") {
    return {
      x: layout.pad + (anchor.c + 1) * layout.cell,
      y: layout.pad + (anchor.r + 0.5) * layout.cell,
    };
  }
  return {
    x: layout.pad + (anchor.c + 0.5) * layout.cell,
    y: layout.pad + (anchor.r + 1) * layout.cell,
  };
}

function drawLookouts(ctx: CanvasRenderingContext2D, p: Puzzle, layout: Layout): void {
  const fontSize = Math.max(9, layout.cell * 0.2);
  ctx.font = `700 ${fontSize}px ${FONT}`;
  for (const clue of p.lookouts) {
    const point = lookoutPoint(layout, clue.anchor);
    const text = clue.digits.join("");
    const width = Math.max(layout.cell * 0.34, ctx.measureText(text).width + fontSize * 0.55);
    const height = fontSize * 1.55;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = Math.max(1.2, layout.cell * 0.035);
    roundRectPath(ctx, point.x - width / 2, point.y - height / 2, width, height, height / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0f766e";
    ctx.fillText(text, point.x, point.y);
  }
}

const CELL_ARROW_VECTORS: Record<EightDirection, [number, number]> = {
  up: [0, -1],
  "up-right": [1, -1],
  right: [1, 0],
  "down-right": [1, 1],
  down: [0, 1],
  "down-left": [-1, 1],
  left: [-1, 0],
  "up-left": [-1, -1],
};

function drawCellDecorations(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
): void {
  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      const decorations = p.cells[r][c].decorations;
      if (decorations.length === 0) continue;
      const point = cellCenter(layout, r, c);
      // 基础形状先画，八向箭头最后画，保证叠加时箭头不会被白色形状底遮住。
      const ordered = [
        ...decorations.filter((decoration) => decoration.kind !== "arrow"),
        ...decorations.filter((decoration) => decoration.kind === "arrow"),
      ];
      for (const decoration of ordered) {
        drawCellDecoration(ctx, decoration, point.x, point.y, layout.cell);
      }
    }
  }
}

function drawCellDecoration(
  ctx: CanvasRenderingContext2D,
  decoration: CellDecoration,
  x: number,
  y: number,
  cell: number,
): void {
  const color = "#475569";
  const size = cell * 0.22;
  ctx.strokeStyle = color;
  ctx.fillStyle = "rgba(255,255,255,0.74)";
  ctx.lineWidth = Math.max(1.5, cell * 0.05);
  if (decoration.kind === "circle") {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (decoration.kind === "square") {
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);
  } else if (decoration.kind === "triangle") {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 1.08);
    ctx.lineTo(x + size, y + size * 0.88);
    ctx.lineTo(x - size, y + size * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (decoration.kind === "cross") {
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
  } else if (decoration.kind === "arrow") {
    const [rawX, rawY] = CELL_ARROW_VECTORS[decoration.direction];
    const length = Math.hypot(rawX, rawY) || 1;
    const ux = rawX / length;
    const uy = rawY / length;
    // 斜向箭头沿对角线延伸（用未归一化的 rawX/rawY），视觉长度为水平 / 竖直
    // 箭头的 √2 倍，使斜向箭头同样“顶到”格子角，保持视觉统一。
    const tipX = x + rawX * cell * 0.28;
    const tipY = y + rawY * cell * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    drawArrowHead(ctx, tipX, tipY, ux, uy, cell * 0.16, color);
  } else if ("text" in decoration) {
    const fontSize = Math.max(10, cell * 0.3);
    ctx.font = `700 ${fontSize}px ${FONT}`;
    const width = ctx.measureText(decoration.text).width + fontSize * 0.45;
    roundRectPath(ctx, x - width / 2, y - fontSize * 0.58, width, fontSize * 1.16, fontSize * 0.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(decoration.text, x, y);
  }
}

// ---- 数字 ----
function drawDigits(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
  conflicts: Set<string>,
  constraintConflicts: Set<string>,
): void {
  const { cell } = layout;
  const fontSize = cell * 0.62;
  // 固定数字先画，解题填写数字最后画，明确保持最高显示层级。
  for (const given of [true, false]) {
    for (let r = 0; r < p.grid.rows; r++) {
      for (let c = 0; c < p.grid.cols; c++) {
        const cellData = p.cells[r][c];
        if (cellData.value === "" || cellData.given !== given) continue;
        const { x, y } = cellCenter(layout, r, c);
        setFittedFont(
          ctx,
          cellData.value,
          given ? 600 : 500,
          fontSize,
          cell * 0.82,
        );
        ctx.fillStyle = conflicts.has(`${r},${c}`)
          ? COLORS.conflictDigit
          : constraintConflicts.has(`${r},${c}`)
            ? COLORS.constraintDigit
            : given ? COLORS.givenDigit : COLORS.filledDigit;
        ctx.fillText(String(cellData.value), x, y + cell * 0.02);
      }
    }
  }
}

// ---- 候选数（角标 / 中标） ----
function drawMarks(
  ctx: CanvasRenderingContext2D,
  p: Puzzle,
  layout: Layout,
  conflictingCandidates?: Map<string, Set<string>>,
): void {
  const { cell } = layout;
  const palette = gridTokens(p.grid);
  const candidateShape = candidateGridShape(p.grid);
  for (let r = 0; r < p.grid.rows; r++) {
    for (let c = 0; c < p.grid.cols; c++) {
      const cellData = p.cells[r][c];
      if (cellData.value !== "") continue;
      const rect = cellRect(layout, r, c);
      const conflicting = conflictingCandidates?.get(`${r},${c}`) ?? new Set<string>();

      if (cellData.center.length > 0) {
        const slotW = cell / candidateShape.cols;
        const slotH = cell / candidateShape.rows;
        const fontSize = Math.min(slotW, slotH) * 0.62;
        cellData.center.forEach((token, index) => {
          const tokenPosition = palette.indexOf(token.toUpperCase());
          const position = tokenPosition >= 0
            ? tokenPosition
            : index % (candidateShape.rows * candidateShape.cols);
          const dr = Math.floor(position / candidateShape.cols);
          const dc = position % candidateShape.cols;
          setFittedFont(ctx, token, 400, fontSize, slotW * 0.82, 0.32);
          ctx.fillStyle = conflicting.has(token) ? COLORS.constraintDigit : COLORS.pencil;
          ctx.fillText(
            token,
            rect.x + (dc + 0.5) * slotW,
            rect.y + (dr + 0.5) * slotH,
          );
        });
      }

      if (cellData.corner.length > 0) {
        // 中标：保留多字符 token 的边界，数量较多时分成两行。
        const middle = Math.ceil(cellData.corner.length / 2);
        const lines = cellData.corner.length <= 5
          ? [cellData.corner]
          : [cellData.corner.slice(0, middle), cellData.corner.slice(middle)];
        const preferredSize = cell * (lines.length === 1 ? 0.22 : 0.19);
        const centerX = rect.x + cell / 2;
        const centerY = rect.y + cell / 2;
        const lineHeight = preferredSize * 1.12;
        lines.forEach((tokens, lineIndex) => {
          const offset = (lineIndex - (lines.length - 1) / 2) * lineHeight;
          const preview = tokens.join(" ");
          const fontSize = setFittedFont(ctx, preview, 400, preferredSize, cell * 0.82, 0.35);
          const gap = fontSize * 0.18;
          const widths = tokens.map((token) => ctx.measureText(token).width);
          const lineWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, tokens.length - 1);
          let x = centerX - lineWidth / 2;
          tokens.forEach((token, tokenIndex) => {
            const tokenWidth = widths[tokenIndex];
            ctx.fillStyle = conflicting.has(token) ? COLORS.constraintDigit : COLORS.pencil;
            ctx.fillText(token, x + tokenWidth / 2, centerY + offset);
            x += tokenWidth + gap;
          });
        });
      }
    }
  }
}

// ---- 悬停预览 ----
function drawHover(ctx: CanvasRenderingContext2D, layout: Layout, hover: HitTarget | null): void {
  if (!hover) return;
  const { pad, cell } = layout;
  if (hover.kind === "edgeH") {
    const x = pad + (hover.c + 1) * cell;
    const y0 = pad + hover.r * cell;
    ctx.fillStyle = COLORS.hoverFill;
    ctx.fillRect(x - cell * 0.12, y0, cell * 0.24, cell);
  } else if (hover.kind === "edgeV") {
    const y = pad + (hover.r + 1) * cell;
    const x0 = pad + hover.c * cell;
    ctx.fillStyle = COLORS.hoverFill;
    ctx.fillRect(x0, y - cell * 0.12, cell, cell * 0.24);
  } else if (hover.kind === "borderEdge") {
    const edge = borderEdgePlacement(layout, hover.side, hover.index);
    ctx.fillStyle = COLORS.hoverFill;
    if (hover.side === "top" || hover.side === "bottom") {
      ctx.fillRect(edge.x1, edge.y1 - cell * 0.12, cell, cell * 0.24);
    } else {
      ctx.fillRect(edge.x1 - cell * 0.12, edge.y1, cell * 0.24, cell);
    }
  } else if (hover.kind === "corner") {
    const pt = vertexPoint(layout, hover.r, hover.c);
    ctx.fillStyle = COLORS.hoverFill;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (hover.kind === "outside") {
    const point = outsideCluePoint(layout, hover.side, hover.index);
    ctx.fillStyle = COLORS.hoverFill;
    ctx.beginPath();
    ctx.arc(point.x, point.y, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (hover.kind === "outerCell") {
    const x = hover.c * cell;
    const y = hover.r * cell;
    ctx.fillStyle = COLORS.hoverFill;
    roundRectPath(
      ctx,
      x + cell * 0.08,
      y + cell * 0.08,
      cell * 0.84,
      cell * 0.84,
      cell * 0.12,
    );
    ctx.fill();
  }
}

// ---- 构建中的预览 ----
function drawPending(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  opts: RenderOpts,
): void {
  const { cell } = layout;
  if (opts.pendingCage && opts.pendingCage.length > 0) {
    for (const [r, c] of opts.pendingCage) {
      const rect = cellRect(layout, r, c);
      ctx.fillStyle = COLORS.cagePreviewFill;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    // 边界预览
    ctx.strokeStyle = COLORS.cagePreviewLine;
    ctx.lineWidth = Math.max(1.5, cell * 0.045);
    ctx.lineCap = "round";
    ctx.setLineDash([cell * 0.1, cell * 0.065]);
    ctx.beginPath();
    addConnectedSegments(ctx, cageInsetSegments(layout, opts.pendingCage));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
  }

  if (opts.pendingPath && opts.pendingPath.cells.length >= 1) {
    const { cells, type } = opts.pendingPath;
    if (type !== "thermo" && type !== "arrow") {
      drawVariantLine(ctx, type, cells, layout, opts.pendingPath, true);
      return;
    }
    if (type === "arrow") {
      drawArrowConstraint(ctx, cells, layout, opts.pendingPath);
      return;
    }
    if (type === "thermo") {
      drawThermoConstraint(ctx, cells, layout, opts.pendingPath);
    }
  }

  if (opts.pendingCustomCell) {
    const anchor = cellCenter(layout, opts.pendingCustomCell[0], opts.pendingCustomCell[1]);
    ctx.fillStyle = "rgba(100,116,139,0.28)";
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, cell * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  if (opts.pendingCustomEdges && opts.pendingCustomEdges.length > 0) {
    const color = opts.pendingCustomColor || LINE_DEFAULT_COLORS.custom;
    const thickness = Math.max(0, Math.min(100, opts.pendingCustomThickness ?? 10));
    const lineWidth = cell * (thickness / 100);
    const trace = () => {
      ctx.beginPath();
      for (const [[r1, c1], [r2, c2]] of opts.pendingCustomEdges!) {
        const a = cellCenter(layout, r1, c1);
        const b = cellCenter(layout, r2, c2);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    };
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = lineWidth + cell * 0.07;
    trace();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    trace();
  }
}

// ---- 选中框 ----
function drawSelection(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  selectedCells: CellRef[],
  primary: CellRef | null,
): void {
  const selections = selectedCells.length > 0
    ? selectedCells
    : primary ? [primary] : [];
  if (selections.length === 0) return;
  const { cell } = layout;

  ctx.fillStyle = "rgba(37,99,235,0.1)";
  for (const [r, c] of selections) {
    const rect = cellRect(layout, r, c);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  const segments = cageInsetSegments(layout, selections, cell * 0.055);
  ctx.strokeStyle = COLORS.selection;
  ctx.lineWidth = Math.max(2, cell * 0.055);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  addConnectedSegments(ctx, segments);
  ctx.stroke();
}
