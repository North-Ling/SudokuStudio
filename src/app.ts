import type {
  CellRef,
  CellToken,
  CellDecoration,
  CageRelation,
  ColorName,
  DiagonalDirection,
  Direction,
  EdgeData,
  EdgeDecoration,
  EdgeSymbol,
  EightDirection,
  GlobalConstraints,
  GridSpec,
  LineConstraint,
  LineConstraintKind,
  LookoutAnchor,
  Puzzle,
} from "./types";
import {
  type EdgeHit,
  type HitTarget,
  type Layout,
  type OuterCellHit,
  type OutsideHit,
  areAdjacent,
  cageInsetSegments,
  cellCenter,
  computeLayout,
  hitCell,
  hitCorner,
  hitEdge,
  hitOuterCell,
  hitOutside,
  littleKillerTargetVertex,
  segmentDistance,
  vertexPoint,
} from "./geometry";
import { gridTokens, maximumStandardSum } from "./grid";
import {
  arrowSymbol,
  clonePuzzle,
  cornerTextSymbol,
  createEmptyPuzzle,
  deserializePuzzle,
  dotSymbol,
  edgeTextSymbol,
  findCageAt,
  inequalitySymbol,
  isOrthogonallyConnected,
  ARROW_DEFAULT_STYLE,
  LINE_DEFAULT_COLORS,
  nextId,
  setSkyscraperClue,
  THERMO_DEFAULT_STYLE,
  touchesOrthogonally,
  vxSymbol,
} from "./model";
import { History } from "./history";
import { render, type RenderOpts } from "./renderer";

export type ToolMode =
  | "none"
  | "digit"
  | "corner"
  | "center"
  | "color"
  | "cell-shape"
  | "edge-bold"
  | "edge-dot"
  | "edge-ineq"
  | "edge-vx"
  | "edge-text"
  | "corner-arrow"
  | "corner-text"
  | "cage"
  | "skyscraper"
  | "thermo"
  | "arrow"
  | "line-region-sum"
  | "line-zipper"
  | "line-ten-sum"
  | "line-renban"
  | "line-anti-factor"
  | "line-german-whisper"
  | "line-dutch-whisper"
  | "line-parity"
  | "line-entropy"
  | "line-between"
  | "line-palindrome"
  | "line-custom"
  | "lookout"
  | "x-sum"
  | "little-killer"
  | "free-line"
  | "erase";

export type AppMode = "edit" | "solve";

const EDIT_ONLY_TOOLS = new Set<ToolMode>([
  "edge-dot",
  "edge-ineq",
  "edge-vx",
  "edge-text",
  "corner-arrow",
  "corner-text",
  "cell-shape",
  "cage",
  "skyscraper",
  "thermo",
  "arrow",
  "line-region-sum",
  "line-zipper",
  "line-ten-sum",
  "line-renban",
  "line-anti-factor",
  "line-german-whisper",
  "line-dutch-whisper",
  "line-parity",
  "line-entropy",
  "line-between",
  "line-palindrome",
  "line-custom",
  "lookout",
  "x-sum",
  "little-killer",
]);

export type PathType = "thermo" | "arrow" | LineConstraintKind;
export type PendingPath = {
  cells: CellRef[];
  type: PathType;
  color?: string;
  thickness?: number;
  description?: string;
};

const LINE_TOOL_KIND: Partial<Record<ToolMode, LineConstraintKind>> = {
  "line-region-sum": "region-sum",
  "line-zipper": "zipper",
  "line-ten-sum": "ten-sum",
  "line-renban": "renban",
  "line-anti-factor": "anti-factor",
  "line-german-whisper": "german-whisper",
  "line-dutch-whisper": "dutch-whisper",
  "line-parity": "parity",
  "line-entropy": "entropy",
  "line-between": "between",
  "line-palindrome": "palindrome",
  "line-custom": "custom",
};

export function pathTypeForTool(tool: ToolMode): PathType | null {
  if (tool === "thermo" || tool === "arrow") return tool;
  if (tool === "free-line") return "custom";
  return LINE_TOOL_KIND[tool] ?? null;
}

export function isPathTool(tool: ToolMode): boolean {
  return pathTypeForTool(tool) != null;
}

type EdgeStroke =
  | { kind: "bold"; enabled: boolean }
  | { kind: "decoration"; decoration: EdgeDecoration | null; match?: EdgeDecoration }
  | { kind: "symbol"; symbol: EdgeSymbol | null; match?: EdgeSymbol };

type CellDecorationStroke = {
  decorations: CellDecoration[];
  remove: boolean;
};

function toggleInList(list: CellToken[], token: CellToken): CellToken[] {
  const i = list.indexOf(token);
  if (i >= 0) {
    const copy = [...list];
    copy.splice(i, 1);
    return copy;
  }
  const copy = [...list, token];
  copy.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return copy;
}

export class App {
  puzzle: Puzzle;
  readonly history = new History();

  mode: AppMode = "solve";
  tool: ToolMode = "digit";
  tokenPalette: "digits" | "letters" | "symbols" = "digits";
  customCellToken = "";
  cellShapeKind: CellDecoration["kind"] = "circle";
  cellArrowDirections: EightDirection[] = ["up"];
  cellShapeText = "";
  edgeDrawKind: "bold" | EdgeDecoration["kind"] = "bold";
  edgeMarkText = "";
  dotColor: "white" | "black" = "white";
  vxValue: "V" | "X" = "V";
  inequalityGreater: "first" | "second" = "first";
  skyscraperValue = 1;
  arrowDir: Direction = "up";
  edgeText = "5";
  cornerText = "10";
  cageSum = "";
  cageText = "";
  cageColor = "#1f2937";
  cageFontSize = 20;
  cageRelation: CageRelation = "equal";
  cageError = "";
  lineColor = LINE_DEFAULT_COLORS["region-sum"];
  lineThickness = 10;
  customLineDescription = "";
  lookoutDigits = "34";
  xSumValue = 10;
  littleKillerValue = 10;
  littleKillerDirection: DiagonalDirection = "down-right";
  littleKillerError = "";

  selection: CellRef | null = null;
  /** 数字、角标、中标和颜色工具当前选中的全部格子。 */
  selectedCells: CellRef[] = [];
  hover: HitTarget | null = null;
  pendingCage: CellRef[] | null = null;
  pendingCageId: number | null = null;
  pendingPath: PendingPath | null = null;
  pendingCustomEdges: Array<[CellRef, CellRef]> | null = null;

  private base: Puzzle;
  private solveDraft: Puzzle;
  private ctx: CanvasRenderingContext2D | null = null;
  private pointerStrokeActive = false;
  private pointerStrokeSnapshotted = false;
  private cellDecorationStroke: CellDecorationStroke | null = null;
  private edgeStroke: EdgeStroke | null = null;
  private cageStrokeAction: "add" | "remove" | null = null;
  private lastCustomCell: CellRef | null = null;

  constructor(puzzle: Puzzle) {
    this.base = clonePuzzle(puzzle);
    this.puzzle = clonePuzzle(puzzle);
    this.solveDraft = clonePuzzle(puzzle);
  }

  attach(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx;
    this.render();
  }

  beginPointerStroke(): void {
    this.pointerStrokeActive = true;
    this.pointerStrokeSnapshotted = false;
    this.cellDecorationStroke = null;
    this.edgeStroke = null;
    this.cageStrokeAction = null;
  }

  endPointerStroke(): void {
    this.pointerStrokeActive = false;
    this.pointerStrokeSnapshotted = false;
    this.cellDecorationStroke = null;
    this.edgeStroke = null;
    this.cageStrokeAction = null;
  }

  private snapshotForChange(): void {
    if (!this.pointerStrokeActive) {
      this.history.snapshot(this.puzzle);
      return;
    }
    if (this.pointerStrokeSnapshotted) return;
    this.history.snapshot(this.puzzle);
    this.pointerStrokeSnapshotted = true;
  }

  // ---- 渲染 ----
  private layout: Layout = {
    width: 0,
    height: 0,
    rows: 9,
    cols: 9,
    displayRows: 11,
    displayCols: 11,
    pad: 0,
    cell: 0,
  };

  resize(width: number, height: number): void {
    this.layout = computeLayout(width, height, this.puzzle.grid.rows, this.puzzle.grid.cols);
    this.render();
  }

  render(): void {
    if (!this.ctx) return;
    const opts: RenderOpts = {
      selection: this.selection,
      selectedCells: this.selectedCells,
      highlightValue: this.highlightValue(),
      hover: this.hover,
      pendingCage: this.pendingCage,
      pendingPath: this.pendingPath,
      pendingCustomEdges: this.pendingCustomEdges ?? undefined,
      pendingCustomCell: this.lastCustomCell,
      pendingCustomColor: this.lineColor,
      pendingCustomThickness: this.lineThickness,
    };
    render(this.ctx, this.puzzle, this.layout, opts);
  }

