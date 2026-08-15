import type { EdgeSymbol, LineConstraintKind, Puzzle } from "./types";
import { LINE_RULE_DESCRIPTIONS } from "./model";

export interface AutomaticRuleDescription {
  key: string;
  label: string;
  description: string;
}

const LINE_LABELS: Record<Exclude<LineConstraintKind, "custom">, string> = {
  "region-sum": "区域等和线",
  zipper: "拉链线",
  "ten-sum": "十和线",
  renban: "连番线",
  "anti-factor": "反约数线",
  "german-whisper": "德国耳语线",
  "dutch-whisper": "荷兰耳语线",
  parity: "奇偶线",
  entropy: "熵线",
  between: "之间线",
  palindrome: "回文数线",
};

function edgeSymbols(puzzle: Puzzle): EdgeSymbol[] {
  return [...puzzle.edgeH, ...puzzle.edgeV]
    .flat()
    .map((edge) => edge.symbol)
    .filter((symbol): symbol is EdgeSymbol => symbol != null);
}

/**
 * 只从具有固定语义的数据结构生成描述；自由形状、文字、描边和自定义线不参与。
 * 返回值为派生状态，不写回 puzzle.rules，因此撤销或删除约束时会自然同步。
 */
export function deriveAutomaticRuleDescriptions(
  puzzle: Puzzle,
): AutomaticRuleDescription[] {
  const rules: AutomaticRuleDescription[] = [];
  const add = (key: string, label: string, description: string) => {
    if (!rules.some((rule) => rule.key === key)) rules.push({ key, label, description });
  };

  if (puzzle.globalConstraints.diagonal) {
    add("diagonal", "主对角线不重复", "两条主对角线上的数字分别不能重复。");
  }
  if (puzzle.globalConstraints.antiKnight) {
    add("anti-knight", "无马数独", "国际象棋马步相邻的两个格子不能出现相同数字。");
  }
  if (puzzle.globalConstraints.antiKing) {
    add("anti-king", "无缘数独", "对角相邻的两个格子不能出现相同数字。");
  }
  if (puzzle.globalConstraints.nonConsecutive) {
    add("non-consecutive", "不连续数独", "上下左右相邻格中的数字不能相差 1。");
  }

  const cageRelations = new Set(puzzle.cages.map((cage) => cage.relation));
  if (cageRelations.has("equal")) {
    add("cage-equal", "Killer 杀手框", "虚线框内数字之和等于左上角提示数。");
  }
  if (cageRelations.has("at-least")) {
    add("cage-at-least", "杀手框下限", "虚线框内数字之和大于等于左上角提示数。");
  }
  if (cageRelations.has("at-most")) {
    add("cage-at-most", "杀手框上限", "虚线框内数字之和小于等于左上角提示数。");
  }
  if (puzzle.thermos.length > 0) {
    add("thermometer", "温度计", "灯泡端为最小值，沿温度计向外数字严格递增。");
  }
  if (puzzle.arrows.length > 0) {
    add("arrow", "箭头", "圆圈格是总和，箭头线上其余格子的数字之和等于圆圈格数字。");
  }

  const lineKinds = new Set(puzzle.lines.map((line) => line.kind));
  for (const [kind, label] of Object.entries(LINE_LABELS) as Array<[
    Exclude<LineConstraintKind, "custom">,
    string,
  ]>) {
    if (lineKinds.has(kind)) add(`line-${kind}`, label, LINE_RULE_DESCRIPTIONS[kind]);
  }

  const symbols = edgeSymbols(puzzle);
  if (symbols.some((symbol) => symbol.kind === "dot" && symbol.color === "white")) {
    add("white-dot", "白点", "白点两侧的数字相差 1。");
  }
  if (symbols.some((symbol) => symbol.kind === "dot" && symbol.color === "black")) {
    add("black-dot", "黑点", "黑点两侧的一格数字是另一格的两倍。");
  }
  if (symbols.some((symbol) => symbol.kind === "ineq")) {
    add("inequality", "不等号", "相邻格数字满足格间不等号所指示的大小关系。");
  }
  if (symbols.some((symbol) => symbol.kind === "vx")) {
    add("vx", "XV", "V 两侧数字之和为 5，X 两侧数字之和为 10；未标记 X/V 的相邻格不能和为 5 或 10。");
  }

  if (puzzle.lookouts.length > 0) {
    add("lookout", "瞭望塔", "与瞭望塔相邻的单元格中必须出现圈内列出的全部字符。");
  }
  if (puzzle.skyscrapers.length > 0) {
    add("skyscraper", "摩天楼", "盘外数字表示从该方向能看到的楼房数量，大数会遮挡后面的小数。");
  }
  if (puzzle.xSums.length > 0) {
    add("x-sum", "X 和", "从盘外看入，第一个格子的数字 X 决定累加前 X 格，盘外提示为这些数字之和。");
  }
  if (puzzle.littleKillers.length > 0) {
    add("little-killer", "小杀手", "盘外提示数等于箭头所指对角线上所有数字之和。");
  }

  return rules;
}
