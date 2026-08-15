import type { Puzzle } from "./types";
import {
  arrowSymbol,
  cornerTextSymbol,
  createEmptyPuzzle,
  dotSymbol,
  inequalitySymbol,
  vxSymbol,
} from "./model";

export interface PuzzleDef {
  name: string;
  description: string;
  build: () => Puzzle;
}

function setGivens(p: Puzzle, rows: string): void {
  const lines = rows
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const ch = lines[r]?.[c] ?? "0";
      const v = ch === "." || ch === "0" || ch === " " ? "" : ch;
      if (/^[1-9]$/.test(v)) {
        p.cells[r][c].value = v;
        p.cells[r][c].given = true;
      }
    }
  }
}

// 经典数独（Wikipedia 示例，保证唯一解）
const CLASSIC = `
530070000
600195000
098000060
800060003
400803001
700020006
060000280
000419005
000080079
`;

function classicPuzzle(): Puzzle {
  const p = createEmptyPuzzle("经典数独");
  setGivens(p, CLASSIC);
  return p;
}

// 展示谜题：演示面 / 边 / 角符号与约束工具
function showcasePuzzle(): Puzzle {
  const p = createEmptyPuzzle("约束展示");
  p.rules = "标准数独规则适用。盘面同时展示 Killer、黑白点、不等号、XV、摩天楼、箭头与温度计约束。";
  setGivens(
    p,
    `
.........
.1...4...
.........
..3......
....7....
......2..
.........
...8...6.
.........
`,
  );

  // 边符号：黑白点（连续 / 倍数）
  p.edgeH[0][0].symbol = dotSymbol("white");
  p.edgeH[1][0].symbol = dotSymbol("black");
  p.edgeV[0][1].symbol = dotSymbol("white");
  // 边符号：V（和为 5）/ X（和为 10）
  p.edgeH[2][0].symbol = vxSymbol("V");
  p.edgeH[3][0].symbol = vxSymbol("X");
  // 不等号：左格大于右格 / 下格大于上格
  p.edgeH[4][0].symbol = inequalitySymbol("first");
  p.edgeV[4][1].symbol = inequalitySymbol("second");
  // 边符号：自定义文字
  p.edgeH[8][4].symbol = { kind: "text", text: "×2" };
  // 加粗边（分隔区域）
  p.edgeH[5][2].bold = true;
  p.edgeH[6][2].bold = true;
  p.edgeV[5][2].bold = true;

  // 角符号：箭头（外侧小杀手线索）
  p.corners[0][1].symbols.push(arrowSymbol("down"));
  p.corners[0][4].symbols.push(arrowSymbol("down"));
  p.corners[0][7].symbols.push(arrowSymbol("down"));
  p.corners[9][2].symbols.push(arrowSymbol("up"));
  p.corners[9][5].symbols.push(arrowSymbol("up"));
  // 角符号：自定义文字（小杀手和）
  p.corners[0][6].symbols.push(cornerTextSymbol("14"));

  // 杀手笼
  p.cages.push({
    id: 1,
    cells: [
      [4, 4],
      [4, 5],
    ],
    relation: "equal",
    sum: 12,
  });
  p.cages.push({
    id: 2,
    cells: [
      [6, 6],
      [6, 7],
      [7, 6],
    ],
    relation: "equal",
    sum: 15,
  });

  // 温度计
  p.thermos.push({
    id: 3,
    cells: [
      [0, 6],
      [0, 7],
      [0, 8],
      [1, 8],
    ],
  });

  // 箭头
  p.arrows.push({
    id: 4,
    cells: [
      [3, 3],
      [3, 4],
      [3, 5],
    ],
  });

  // 摩天楼外侧提示
  p.skyscrapers.push(
    { side: "top", index: 2, value: 4 },
    { side: "left", index: 3, value: 3 },
    { side: "right", index: 5, value: 2 },
  );

  // 单元格着色
  p.cells[5][5].colors = ["blue"];
  p.cells[5][6].colors = ["green"];
  p.cells[6][5].colors = ["pink"];

  return p;
}

export const PUZZLES: PuzzleDef[] = [
  { name: "经典数独", description: "标准 9×9 数独", build: classicPuzzle },
  {
    name: "约束展示",
    description: "Killer、黑白点、不等号、XV、摩天楼、箭头与温度计",
    build: showcasePuzzle,
  },
  { name: "空白网格", description: "从零开始自由创作", build: () => createEmptyPuzzle("空白网格") },
];