  private highlightValue(): CellToken {
    const cells = this.selectedCells.length > 0
      ? this.selectedCells
      : this.selection ? [this.selection] : [];
    if (cells.length === 0) return "";
    const values = new Set(cells.map(([r, c]) => this.puzzle.cells[r][c].value));
    return values.size === 1 ? values.values().next().value ?? "" : "";
  }

  // ---- 工具选择 ----
  selectTool(tool: ToolMode): void {
    if (!this.canUseTool(tool)) return;
    const previousTool = this.tool;

    // 再次点击当前工具会回到“空工具”状态：保留格子选中，
    // 但停止写入、绘制和约束编辑，并收起对应的参数面板。
    if (previousTool === tool && tool !== "none") {
      this.tool = "none";
      this.selectedCells = [];
      this.hover = null;
      this.pendingCage = null;
      this.pendingCageId = null;
      this.cageError = "";
      this.pendingPath = null;
      this.pendingCustomEdges = null;
      this.lastCustomCell = null;
      this.littleKillerError = "";
      this.render();
      return;
    }

    this.tool = tool;
    if (previousTool !== tool && tool === "cage") {
      this.cageRelation = "equal";
      this.cageSum = "";
      this.cageText = "";
      this.cageColor = "#1f2937";
      this.cageFontSize = 20;
      this.cageError = "";
    }
    const selectedPathType = pathTypeForTool(tool);
    if (previousTool !== tool && selectedPathType) {
      if (selectedPathType === "thermo") {
        this.lineColor = THERMO_DEFAULT_STYLE.color;
        this.lineThickness = THERMO_DEFAULT_STYLE.thickness;
      } else if (selectedPathType === "arrow") {
        this.lineColor = ARROW_DEFAULT_STYLE.color;
        this.lineThickness = ARROW_DEFAULT_STYLE.thickness;
      } else {
        this.lineColor = LINE_DEFAULT_COLORS[selectedPathType];
        this.lineThickness = 10;
      }
      this.customLineDescription = "";
    }
    this.hover = null;
    if (tool !== "little-killer") this.littleKillerError = "";
    // 切换工具时清空未完成的构建
    if (tool !== "cage") {
      this.pendingCage = null;
      this.pendingCageId = null;
      this.cageError = "";
    }
    if (!isPathTool(tool) || (previousTool !== tool && isPathTool(previousTool))) {
      this.pendingPath = null;
    }
    if (!this.isFreeLineTool()) {
      this.pendingCustomEdges = null;
      this.lastCustomCell = null;
    }
    // 边 / 角 / 擦除工具不再需要选中格
    const cellTools = new Set<ToolMode>([
      "digit",
      "corner",
      "center",
      "color",
      "cell-shape",
      "cage",
      ...Array.from(new Set<ToolMode>([
        "thermo", "arrow", ...Object.keys(LINE_TOOL_KIND) as ToolMode[], "free-line",
      ])),
    ]);
    const multiSelectionTools = new Set<ToolMode>(["digit", "corner", "center", "color"]);
    if (!multiSelectionTools.has(tool)) this.selectedCells = [];
    if (!cellTools.has(tool)) this.selection = null;
    this.render();
  }

  canUseTool(tool: ToolMode): boolean {
    return this.mode === "edit" || !EDIT_ONLY_TOOLS.has(tool);
  }

  setMode(mode: AppMode): void {
    if (mode === this.mode) return;

    if (this.mode === "solve") {
      this.solveDraft = clonePuzzle(this.puzzle);
      this.puzzle = clonePuzzle(this.base);
    } else {
      const nextBase = clonePuzzle(this.puzzle);
      const definitionChanged = JSON.stringify(nextBase) !== JSON.stringify(this.base);
      this.base = nextBase;
      if (definitionChanged) this.solveDraft = clonePuzzle(this.base);
      this.puzzle = clonePuzzle(this.solveDraft);
    }

    this.mode = mode;
    if (!this.canUseTool(this.tool)) this.tool = "digit";
    this.history.clear();
    this.selection = null;
    this.selectedCells = [];
    this.hover = null;
    this.pendingCage = null;
    this.pendingCageId = null;
    this.pendingPath = null;
    this.pendingCustomEdges = null;
    this.lastCustomCell = null;
    this.render();
  }

  // ---- 撤销 / 重做 ----
  undo(): void {
    const prev = this.history.undo(this.puzzle);
    if (prev) {
      this.puzzle = prev;
      this.render();
    }
  }

