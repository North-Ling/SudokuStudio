// ============================================================================
// 数独工具的核心数据类型
// 网格元素分为三类，均可交互、可编辑、可加符号：
//   面 (Cell)   —— rows×cols 单元格
//   边 (Edge)   —— 相邻两格之间的边框
//   角 (Corner) —— (rows+1)×(cols+1) 网格顶点
// ============================================================================

export type CellRef = [number, number]; // [row, col]，0-based
export type CellToken = string; // 空字符串表示空格，其余为单个显示字符

export type StandardGridSize = 6 | 8 | 9 | 12 | 16;
export type RegionMode = "standard" | "none";
export type ValidationMode = "row-column-region" | "row-column" | "none";

export interface GridSpec {
  rows: number;
  cols: number;
  /** 仅当行列相等且属于内置标准尺寸时存在。 */
  preset: StandardGridSize | null;
  /** standard 表示绘制规则矩形宫；none 可由出题人手绘不规则边界。 */
  regionMode: RegionMode;
  boxRows?: number;
  boxCols?: number;
  validationMode: ValidationMode;
}

export type ColorName =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "pink"
  | "grey";

export type EightDirection =
  | "up"
  | "up-right"
  | "right"
  | "down-right"
  | "down"
  | "down-left"
  | "left"
  | "up-left";

export type CellDecoration =
  | { kind: "square" | "circle" | "triangle" | "cross" }
  | { kind: "arrow"; direction: EightDirection }
  | { kind: "custom"; text: string };

export interface CellData {
  /** 空字符串 = 空；默认使用 1-9，也支持任意单字符 */
  value: CellToken;
  /** 是否为题目给出的已知数（线索） */
  given: boolean;
  /** 中标候选字符（居中紧凑显示） */
  corner: CellToken[];
  /** 角标候选字符（按当前网格的候选布局排列） */
  center: CellToken[];
  /** 单元格着色（多种颜色按等分扇形共同填满格子） */
  colors: ColorName[];
  /** 格内题面形状，可叠加 */
  decorations: CellDecoration[];
}

// ---- 边上的符号 ----
export type EdgeSymbol =
  | { kind: "dot"; color: "white" | "black" } // 黑白点（连续/倍数）
  | { kind: "vx"; value: "V" | "X" } // V=和为5，X=和为10
  | { kind: "ineq"; greater: "first" | "second" } // first=左/上格，second=右/下格
  | { kind: "text"; text: string }; // 自定义文字

export interface EdgeData {
  /** 是否加粗（用于分隔区域 / 笼边框等） */
  bold: boolean;
  symbol: EdgeSymbol | null;
  /** 与约束 symbol 分离的自由边装饰，可叠加 */
  decorations: EdgeDecoration[];
}

export type EdgeDecoration =
  | { kind: "cross" | "triangle" | "square" | "circle" }
  | { kind: "custom"; text: string };

// ---- 角上的符号 ----
export type Direction = "up" | "down" | "left" | "right";

export type CornerSymbol =
  | { kind: "arrow"; dir: Direction } // 指向外部的箭头
  | { kind: "text"; text: string }; // 自定义文字 / 数字

export interface CornerData {
  symbols: CornerSymbol[];
}

// ---- 高层约束 ----
export type CageRelation = "equal" | "at-least" | "at-most" | "none" | "custom";

export interface KillerCage {
  id: number;
  cells: CellRef[];
  /** equal=和值；at-least/at-most=和值上下界；none=纯虚线区域；custom=任意文字 */
  relation: CageRelation;
  /** none / custom 时为 null，其余模式为提示数字 */
  sum: number | null;
  /** custom 模式下左上角显示的任意文字 */
  text?: string;
  /** 提示文字颜色（CSS 颜色） */
  color?: string;
  /** 提示文字大小（相对单元格边长的百分比，默认 22） */
  fontSize?: number;
}

export interface LineStyle {
  /** CSS 颜色 */
  color?: string;
  /** 相对单元格边长的百分比 */
  thickness?: number;
}

