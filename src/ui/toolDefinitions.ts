import type { ToolMode } from "../app";

export interface ToolDef {
  tool: ToolMode;
  label: string;
  hint: string;
}

export interface ToolGroupDef {
  label: string;
  tools: ToolDef[];
}

export const SOLVE_TOOL_GROUPS: ToolGroupDef[] = [
  {
    label: "解题标记工具",
    tools: [
      { tool: "digit", label: "数字", hint: "选择格子后点击小键盘字符输入（或直接按字符键）" },
      { tool: "center", label: "角标", hint: "选择格子后点击小键盘字符切换角标（Ctrl/Cmd+字符）" },
      { tool: "corner", label: "中标", hint: "选择格子后点击小键盘字符切换中标（Shift+数字）" },
      { tool: "color", label: "着色", hint: "选择格子后点击颜色进行一次填充或移除" },
      { tool: "edge-bold", label: "描边", hint: "在内部或最外圈边上加粗，或连续添加边装饰" },
      { tool: "free-line", label: "画线", hint: "在格子中间自由连线（支持分叉与环），作为解题草稿标记" },
      { tool: "erase", label: "橡皮擦", hint: "清除答案、标记、颜色或解题描边" },
    ],
  },
];

export const AUTHOR_TOOL_GROUPS: ToolGroupDef[] = [
  {
    label: "数字与题面标记",
    tools: [
      { tool: "digit", label: "已知数", hint: "选择格子后点击小键盘字符设置题目给定数字" },
      { tool: "center", label: "角标", hint: "选择格子后点击小键盘字符切换角标" },
      { tool: "corner", label: "中标", hint: "选择格子后点击小键盘字符切换中标" },
      { tool: "color", label: "着色", hint: "选择格子后点击颜色进行一次填充或移除" },
      { tool: "cell-shape", label: "格内形状", hint: "绘制可叠加的方形、圆形、三角、叉号、八向箭头或自定义标记" },
      { tool: "edge-bold", label: "描边", hint: "在内部或最外圈边上加粗，或连续添加边装饰" },
      { tool: "edge-text", label: "边文字", hint: "点击内部边或最外圈边添加自定义文字" },
      { tool: "corner-text", label: "顶点文字", hint: "点击顶点添加文字 / 数字" },
    ],
  },
  {
    label: "格内区域约束",
    tools: [
      { tool: "cage", label: "Killer", hint: "滑过格子连续添加或移出杀手笼" },
      { tool: "fortress", label: "堡垒", hint: "连续铺设灰色堡垒格；边界箭头自动朝向相邻外部格" },
    ],
  },
  {
    label: "格中心线路约束",
    tools: [
      { tool: "thermo", label: "温度计", hint: "灯泡端最小，沿线严格递增" },
      { tool: "arrow", label: "箭头", hint: "线上数字之和等于圆圈格" },
      { tool: "line-region-sum", label: "区域等和线", hint: "线经过各宫的数字之和相等" },
      { tool: "line-zipper", label: "拉链线", hint: "与线中心等距数字的和相等" },
      { tool: "line-ten-sum", label: "十和线", hint: "划分为若干和为 10 的连续子段" },
      { tool: "line-renban", label: "连番线", hint: "线上是一组顺序可打乱的连续数字" },
      { tool: "line-anti-factor", label: "反约数线", hint: "限制线长的倍数和约数，且总和为线长倍数" },
      { tool: "line-german-whisper", label: "德国耳语线", hint: "相邻数字至少相差 5" },
      { tool: "line-dutch-whisper", label: "荷兰耳语线", hint: "相邻数字至少相差 4" },
      { tool: "line-parity", label: "奇偶线", hint: "相邻数字奇偶性不同" },
      { tool: "line-entropy", label: "熵线", hint: "连续三个数字分别来自低中高区间" },
      { tool: "line-between", label: "之间线", hint: "中间数字位于两端数字闭区间内" },
      { tool: "line-palindrome", label: "回文数线", hint: "从线的任意一端读取，数字序列完全相同" },
      { tool: "line-custom", label: "自定义线", hint: "由出题人通过文字说明定义含义" },
    ],
  },
  {
    label: "相邻格边框符号",
    tools: [
      { tool: "edge-dot", label: "黑白点", hint: "白点差 1，黑点为 2 倍关系" },
      { tool: "edge-ineq", label: "不等号", hint: "在相邻格之间添加大小关系" },
      { tool: "edge-vx", label: "XV", hint: "V = 和为 5，X = 和为 10" },
    ],
  },
  {
    label: "交汇点与边上的点约束",
    tools: [
      { tool: "lookout", label: "瞭望塔", hint: "在网格交汇点或边上圈出相邻格必须出现的数字" },
      { tool: "corner-arrow", label: "顶点箭头", hint: "选择方向后点击网格顶点添加箭头" },
    ],
  },
  {
    label: "盘外约束",
    tools: [
      { tool: "skyscraper", label: "摩天楼", hint: "点击盘面外侧添加可见楼房数量" },
      { tool: "x-sum", label: "X 和", hint: "点击盘面外侧添加从该方向观察的 X 和" },
      { tool: "little-killer", label: "小杀手", hint: "在盘外虚拟格添加指向边界交点的斜向箭头与和值" },
    ],
  },
  {
    label: "清理",
    tools: [{ tool: "erase", label: "橡皮擦", hint: "点击格子 / 边 / 角清除内容" }],
  },
];