  redo(): void {
    const next = this.history.redo(this.puzzle);
    if (next) {
      this.puzzle = next;
      this.render();
    }
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  // ---- 重置 / 清空 ----
  resetPuzzle(): void {
    this.history.snapshot(this.puzzle);
    this.puzzle = clonePuzzle(this.base);
    this.selection = null;
    this.selectedCells = [];
    this.pendingCage = null;
    this.pendingCageId = null;
    this.pendingPath = null;
    this.render();
  }

  /** 解题模式清空草稿；编辑模式清空题面编辑并保留进入编辑时的已知数。 */
  clearAll(): void {
    this.history.snapshot(this.puzzle);
    if (this.mode === "solve") {
      this.puzzle = clonePuzzle(this.base);
      this.selection = null;
      this.selectedCells = [];
      this.pendingCage = null;
      this.pendingCageId = null;
      this.pendingPath = null;
      this.render();
      return;
    }
    const base = this.base;
    this.puzzle = clonePuzzle(base);
    // 清空所有边、角符号与约束（基础谜题里可能含约束，因此只保留数字）
    const fresh = createEmptyPuzzle(base.title, structuredClone(base.grid));
    fresh.rules = base.rules;
    fresh.difficulty = base.difficulty;
    for (let r = 0; r < base.grid.rows; r++) {
      for (let c = 0; c < base.grid.cols; c++) {
        fresh.cells[r][c].value = base.cells[r][c].value;
        fresh.cells[r][c].given = base.cells[r][c].given;
      }
    }
    this.puzzle = fresh;
    this.selection = null;
    this.selectedCells = [];
    this.pendingCage = null;
    this.pendingCageId = null;
    this.pendingPath = null;
    this.render();
  }

  loadPuzzle(puzzle: Puzzle): void {
    const normalized = deserializePuzzle(JSON.stringify(puzzle));
    this.base = clonePuzzle(normalized);
    this.solveDraft = clonePuzzle(normalized);
    this.puzzle = clonePuzzle(normalized);
    this.history.clear();
    this.selection = null;
    this.selectedCells = [];
    this.pendingCage = null;
    this.pendingCageId = null;
    this.pendingPath = null;
    this.render();
  }

  newEmptyPuzzle(grid?: GridSpec): void {
    this.loadPuzzle(createEmptyPuzzle("未命名题目", grid));
  }

  setPuzzleMetadata(title: string, rules: string): void {
    if (this.mode !== "edit") return;
    this.puzzle.title = title.trimStart();
    this.puzzle.rules = rules;
    this.render();
  }

  setPuzzleDifficulty(value: number): void {
    if (this.mode !== "edit" || !Number.isFinite(value)) return;
    this.puzzle.difficulty = Math.max(0, Math.min(5, Math.round(value * 2) / 2));
    this.render();
  }

  // ==========================================================================
  // 单元格（面）操作
  // ========================================================================== 

  private selectionContains(r: number, c: number): number {
    return this.selectedCells.findIndex(([rr, cc]) => rr === r && cc === c);
  }

  private selectionTouches(r: number, c: number): boolean {
    return this.selectedCells.some(([rr, cc]) => Math.abs(rr - r) + Math.abs(cc - c) === 1);
  }

  private setSingleSelection(r: number, c: number): void {
    this.selection = [r, c];
    this.selectedCells = [[r, c]];
  }

  /** 普通点击重新选择；再次点击已选中的单格则取消选中；Shift 点击可添加或移除。 */
  selectInputCell(r: number, c: number, additive = false): void {
    const index = this.selectionContains(r, c);
    if (additive) {
      if (index >= 0) {
        this.selectedCells.splice(index, 1);
        this.selection = this.selectedCells.at(-1) ?? null;
      } else {
        this.selectedCells.push([r, c]);
        this.selection = [r, c];
      }
    } else if (
      this.selectedCells.length === 1 &&
      this.selectedCells[0][0] === r &&
      this.selectedCells[0][1] === c
    ) {
      this.selection = null;
      this.selectedCells = [];
    } else {
      this.setSingleSelection(r, c);
    }
    this.render();
  }

  /** 拖动选择沿相邻格扩展；按住 Shift 时允许从新的离散位置继续。 */
  extendInputSelection(r: number, c: number, additive = false): void {
    if (this.selectionContains(r, c) >= 0) return;
    if (additive || this.selectedCells.length === 0 || this.selectionTouches(r, c)) {
      this.selectedCells.push([r, c]);
      this.selection = [r, c];
    } else {
      this.setSingleSelection(r, c);
    }
    this.render();
  }

  private inputSelections(): CellRef[] {
    if (this.selectedCells.length > 0) return this.selectedCells;
    return this.selection ? [this.selection] : [];
  }

  handleCellClick(r: number, c: number, additive = false): void {
    if (this.tool === "none") {
      if (this.selection && this.selection[0] === r && this.selection[1] === c) {
        this.selection = null;
      } else {
        this.selection = [r, c];
      }
      this.selectedCells = [];
      this.render();
      return;
    }
    if (this.tool === "digit" || this.tool === "corner" || this.tool === "center" || this.tool === "color") {
      this.selectInputCell(r, c, additive);
      return;
    }
    if (this.tool === "cell-shape") {
      this.selection = [r, c];
      this.selectedCells = [];
      this.toggleCellDecoration(r, c);
      return;
    }
    if (this.tool === "cage") {
      this.cageCellClick(r, c);
      return;
    }
    if (isPathTool(this.tool)) {
      this.pathCellClick(r, c);
      return;
    }
    if (this.tool === "erase") {
      this.eraseCell(r, c);
      return;
    }
    // 边/角工具点击到格子内部时，忽略
  }

  setValue(r: number, c: number, token: CellToken): void {
    const cell = this.puzzle.cells[r][c];
    if (this.mode === "solve" && cell.given) return;
    if (!token || cell.value === token) return;
    this.history.snapshot(this.puzzle);
    cell.value = token;
    cell.given = this.mode === "edit";
    cell.corner = [];
    cell.center = [];
    this.clearPeersMarks(r, c, token);
    this.render();
  }

  toggleValue(r: number, c: number, token: CellToken): void {
    const cell = this.puzzle.cells[r][c];
    if (this.mode === "solve" && cell.given) return;
    if (cell.value === token) this.clearValue(r, c);
    else this.setValue(r, c, token);
  }

  clearValue(r: number, c: number): void {
    const cell = this.puzzle.cells[r][c];
    if (this.mode === "solve" && cell.given) return;
    if (cell.value === "" && cell.corner.length === 0 && cell.center.length === 0)
      return;
    this.history.snapshot(this.puzzle);
    cell.value = "";
    cell.given = false;
    cell.corner = [];
    cell.center = [];
    this.render();
  }

  toggleCorner(r: number, c: number, token: CellToken): void {
    const cell = this.puzzle.cells[r][c];
    if (this.mode === "solve" && cell.given) return;
    this.history.snapshot(this.puzzle);
    cell.corner = toggleInList(cell.corner, token);
    this.render();
  }

  toggleCenter(r: number, c: number, token: CellToken): void {
    const cell = this.puzzle.cells[r][c];
    if (this.mode === "solve" && cell.given) return;
    this.history.snapshot(this.puzzle);
    cell.center = toggleInList(cell.center, token);
    this.render();
  }

  private applyValueToSelections(token: CellToken, toggle: boolean): void {
    const targets = this.inputSelections().filter(([r, c]) =>
      this.mode === "edit" || !this.puzzle.cells[r][c].given
    );
    if (targets.length === 0) return;
    const remove = toggle && targets.every(([r, c]) => this.puzzle.cells[r][c].value === token);
    const changes = targets.some(([r, c]) => {
      const cell = this.puzzle.cells[r][c];
      return remove
        ? cell.value !== "" || cell.corner.length > 0 || cell.center.length > 0
        : cell.value !== token || cell.corner.length > 0 || cell.center.length > 0;
    });
    if (!changes) return;
    this.history.snapshot(this.puzzle);
    for (const [r, c] of targets) {
      const cell = this.puzzle.cells[r][c];
      if (remove) {
        cell.value = "";
        cell.given = false;
      } else {
        cell.value = token;
        cell.given = this.mode === "edit";
      }
      cell.corner = [];
      cell.center = [];
    }
    if (!remove) {
      for (const [r, c] of targets) this.clearPeersMarks(r, c, token);
    }
    this.render();
  }

  private applyCandidateToSelections(kind: "corner" | "center", token: CellToken): void {
    const targets = this.inputSelections().filter(([r, c]) =>
      this.mode === "edit" || !this.puzzle.cells[r][c].given
    );
    if (targets.length === 0) return;
    const remove = targets.every(([r, c]) => this.puzzle.cells[r][c][kind].includes(token));
    this.history.snapshot(this.puzzle);
    for (const [r, c] of targets) {
      const cell = this.puzzle.cells[r][c];
      cell[kind] = remove
        ? cell[kind].filter((item) => item !== token)
        : cell[kind].includes(token) ? cell[kind] : toggleInList(cell[kind], token);
    }
    this.render();
  }

  applyPaletteColor(color: ColorName): void {
    const targets = this.inputSelections();
    if (targets.length === 0) return;
    const remove = targets.every(([r, c]) => this.puzzle.cells[r][c].colors.includes(color));
    this.history.snapshot(this.puzzle);
    for (const [r, c] of targets) {
      const cell = this.puzzle.cells[r][c];
      cell.colors = remove
        ? cell.colors.filter((item) => item !== color)
        : cell.colors.includes(color) ? cell.colors : [...cell.colors, color];
    }
    this.render();
  }

  private currentCellDecorations(): CellDecoration[] {
    if (this.cellShapeKind === "arrow") {
      return this.cellArrowDirections.map((direction) => ({
        kind: "arrow",
        direction,
      }));
    }
    if (this.cellShapeKind === "custom") {
      const text = this.cellShapeText.trim();
      return text ? [{ kind: "custom", text }] : [];
    }
    return [{ kind: this.cellShapeKind }];
  }

  toggleCellArrowDirection(direction: EightDirection): void {
    const index = this.cellArrowDirections.indexOf(direction);
    if (index >= 0) this.cellArrowDirections.splice(index, 1);
    else this.cellArrowDirections.push(direction);
    this.render();
  }

  private decorationEquals(a: CellDecoration, b: CellDecoration): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  toggleCellDecoration(r: number, c: number): void {
    if (this.mode !== "edit") return;
    const decorations = this.currentCellDecorations();
    if (decorations.length === 0) return;
    const cell = this.puzzle.cells[r][c];
    const allPresent = decorations.every((decoration) =>
      cell.decorations.some((item) => this.decorationEquals(item, decoration))
    );
    this.snapshotForChange();
    for (const decoration of decorations) {
      const index = cell.decorations.findIndex((item) =>
        this.decorationEquals(item, decoration)
      );
      if (allPresent) {
        if (index >= 0) cell.decorations.splice(index, 1);
      } else if (index < 0) {
        cell.decorations.push(structuredClone(decoration));
      }
    }
    this.render();
  }

  beginCellDecorationStroke(r: number, c: number): void {
    if (this.mode !== "edit") return;
    const decorations = this.currentCellDecorations();
    if (decorations.length === 0) return;
    this.selection = [r, c];
    this.selectedCells = [];
    const cell = this.puzzle.cells[r][c];
    const allPresent = decorations.every((decoration) =>
      cell.decorations.some((item) => this.decorationEquals(item, decoration))
    );
    this.cellDecorationStroke = { decorations, remove: allPresent };
    this.paintCellDecorationStroke(r, c);
  }

  continueCellDecorationStroke(r: number, c: number): void {
    if (!this.cellDecorationStroke) return;
    this.selection = [r, c];
    this.selectedCells = [];
    this.paintCellDecorationStroke(r, c);
  }

  private paintCellDecorationStroke(r: number, c: number): void {
    const stroke = this.cellDecorationStroke;
    if (!stroke) return;
    const cell = this.puzzle.cells[r][c];
    if (stroke.remove) {
      const hasAny = stroke.decorations.some((decoration) =>
        cell.decorations.some((item) => this.decorationEquals(item, decoration))
      );
      if (!hasAny) return;
      this.snapshotForChange();
      for (const decoration of stroke.decorations) {
        const index = cell.decorations.findIndex((item) =>
          this.decorationEquals(item, decoration)
        );
        if (index >= 0) cell.decorations.splice(index, 1);
      }
    } else {
      const allPresent = stroke.decorations.every((decoration) =>
        cell.decorations.some((item) => this.decorationEquals(item, decoration))
      );
      if (allPresent) return;
      this.snapshotForChange();
      for (const decoration of stroke.decorations) {
        const index = cell.decorations.findIndex((item) =>
          this.decorationEquals(item, decoration)
        );
        if (index < 0) cell.decorations.push(structuredClone(decoration));
      }
    }
    this.render();
  }

  eraseCell(r: number, c: number): void {
    const cell = this.puzzle.cells[r][c];
    if (
      this.mode === "solve" && cell.given && cell.colors.length === 0
    ) return;
    const hasEditableValue = this.mode === "edit" || !cell.given;
    const hasContent =
      (hasEditableValue &&
        (cell.value !== "" || cell.corner.length > 0 || cell.center.length > 0)) ||
      cell.colors.length > 0 ||
      (this.mode === "edit" && cell.decorations.length > 0) ||
      (this.mode === "edit" && cell.given);
    if (!hasContent) return;
    this.snapshotForChange();
    if (this.mode === "edit" || !cell.given) {
      cell.value = "";
      cell.given = false;
      cell.corner = [];
      cell.center = [];
    }
    cell.colors = [];
    if (this.mode === "edit") cell.decorations = [];
    this.render();
  }

  private clearPeersMarks(r: number, c: number, token: CellToken): void {
    const { rows, cols, validationMode, boxRows, boxCols } = this.puzzle.grid;
    if (validationMode === "none") return;
    const boxR = boxRows ? Math.floor(r / boxRows) * boxRows : -1;
    const boxC = boxCols ? Math.floor(c / boxCols) * boxCols : -1;
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        if (rr === r && cc === c) continue;
        const sameRow = rr === r;
        const sameCol = cc === c;
        const sameBox = validationMode === "row-column-region" && boxRows && boxCols &&
          rr >= boxR && rr < boxR + boxRows && cc >= boxC && cc < boxC + boxCols;
        if (!sameRow && !sameCol && !sameBox) continue;
        const peer = this.puzzle.cells[rr][cc];
        peer.corner = peer.corner.filter((item) => item !== token);
        peer.center = peer.center.filter((item) => item !== token);
      }
    }
  }

  // ==========================================================================
  // 边操作
  // ==========================================================================

  handleEdgeClick(hit: EdgeHit): void {
    const edge = this.getEdge(hit.kind, hit.r, hit.c);
    if (!edge) return;
    if (!this.canUseTool(this.tool)) return;

    if (this.tool === "lookout") {
      this.toggleLookout({ kind: hit.kind, r: hit.r, c: hit.c });
      return;
    }

    if (this.tool === "edge-bold") {
      if (this.edgeDrawKind === "bold") {
        this.snapshotForChange();
        edge.bold = !edge.bold;
      } else {
        const decoration = this.currentEdgeDecoration();
        if (!decoration) return;
        const index = edge.decorations.findIndex((item) =>
          JSON.stringify(item) === JSON.stringify(decoration)
        );
        this.snapshotForChange();
        if (index >= 0) edge.decorations.splice(index, 1);
        else edge.decorations.push(decoration);
      }
      this.render();
      return;
    }
    if (this.tool === "edge-dot") {
      this.setEdgeSymbol(edge, dotSymbol(this.dotColor));
      return;
    }
    if (this.tool === "edge-ineq") {
      this.setEdgeSymbol(edge, inequalitySymbol(this.inequalityGreater));
      return;
    }
    if (this.tool === "edge-vx") {
      this.setEdgeSymbol(edge, vxSymbol(this.vxValue));
      return;
    }
    if (this.tool === "edge-text") {
      this.setEdgeSymbol(edge, edgeTextSymbol(this.edgeText));
      return;
    }
    if (this.tool === "erase") {
      const lookoutIndex = this.puzzle.lookouts.findIndex((clue) =>
        clue.anchor.kind === hit.kind && clue.anchor.r === hit.r && clue.anchor.c === hit.c
      );
      if (lookoutIndex >= 0) {
        this.snapshotForChange();
        this.puzzle.lookouts.splice(lookoutIndex, 1);
        this.render();
        return;
      }
      if (this.mode === "solve") {
        if (!edge.bold && edge.decorations.length === 0) return;
        this.snapshotForChange();
        edge.bold = false;
        edge.decorations = [];
        this.render();
        return;
      }
      if (!edge.bold && edge.symbol == null && edge.decorations.length === 0) return;
      this.snapshotForChange();
      edge.bold = false;
      edge.symbol = null;
      edge.decorations = [];
      this.render();
      return;
    }
  }

  beginEdgeStroke(hit: EdgeHit): void {
    const edge = this.getEdge(hit.kind, hit.r, hit.c);
    if (!edge || !this.canUseTool(this.tool)) return;
    if (this.tool === "edge-bold") {
      if (this.edgeDrawKind === "bold") {
        this.edgeStroke = { kind: "bold", enabled: !edge.bold };
      } else {
        const decoration = this.currentEdgeDecoration();
        if (!decoration) return;
        const same = edge.decorations.some((item) =>
          JSON.stringify(item) === JSON.stringify(decoration)
        );
        this.edgeStroke = {
          kind: "decoration",
          decoration: same ? null : decoration,
          match: same ? decoration : undefined,
        };
      }
    } else {
      const symbol = this.currentEdgeToolSymbol();
      if (!symbol) return;
      const same =
        edge.symbol != null &&
        JSON.stringify(edge.symbol) === JSON.stringify(symbol);
      this.edgeStroke = {
        kind: "symbol",
        symbol: same ? null : symbol,
        match: same ? symbol : undefined,
      };
    }
    this.paintEdgeStroke(hit);
  }

  continueEdgeStroke(hit: EdgeHit): void {
    if (!this.edgeStroke) return;
    this.paintEdgeStroke(hit);
  }

  private currentEdgeToolSymbol(): EdgeSymbol | null {
    if (this.tool === "edge-dot") return dotSymbol(this.dotColor);
    if (this.tool === "edge-ineq") {
      return inequalitySymbol(this.inequalityGreater);
    }
    if (this.tool === "edge-vx") return vxSymbol(this.vxValue);
    if (this.tool === "edge-text") return edgeTextSymbol(this.edgeText);
    return null;
  }

  private currentEdgeDecoration(): EdgeDecoration | null {
    if (this.edgeDrawKind === "bold") return null;
    if (this.edgeDrawKind === "custom") {
      const text = this.edgeMarkText.trim();
      return text ? { kind: "custom", text } : null;
    }
    return { kind: this.edgeDrawKind };
  }

  private paintEdgeStroke(hit: EdgeHit): void {
    const edge = this.getEdge(hit.kind, hit.r, hit.c);
    const stroke = this.edgeStroke;
    if (!edge || !stroke) return;
    if (stroke.kind === "bold") {
      if (edge.bold === stroke.enabled) return;
      this.snapshotForChange();
      edge.bold = stroke.enabled;
    } else if (stroke.kind === "decoration") {
      const match = stroke.match;
      if (stroke.decoration == null) {
        if (!match) return;
        const index = edge.decorations.findIndex((item) =>
          JSON.stringify(item) === JSON.stringify(match)
        );
        if (index < 0) return;
        this.snapshotForChange();
        edge.decorations.splice(index, 1);
      } else {
        const exists = edge.decorations.some((item) =>
          JSON.stringify(item) === JSON.stringify(stroke.decoration)
        );
        if (exists) return;
        this.snapshotForChange();
        edge.decorations.push(structuredClone(stroke.decoration));
      }
    } else {
      if (
        stroke.symbol == null &&
        JSON.stringify(edge.symbol) !== JSON.stringify(stroke.match)
      ) {
        return;
      }
      const same = JSON.stringify(edge.symbol) === JSON.stringify(stroke.symbol);
      if (same) return;
      this.snapshotForChange();
      edge.symbol = stroke.symbol == null ? null : structuredClone(stroke.symbol);
    }
    this.render();
  }

  private getEdge(kind: "edgeH" | "edgeV", r: number, c: number): EdgeData | null {
    const { rows, cols } = this.puzzle.grid;
    if (kind === "edgeH") {
      if (r < 0 || r >= rows || c < 0 || c >= cols - 1) return null;
      return this.puzzle.edgeH[r][c];
    }
    if (r < 0 || r >= rows - 1 || c < 0 || c >= cols) return null;
    return this.puzzle.edgeV[r][c];
  }

  private setEdgeSymbol(edge: EdgeData, sym: EdgeSymbol): void {
    const same =
      edge.symbol != null &&
      edge.symbol.kind === sym.kind &&
      JSON.stringify(edge.symbol) === JSON.stringify(sym);
    if (same) {
      this.snapshotForChange();
      edge.symbol = null;
    } else {
      this.snapshotForChange();
      edge.symbol = sym;
    }
    this.render();
  }

  // ==========================================================================
  // 角（顶点）操作
  // ==========================================================================

  handleCornerClick(r: number, c: number): void {
    if (this.mode === "solve") return;
    if (r < 0 || r > this.puzzle.grid.rows || c < 0 || c > this.puzzle.grid.cols) return;
    const corner = this.puzzle.corners[r][c];

    if (this.tool === "lookout") {
      this.toggleLookout({ kind: "corner", r, c });
      return;
    }

    if (this.tool === "corner-arrow") {
      const idx = corner.symbols.findIndex(
        (s) => s.kind === "arrow" && s.dir === this.arrowDir,
      );
      this.snapshotForChange();
      if (idx >= 0) corner.symbols.splice(idx, 1);
      else corner.symbols.push(arrowSymbol(this.arrowDir));
      this.render();
      return;
    }
    if (this.tool === "corner-text") {
      const idx = corner.symbols.findIndex(
        (s) => s.kind === "text" && s.text === this.cornerText,
      );
      this.snapshotForChange();
      if (idx >= 0) corner.symbols.splice(idx, 1);
      else corner.symbols.push(cornerTextSymbol(this.cornerText));
      this.render();
      return;
    }
    if (this.tool === "erase") {
      const lookoutIndex = this.puzzle.lookouts.findIndex((clue) =>
        clue.anchor.kind === "corner" && clue.anchor.r === r && clue.anchor.c === c
      );
      if (lookoutIndex >= 0) {
        this.snapshotForChange();
        this.puzzle.lookouts.splice(lookoutIndex, 1);
        this.render();
        return;
      }
      if (corner.symbols.length === 0) return;
      this.snapshotForChange();
      corner.symbols = [];
      this.render();
      return;
    }
  }

  toggleGlobalConstraint(key: keyof GlobalConstraints): void {
    if (this.mode !== "edit") return;
    this.history.snapshot(this.puzzle);
    this.puzzle.globalConstraints[key] = !this.puzzle.globalConstraints[key];
    this.render();
  }

  private toggleLookout(anchor: LookoutAnchor): void {
    if (this.mode !== "edit") return;
    const palette = gridTokens(this.puzzle.grid);
    const digits = Array.from(new Set(
      Array.from(this.lookoutDigits.toUpperCase()).filter((token) => palette.includes(token)),
    )).sort((a, b) => palette.indexOf(a) - palette.indexOf(b));
    if (digits.length === 0) return;
    const index = this.puzzle.lookouts.findIndex((clue) =>
      clue.anchor.kind === anchor.kind && clue.anchor.r === anchor.r && clue.anchor.c === anchor.c
    );
    this.snapshotForChange();
    if (index >= 0 && JSON.stringify(this.puzzle.lookouts[index].digits) === JSON.stringify(digits)) {
      this.puzzle.lookouts.splice(index, 1);
    } else if (index >= 0) {
      this.puzzle.lookouts[index].digits = digits;
    } else {
      this.puzzle.lookouts.push({ anchor, digits });
    }
    this.render();
  }

  handleOuterCellClick(hit: OuterCellHit): void {
    if (this.tool !== "little-killer") return;
    this.toggleLittleKiller(hit.r, hit.c);
  }

  private toggleLittleKiller(r: number, c: number): void {
    if (this.mode !== "edit") return;
    const anchor = { r, c };
    if (!littleKillerTargetVertex(
      anchor,
      this.littleKillerDirection,
      this.puzzle.grid.rows,
      this.puzzle.grid.cols,
    )) {
      this.littleKillerError = "当前箭头方向无法从这个外部格指向盘面边界，请选择朝向盘面的斜向箭头。";
      this.render();
      return;
    }

    const value = Math.max(
      1,
      Math.min(maximumStandardSum(this.puzzle.grid), Math.round(this.littleKillerValue)),
    );
    const index = this.puzzle.littleKillers.findIndex((clue) =>
      clue.anchor.r === r && clue.anchor.c === c
    );
    this.snapshotForChange();
    const existing = index >= 0 ? this.puzzle.littleKillers[index] : null;
    if (
      existing &&
      existing.value === value &&
      existing.direction === this.littleKillerDirection
    ) {
      this.puzzle.littleKillers.splice(index, 1);
    } else if (index >= 0) {
      this.puzzle.littleKillers[index] = {
        anchor,
        direction: this.littleKillerDirection,
        value,
      };
    } else {
      this.puzzle.littleKillers.push({
        anchor,
        direction: this.littleKillerDirection,
        value,
      });
    }
    this.littleKillerError = "";
    this.render();
  }

  // ==========================================================================
  // 笼（杀手笼）构建
  // ==========================================================================

  cageCellClick(r: number, c: number): void {
    if (this.mode !== "edit") return;
    if (this.pendingCage == null) {
      const existing = findCageAt(this.puzzle, r, c);
      if (existing) {
        this.pendingCage = existing.cells.map(([cr, cc]) => [cr, cc] as CellRef);
        this.pendingCageId = existing.id;
        this.cageRelation = existing.relation ?? (existing.sum == null ? "none" : "equal");
        this.cageSum = existing.sum == null ? "" : String(existing.sum);
        this.cageText = existing.text ?? "";
        this.cageColor = existing.color ?? "#1f2937";
        this.cageFontSize = existing.fontSize ?? 20;
        this.cageError = isOrthogonallyConnected(existing.cells)
          ? ""
          : "这个旧杀手笼不是连续区域，请调整后再完成。";
      } else {
        this.pendingCage = [[r, c]];
        this.pendingCageId = null;
        this.cageError = "";
      }
    } else {
      const i = this.pendingCage.findIndex(([cr, cc]) => cr === r && cc === c);
      if (i >= 0) this.tryRemoveCageCell(i);
      else this.tryAddCageCell(r, c);
      if (this.pendingCage.length === 0) {
        this.pendingCage = null;
        this.pendingCageId = null;
      }
    }
    this.render();
  }

  beginCageStroke(r: number, c: number): void {
    if (this.mode !== "edit") return;
    if (this.pendingCage == null) {
      const existing = findCageAt(this.puzzle, r, c);
      if (existing) {
        this.pendingCage = existing.cells.map(([cr, cc]) => [cr, cc] as CellRef);
        this.pendingCageId = existing.id;
        this.cageRelation = existing.relation ?? (existing.sum == null ? "none" : "equal");
        this.cageSum = existing.sum == null ? "" : String(existing.sum);
        this.cageText = existing.text ?? "";
        this.cageColor = existing.color ?? "#1f2937";
        this.cageFontSize = existing.fontSize ?? 20;
        this.cageStrokeAction = "remove";
        this.cageError = isOrthogonallyConnected(existing.cells)
          ? ""
          : "这个旧杀手笼不是连续区域，请调整后再完成。";
      } else {
        this.pendingCage = [[r, c]];
        this.pendingCageId = null;
        this.cageStrokeAction = "add";
        this.cageError = "";
      }
      this.render();
      return;
    }

    const exists = this.pendingCage.some(([cr, cc]) => cr === r && cc === c);
    this.cageStrokeAction = exists ? "remove" : "add";
    this.paintCageStroke(r, c);
  }

  cageCellPaint(r: number, c: number): void {
    if (this.mode !== "edit") return;
    if (this.cageStrokeAction) {
      this.paintCageStroke(r, c);
      return;
    }
    if (this.pendingCage == null) {
      this.pendingCage = [[r, c]];
      this.pendingCageId = null;
    } else if (!this.pendingCage.some(([cr, cc]) => cr === r && cc === c)) {
      this.tryAddCageCell(r, c);
    }
    this.render();
  }

  private paintCageStroke(r: number, c: number): void {
    if (!this.pendingCage || !this.cageStrokeAction) return;
    const index = this.pendingCage.findIndex(([cr, cc]) => cr === r && cc === c);
    if (this.cageStrokeAction === "add") {
      if (index < 0) this.tryAddCageCell(r, c);
    } else if (index >= 0) {
      this.tryRemoveCageCell(index);
    }
    if (this.pendingCage.length === 0) {
      this.pendingCage = null;
      this.pendingCageId = null;
    }
    this.render();
  }

  commitCage(): void {
    if (this.mode !== "edit") return;
    if (!this.pendingCage || this.pendingCage.length === 0) return;
    if (!isOrthogonallyConnected(this.pendingCage)) {
      this.cageError = "杀手笼必须是上下左右连续的区域。";
      this.render();
      return;
    }
    const sum = this.cageSum.trim() === "" ? null : Number(this.cageSum);
    if (
      this.cageRelation !== "none" &&
      this.cageRelation !== "custom" &&
      (sum == null || !Number.isFinite(sum) || sum <= 0)
    ) {
      this.cageError = "请输入有效的正数提示，或选择“空框”。";
      this.render();
      return;
    }
    const validSum = this.cageRelation === "none" || this.cageRelation === "custom"
      ? null
      : Math.round(sum as number);
    const validText = this.cageRelation === "custom" ? this.cageText : undefined;
    const validColor = this.cageColor || undefined;
    const validFontSize = Math.max(10, Math.min(50, Math.round(this.cageFontSize)));

    this.history.snapshot(this.puzzle);
    if (this.pendingCageId != null) {
      const cage = this.puzzle.cages.find((cg) => cg.id === this.pendingCageId);
      if (cage) {
        cage.cells = this.pendingCage.map(([r, c]) => [r, c] as CellRef);
        cage.relation = this.cageRelation;
        cage.sum = validSum;
        cage.text = validText;
        cage.color = validColor;
        cage.fontSize = validFontSize;
      }
    } else {
      this.puzzle.cages.push({
        id: nextId(this.puzzle),
        cells: this.pendingCage.map(([r, c]) => [r, c] as CellRef),
        relation: this.cageRelation,
        sum: validSum,
        text: validText,
        color: validColor,
        fontSize: validFontSize,
      });
    }
    this.pendingCage = null;
    this.pendingCageId = null;
    this.cageRelation = "equal";
    this.cageSum = "";
    this.cageText = "";
    this.cageColor = "#1f2937";
    this.cageFontSize = 20;
    this.cageError = "";
    this.render();
  }

  private tryAddCageCell(r: number, c: number): boolean {
    if (!this.pendingCage) return false;
    const occupiedByOther = this.puzzle.cages.some(
      (cage) => cage.id !== this.pendingCageId &&
        cage.cells.some(([cr, cc]) => cr === r && cc === c),
    );
    if (occupiedByOther) {
      this.cageError = "一个格子不能同时属于多个杀手笼。";
      return false;
    }
    if (!touchesOrthogonally(this.pendingCage, r, c)) {
      this.cageError = "新格必须与当前杀手笼上下左右相邻。";
      return false;
    }
    this.pendingCage.push([r, c]);
    this.cageError = "";
    return true;
  }

  private tryRemoveCageCell(index: number): boolean {
    if (!this.pendingCage) return false;
    const next = this.pendingCage.filter((_, cellIndex) => cellIndex !== index);
    if (!isOrthogonallyConnected(next)) {
      this.cageError = "移除这个格子会使杀手笼断开。";
      return false;
    }
    this.pendingCage = next;
    this.cageError = "";
    return true;
  }

  deleteCage(): void {
    if (this.mode !== "edit") return;
    if (this.pendingCageId != null) {
      this.history.snapshot(this.puzzle);
      this.puzzle.cages = this.puzzle.cages.filter(
        (cg) => cg.id !== this.pendingCageId,
      );
      this.pendingCage = null;
      this.pendingCageId = null;
      this.cageRelation = "equal";
      this.cageSum = "";
      this.cageText = "";
      this.cageColor = "#1f2937";
      this.cageFontSize = 20;
      this.cageError = "";
      this.render();
    }
  }

  cancelCage(): void {
    this.pendingCage = null;
    this.pendingCageId = null;
    this.cageRelation = "equal";
    this.cageSum = "";
    this.cageText = "";
    this.cageColor = "#1f2937";
    this.cageFontSize = 20;
    this.cageError = "";
    this.render();
  }

  // ==========================================================================
  // 路径（温度计 / 箭头）构建
  // ==========================================================================

  private makePendingPath(cells: CellRef[], type: PathType): PendingPath {
    return {
      cells,
      type,
      color: this.lineColor,
      thickness: this.lineThickness,
      description: type === "custom"
        ? this.customLineDescription.trim() || undefined
        : undefined,
    };
  }

  setLineColor(color: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    this.lineColor = color;
    if (this.pendingPath) {
      this.pendingPath.color = color;
    }
    this.render();
  }

  setLineThickness(value: number): void {
    if (!Number.isFinite(value)) return;
    this.lineThickness = Math.max(0, Math.min(100, Math.round(value)));
    if (this.pendingPath) {
      this.pendingPath.thickness = this.lineThickness;
    }
    this.render();
  }

  setCustomLineDescription(description: string): void {
    this.customLineDescription = description;
    if (this.pendingPath?.type === "custom") {
      this.pendingPath.description = description.trim() || undefined;
    }
    this.render();
  }

  private isFreeLineTool(): boolean {
    return this.tool === "line-custom" || this.tool === "free-line";
  }

  private freeLineCellClick(r: number, c: number): void {
    if (this.pendingCustomEdges == null) {
      this.pendingCustomEdges = [];
      this.lastCustomCell = [r, c];
    } else {
      this.connectCustomCell(r, c);
    }
    this.render();
  }

  private freeLineCellPaint(r: number, c: number): void {
    if (this.pendingCustomEdges == null) {
      this.pendingCustomEdges = [];
      this.lastCustomCell = [r, c];
    } else {
      this.connectCustomCell(r, c);
    }
    this.render();
  }

  private connectCustomCell(r: number, c: number): void {
    const last = this.lastCustomCell;
    if (!last || (last[0] === r && last[1] === c)) return;
    if (areAdjacent(last, [r, c])) {
      this.toggleCustomEdge(last, [r, c]);
    }
    this.lastCustomCell = [r, c];
  }

  private toggleCustomEdge(a: CellRef, b: CellRef): void {
    const edges = this.pendingCustomEdges;
    if (!edges) return;
    const index = edges.findIndex(([p, q]) =>
      (p[0] === a[0] && p[1] === a[1] && q[0] === b[0] && q[1] === b[1]) ||
      (p[0] === b[0] && p[1] === b[1] && q[0] === a[0] && q[1] === a[1])
    );
    if (index >= 0) edges.splice(index, 1);
    else edges.push([a, b]);
  }

  private edgesToCells(edges: Array<[CellRef, CellRef]>): CellRef[] {
    const cells: CellRef[] = [];
    const seen = new Set<string>();
    for (const [a, b] of edges) {
      for (const p of [a, b]) {
        const key = `${p[0]},${p[1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          cells.push([p[0], p[1]]);
        }
      }
    }
    return cells;
  }

  private commitFreeLine(): void {
    if (this.tool === "line-custom" && this.mode !== "edit") return;
    const edges = this.pendingCustomEdges;
    if (!edges || edges.length === 0) return;
    const line: LineConstraint = {
      id: nextId(this.puzzle),
      kind: "custom",
      cells: this.edgesToCells(edges),
      edges: edges.map(([a, b]) => [[a[0], a[1]], [b[0], b[1]]] as [CellRef, CellRef]),
      color: this.lineColor,
      thickness: this.lineThickness,
      description: this.tool === "line-custom"
        ? this.customLineDescription.trim() || undefined
        : undefined,
    };
    this.history.snapshot(this.puzzle);
    if (this.tool === "free-line") this.puzzle.solveLines.push(line);
    else this.puzzle.lines.push(line);
    this.pendingCustomEdges = null;
    this.lastCustomCell = null;
    this.render();
  }

  pathCellClick(r: number, c: number): void {
    if (this.isFreeLineTool()) {
      this.freeLineCellClick(r, c);
      return;
    }
    if (this.mode !== "edit") return;
    const type = pathTypeForTool(this.tool);
    if (!type) return;
    const path = this.pendingPath;

    if (path == null) {
      this.pendingPath = this.makePendingPath([[r, c]], type);
      this.render();
      return;
    }
    if (path.type !== type) {
      this.pendingPath = this.makePendingPath([[r, c]], type);
      this.render();
      return;
    }

    const cells = path.cells;
    const last = cells[cells.length - 1];
    if (last[0] === r && last[1] === c) {
      // 点击最后一个格：回溯
      cells.pop();
      if (cells.length === 0) this.pendingPath = null;
      this.render();
      return;
    }
    if (cells.some(([cr, cc]) => cr === r && cc === c)) {
      return; // 已在路径中
    }
    if (areAdjacent(last, [r, c])) {
      cells.push([r, c]);
      this.render();
    }
  }

  pathCellPaint(r: number, c: number): void {
    if (this.isFreeLineTool()) {
      this.freeLineCellPaint(r, c);
      return;
    }
    if (this.mode !== "edit") return;
    const path = this.pendingPath;
    if (path == null) {
      this.pendingPath = this.makePendingPath(
        [[r, c]],
        pathTypeForTool(this.tool) ?? "arrow",
      );
      this.render();
      return;
    }
    const cells = path.cells;
    const last = cells[cells.length - 1];
    if (last[0] === r && last[1] === c) return;
    const previous = cells[cells.length - 2];
    if (previous && previous[0] === r && previous[1] === c) {
      cells.pop();
      this.render();
      return;
    }
    if (cells.some(([cr, cc]) => cr === r && cc === c)) return;
    if (areAdjacent(last, [r, c])) {
      cells.push([r, c]);
      this.render();
    }
  }

  commitPath(): void {
    if (this.isFreeLineTool()) {
      this.commitFreeLine();
      return;
    }
    if (this.mode !== "edit") return;
    const path = this.pendingPath;
    if (!path || path.cells.length < 2) return;
    this.history.snapshot(this.puzzle);
    if (path.type === "thermo") {
      this.puzzle.thermos.push({
        id: nextId(this.puzzle),
        cells: path.cells.map(([r, c]) => [r, c] as CellRef),
        color: path.color,
        thickness: path.thickness,
      });
    } else if (path.type === "arrow") {
      this.puzzle.arrows.push({
        id: nextId(this.puzzle),
        cells: path.cells.map(([r, c]) => [r, c] as CellRef),
        color: path.color,
        thickness: path.thickness,
      });
    } else {
      this.puzzle.lines.push({
        id: nextId(this.puzzle),
        kind: path.type,
        cells: path.cells.map(([r, c]) => [r, c] as CellRef),
        color: path.color,
        thickness: path.thickness,
        description: path.type === "custom" ? path.description : undefined,
      });
    }
    this.pendingPath = null;
    this.render();
  }

  cancelPath(): void {
    this.pendingPath = null;
    this.pendingCustomEdges = null;
    this.lastCustomCell = null;
    this.render();
  }

  // ==========================================================================
  // 摩天楼外侧提示
  // ==========================================================================

  handleOutsideClick(hit: OutsideHit): void {
    if (this.mode !== "edit") return;
    if (this.tool === "x-sum") {
      const value = Math.max(
        1,
        Math.min(maximumStandardSum(this.puzzle.grid), Math.round(this.xSumValue)),
      );
      const existingIndex = this.puzzle.xSums.findIndex(
        (clue) => clue.side === hit.side && clue.index === hit.index,
      );
      this.snapshotForChange();
      if (existingIndex >= 0 && this.puzzle.xSums[existingIndex].value === value) {
        this.puzzle.xSums.splice(existingIndex, 1);
      } else if (existingIndex >= 0) {
        this.puzzle.xSums[existingIndex].value = value;
      } else {
        this.puzzle.xSums.push({ side: hit.side, index: hit.index, value });
      }
      this.puzzle.skyscrapers = this.puzzle.skyscrapers.filter(
        (clue) => clue.side !== hit.side || clue.index !== hit.index,
      );
      this.render();
      return;
    }
    if (this.tool !== "skyscraper") return;
    const lineLength = hit.side === "top" || hit.side === "bottom"
      ? this.puzzle.grid.rows
      : this.puzzle.grid.cols;
    const value = Math.max(1, Math.min(lineLength, Math.round(this.skyscraperValue)));
    const existingIndex = this.puzzle.skyscrapers.findIndex(
      (clue) => clue.side === hit.side && clue.index === hit.index,
    );
    this.snapshotForChange();
    if (
      existingIndex >= 0 &&
      this.puzzle.skyscrapers[existingIndex].value === value
    ) {
      this.puzzle.skyscrapers.splice(existingIndex, 1);
    } else {
      setSkyscraperClue(this.puzzle, hit.side, hit.index, value);
    }
    this.puzzle.xSums = this.puzzle.xSums.filter(
      (clue) => clue.side !== hit.side || clue.index !== hit.index,
    );
    this.render();
  }

  // ==========================================================================
  // 擦除（综合命中）
  // ==========================================================================

  eraseAt(x: number, y: number): void {
    if (this.mode === "solve" && this.eraseSolveLinesAt(x, y)) return;
    if (this.mode === "edit") {
      if (this.eraseDrawnConstraintAt(x, y)) return;
      const outerCell = hitOuterCell(this.layout, x, y);
      if (outerCell) {
        const littleKillerIndex = this.puzzle.littleKillers.findIndex(
          (clue) => clue.anchor.r === outerCell.r && clue.anchor.c === outerCell.c,
        );
        if (littleKillerIndex >= 0) {
          this.snapshotForChange();
          this.puzzle.littleKillers.splice(littleKillerIndex, 1);
          this.render();
          return;
        }
      }
      const outside = hitOutside(
        this.layout,
        x,
        y,
        this.layout.cell * 0.34,
      );
      if (outside) {
        const index = this.puzzle.skyscrapers.findIndex(
          (clue) => clue.side === outside.side && clue.index === outside.index,
        );
        if (index >= 0) {
          this.snapshotForChange();
          this.puzzle.skyscrapers.splice(index, 1);
          this.render();
          return;
        }
        const xSumIndex = this.puzzle.xSums.findIndex(
          (clue) => clue.side === outside.side && clue.index === outside.index,
        );
        if (xSumIndex >= 0) {
          this.snapshotForChange();
          this.puzzle.xSums.splice(xSumIndex, 1);
          this.render();
          return;
        }
      }
    }
    const cornerTol = this.layout.cell * 0.32;
    const edgeTol = this.layout.cell * 0.22;
    if (this.mode === "edit") {
      const corner = hitCorner(this.layout, x, y, cornerTol);
      if (corner) {
        this.handleCornerClick(corner.r, corner.c);
        return;
      }
    }
    const edge = hitEdge(this.layout, x, y, edgeTol);
    const edgeData = edge ? this.getEdge(edge.kind, edge.r, edge.c) : null;
    if (
      edge && edgeData &&
      (this.mode === "edit" || edgeData.bold || edgeData.decorations.length > 0)
    ) {
      this.handleEdgeClick(edge);
      return;
    }
    const cell = hitCell(this.layout, x, y);
    if (cell) {
      this.eraseCell(cell.r, cell.c);
    }
  }

  private eraseDrawnConstraintAt(x: number, y: number): boolean {
    const pathTolerance = this.layout.cell * 0.2;
    const hitPath = (cells: CellRef[]): boolean => {
      for (let i = 1; i < cells.length; i++) {
        const from = cellCenter(this.layout, cells[i - 1][0], cells[i - 1][1]);
        const to = cellCenter(this.layout, cells[i][0], cells[i][1]);
        if (
          segmentDistance(x, y, from.x, from.y, to.x, to.y) <= pathTolerance
        ) {
          return true;
        }
      }
      return false;
    };

    const arrowIndex = this.puzzle.arrows.findIndex((arrow) => hitPath(arrow.cells));
    if (arrowIndex >= 0) {
      this.snapshotForChange();
      this.puzzle.arrows.splice(arrowIndex, 1);
      this.render();
      return true;
    }

    const thermoIndex = this.puzzle.thermos.findIndex((thermo) =>
      hitPath(thermo.cells),
    );
    if (thermoIndex >= 0) {
      this.snapshotForChange();
      this.puzzle.thermos.splice(thermoIndex, 1);
      this.render();
      return true;
    }

    const lineIndex = this.puzzle.lines.findIndex((line) =>
      this.hitLineAt(line, x, y, pathTolerance)
    );
    if (lineIndex >= 0) {
      this.snapshotForChange();
      this.puzzle.lines.splice(lineIndex, 1);
      this.render();
      return true;
    }

    const { cell } = this.layout;
    const cageTolerance = cell * 0.12;
    const cageIndex = this.puzzle.cages.findIndex((cage) => {
      return cageInsetSegments(this.layout, cage.cells).some((segment) =>
        segmentDistance(
          x,
          y,
          segment.x1,
          segment.y1,
          segment.x2,
          segment.y2,
        ) <= cageTolerance
      );
    });
    if (cageIndex >= 0) {
      this.snapshotForChange();
      this.puzzle.cages.splice(cageIndex, 1);
      this.render();
      return true;
    }
    return false;
  }

  private eraseSolveLinesAt(x: number, y: number): boolean {
    const tolerance = this.layout.cell * 0.2;
    const index = this.puzzle.solveLines.findIndex((line) =>
      this.hitLineAt(line, x, y, tolerance)
    );
    if (index < 0) return false;
    this.snapshotForChange();
    this.puzzle.solveLines.splice(index, 1);
    this.render();
    return true;
  }

  private hitLineAt(
    line: LineConstraint,
    x: number,
    y: number,
    tolerance: number,
  ): boolean {
    if (line.edges && line.edges.length > 0) {
      return line.edges.some(([a, b]) => {
        const from = cellCenter(this.layout, a[0], a[1]);
        const to = cellCenter(this.layout, b[0], b[1]);
        return segmentDistance(x, y, from.x, from.y, to.x, to.y) <= tolerance;
      });
    }
    for (let i = 1; i < line.cells.length; i++) {
      const from = cellCenter(this.layout, line.cells[i - 1][0], line.cells[i - 1][1]);
      const to = cellCenter(this.layout, line.cells[i][0], line.cells[i][1]);
      if (segmentDistance(x, y, from.x, from.y, to.x, to.y) <= tolerance) return true;
    }
    return false;
  }

  // ==========================================================================
  // 键盘导航 / 输入
  // ==========================================================================

  moveSelection(dr: number, dc: number): void {
    if (!this.selection) {
      this.setSingleSelection(
        Math.floor(this.puzzle.grid.rows / 2),
        Math.floor(this.puzzle.grid.cols / 2),
      );
      this.render();
      return;
    }
    let [r, c] = this.selection;
    r = (r + dr + this.puzzle.grid.rows) % this.puzzle.grid.rows;
    c = (c + dc + this.puzzle.grid.cols) % this.puzzle.grid.cols;
    this.setSingleSelection(r, c);
    this.render();
  }

  keyDigit(digit: number): void {
    this.keyToken(String(digit));
  }

  keyToken(token: CellToken): void {
    if (this.tool === "skyscraper" && this.mode === "edit") {
      const numeric = Number(token);
      if (Number.isFinite(numeric)) this.skyscraperValue = numeric;
      this.render();
      return;
    }
    if (this.tool === "x-sum" && this.mode === "edit") {
      const numeric = Number(token);
      if (Number.isFinite(numeric)) this.xSumValue = numeric;
      this.render();
      return;
    }
    if (this.tool === "little-killer" && this.mode === "edit") {
      const numeric = Number(token);
      if (Number.isFinite(numeric)) this.littleKillerValue = numeric;
      this.render();
      return;
    }
    if (this.inputSelections().length === 0) return;
    if (this.tool === "digit") this.applyValueToSelections(token, false);
    else if (this.tool === "corner") this.applyCandidateToSelections("corner", token);
    else if (this.tool === "center") this.applyCandidateToSelections("center", token);
  }

  applyPaletteToken(rawToken: string): void {
    const token = Array.from(rawToken)[0] ?? "";
    if (!token) return;
    if (this.inputSelections().length === 0) return;
    if (this.tool === "digit") this.applyValueToSelections(token, true);
    else if (this.tool === "corner") this.applyCandidateToSelections("corner", token);
    else if (this.tool === "center") this.applyCandidateToSelections("center", token);
    else this.render();
  }

  setTokenPalette(palette: "digits" | "letters" | "symbols"): void {
    this.tokenPalette = palette;
    this.render();
  }

  setCustomCellToken(rawToken: string): void {
    this.customCellToken = Array.from(rawToken)[0] ?? "";
  }

  markCornerOnSelection(token: CellToken): void {
    this.applyCandidateToSelections("corner", String(token));
  }

  markCenterOnSelection(token: CellToken): void {
    this.applyCandidateToSelections("center", String(token));
  }

  keyClear(): void {
    const targets = this.inputSelections();
    if (targets.length === 0) return;
    const editableTargets = targets.filter(([r, c]) =>
      this.mode === "edit" || !this.puzzle.cells[r][c].given
    );
    const hasChanges = targets.some(([r, c]) => {
      const cell = this.puzzle.cells[r][c];
      if (this.tool === "digit") return editableTargets.some(([rr, cc]) => rr === r && cc === c) &&
        (cell.value !== "" || cell.corner.length > 0 || cell.center.length > 0);
      if (this.tool === "corner") return editableTargets.some(([rr, cc]) => rr === r && cc === c) && cell.corner.length > 0;
      if (this.tool === "center") return editableTargets.some(([rr, cc]) => rr === r && cc === c) && cell.center.length > 0;
      if (this.tool === "color") return cell.colors.length > 0;
      if (this.tool === "cell-shape" && this.mode === "edit") return cell.decorations.length > 0;
      return false;
    });
    if (!hasChanges) return;
    this.history.snapshot(this.puzzle);
    for (const [r, c] of targets) {
      const cell = this.puzzle.cells[r][c];
      const editable = this.mode === "edit" || !cell.given;
      if (this.tool === "digit" && editable) {
        cell.value = "";
        cell.given = false;
        cell.corner = [];
        cell.center = [];
      } else if (this.tool === "corner" && editable) cell.corner = [];
      else if (this.tool === "center" && editable) cell.center = [];
      else if (this.tool === "color") cell.colors = [];
      else if (this.tool === "cell-shape" && this.mode === "edit") cell.decorations = [];
    }
    this.render();
  }

  cancelPending(): void {
    if (this.pendingPath) {
      this.pendingPath = null;
      this.render();
    }
    if (this.pendingCage) {
      this.pendingCage = null;
      this.pendingCageId = null;
      this.render();
    }
    if (this.pendingCustomEdges) {
      this.pendingCustomEdges = null;
      this.lastCustomCell = null;
      this.render();
    }
  }

  // ==========================================================================
  // 悬停（用于边 / 角工具的命中预览）
  // ==========================================================================

  updateHover(x: number, y: number): void {
    if (this.tool === "skyscraper" || this.tool === "x-sum") {
      this.hover = hitOutside(
        this.layout,
        x,
        y,
        this.layout.cell * 0.34,
      );
      this.render();
      return;
    }
    if (this.tool.startsWith("edge")) {
      this.hover = hitEdge(this.layout, x, y, this.layout.cell * 0.24);
      this.render();
      return;
    }
    if (this.tool === "little-killer") {
      this.hover = hitOuterCell(this.layout, x, y);
      this.render();
      return;
    }
    if (this.tool === "corner-arrow" || this.tool === "corner-text") {
      this.hover = hitCorner(this.layout, x, y, this.layout.cell * 0.3);
      this.render();
      return;
    }
    if (this.tool === "lookout") {
      this.hover = hitCorner(this.layout, x, y, this.layout.cell * 0.3)
        ?? hitEdge(this.layout, x, y, this.layout.cell * 0.24);
      this.render();
      return;
    }
    if (this.tool === "erase") {
      if (this.mode === "solve") {
        const edge = hitEdge(this.layout, x, y, this.layout.cell * 0.22);
        const edgeData = edge ? this.getEdge(edge.kind, edge.r, edge.c) : null;
        this.hover = edge && edgeData && (edgeData.bold || edgeData.decorations.length > 0)
          ? edge
          : null;
        this.render();
        return;
      }
      const outerCell = hitOuterCell(this.layout, x, y);
      if (outerCell && this.puzzle.littleKillers.some(
        (clue) => clue.anchor.r === outerCell.r && clue.anchor.c === outerCell.c,
      )) {
        this.hover = outerCell;
        this.render();
        return;
      }
      this.hover =
        hitCorner(this.layout, x, y, this.layout.cell * 0.32) ??
        hitEdge(this.layout, x, y, this.layout.cell * 0.22);
      this.render();
      return;
    }
    if (this.hover) {
      this.hover = null;
      this.render();
    }
  }

  clearHover(): void {
    if (this.hover) {
      this.hover = null;
      this.render();
    }
  }

  // ==========================================================================
  // 导出 / 导入
  // ==========================================================================

  exportJSON(): string {
    return JSON.stringify(this.puzzle, null, 2);
  }

  importJSON(json: string): boolean {
    try {
      const normalized = deserializePuzzle(json);
      if (!Array.isArray(normalized.cells) || normalized.cells.length !== normalized.grid.rows) return false;
      this.loadPuzzle(normalized);
      return true;
    } catch {
      return false;
    }
  }

  getLayout(): Layout {
    return this.layout;
  }

  /** 供几何查询使用的顶点坐标（输入层判断点击目标） */
  hitTest(x: number, y: number): HitTarget | null {
    if (this.tool === "skyscraper" || this.tool === "x-sum") {
      return hitOutside(this.layout, x, y, this.layout.cell * 0.34);
    }
    if (this.tool.startsWith("edge")) {
      const edge = hitEdge(this.layout, x, y, this.layout.cell * 0.24);
      if (edge) return edge;
      return null;
    }
    if (this.tool === "little-killer") {
      return hitOuterCell(this.layout, x, y);
    }
    if (this.tool === "corner-arrow" || this.tool === "corner-text") {
      return hitCorner(this.layout, x, y, this.layout.cell * 0.3);
    }
    if (this.tool === "lookout") {
      return hitCorner(this.layout, x, y, this.layout.cell * 0.3)
        ?? hitEdge(this.layout, x, y, this.layout.cell * 0.24);
    }
    return hitCell(this.layout, x, y);
  }

  vertexXY(r: number, c: number): { x: number; y: number } {
    return vertexPoint(this.layout, r, c);
  }
}