export interface Thermo extends LineStyle {
  id: number;
  /** 有序路径，cells[0] 为温度计泡（最小），逐格递增 */
  cells: CellRef[];
}

export interface Arrow extends LineStyle {
  id: number;
  /** 有序路径，cells[0] 为圆圈（求和格），cells[last] 为箭头尖端 */
  cells: CellRef[];
}

export type LineConstraintKind =
  | "region-sum"
  | "zipper"
  | "ten-sum"
  | "renban"
  | "anti-factor"
  | "german-whisper"
  | "dutch-whisper"
  | "parity"
  | "entropy"
  | "between"
  | "palindrome"
  | "custom";

export interface LineConstraint extends LineStyle {
  id: number;
  kind: LineConstraintKind;
  /** 按绘制顺序排列，允许横、竖和斜向连接 */
  cells: CellRef[];
  /**
   * 仅自定义线（custom）使用：相邻格对集合，支持分叉与环。
   * 存在时渲染与擦除优先使用它，cells 仅作为向后兼容的回退。
   */
  edges?: Array<[CellRef, CellRef]>;
  /** 自定义线的文字规则说明 */
  description?: string;
}

export interface GlobalConstraints {
  /** 两条主对角线上的数字分别不重复 */
  diagonal: boolean;
  /** 国际象棋马步相邻的格子不能填相同数字 */
  antiKnight: boolean;
  /** 国际象棋王步对角相邻的格子不能填相同数字 */
  antiKing: boolean;
  /** 上下左右相邻的格子不能出现相差 1 的数字 */
  nonConsecutive: boolean;
}

export type LookoutAnchor =
  | { kind: "corner"; r: number; c: number }
  | { kind: "edgeH" | "edgeV"; r: number; c: number };

export interface LookoutClue {
  anchor: LookoutAnchor;
  /** 圈内列出的互不相同字符 */
  digits: CellToken[];
}

export type GridSide = "top" | "right" | "bottom" | "left";

export interface SkyscraperClue {
  side: GridSide;
  /** 从左到右或从上到下的 0-based 位置 */
  index: number;
  /** 可见楼房数量，范围取对应行或列长度 */
  value: number;
}

export interface XSumClue {
  side: GridSide;
  index: number;
  /** 从该方向观察的 X 和提示值 */
  value: number;
}

export type DiagonalDirection = "up-left" | "up-right" | "down-left" | "down-right";

export interface LittleKillerClue {
  /** (rows+2)×(cols+2) 虚拟网格外圈中的锚点单元格 */
  anchor: { r: number; c: number };
  direction: DiagonalDirection;
  /** 沿该斜线经过的所有格子之和 */
  value: number;
}

// ---- 整个谜题文档 ----
export interface Puzzle {
  title: string;
  /** 展示给解题者的规则 / 限制条件说明 */
  rules: string;
  /** 0–5 星，步长 0.5；0 表示未设置难度。 */
  difficulty: number;
  grid: GridSpec;
  cells: CellData[][];
  /**
   * 横向相邻两格之间的边：edgeH[r][c] 分隔 (r,c) 与 (r,c+1)，r∈0..8, c∈0..7
   * （该边是竖直的线段）
   */
  edgeH: EdgeData[][];
  /**
   * 纵向相邻两格之间的边：edgeV[r][c] 分隔 (r,c) 与 (r+1,c)，r∈0..7, c∈0..8
   * （该边是水平的线段）
   */
  edgeV: EdgeData[][];
  /** 网格顶点：corner[r][c]，r∈0..rows，c∈0..cols */
  corners: CornerData[][];
  cages: KillerCage[];
  thermos: Thermo[];
  arrows: Arrow[];
  lines: LineConstraint[];
  globalConstraints: GlobalConstraints;
  lookouts: LookoutClue[];
  skyscrapers: SkyscraperClue[];
  xSums: XSumClue[];
  littleKillers: LittleKillerClue[];
  /** 解题模式下绘制的自由草稿线，不随题面导出。 */
  solveLines: LineConstraint[];
}
