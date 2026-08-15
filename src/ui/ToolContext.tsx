import type { ChangeEvent, ReactNode } from "react";
import { isPathTool, pathTypeForTool, type App } from "../app";
import { COLOR_PALETTE, LINE_RULE_DESCRIPTIONS } from "../model";
import { candidateGridShape, gridTokens, letterGridTokens, maximumStandardSum } from "../grid";
import type {
  CellDecoration,
  ColorName,
  DiagonalDirection,
  Direction,
  EdgeDecoration,
  EightDirection,
} from "../types";

const SWATCH_CSS: Record<ColorName, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  grey: "#9ca3af",
};

interface Props {
  app: App;
  sync: () => void;
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="hint">{children}</div>;
}

function CharacterDial({ app, sync }: Props) {
  const tokens = app.tokenPalette === "digits"
    ? gridTokens(app.puzzle.grid)
    : letterGridTokens(app.puzzle.grid);
  const candidateShape = candidateGridShape(app.puzzle.grid);
  const applyCustom = () => {
    if (!app.customCellToken) return;
    app.applyPaletteToken(app.customCellToken);
    sync();
  };
  return <div className="character-dial" aria-label="字符罗盘">
    <div className="selection-summary">
      {app.selection ? `已选择 ${Math.max(1, app.selectedCells.length)} 格` : "请先选择格子"}
      <span>普通单击重选 · 拖动扩展 · Shift 追加</span>
    </div>
    <div className="palette-switch" role="group" aria-label="候选字符组">
      <button className={app.tokenPalette === "digits" ? "active" : ""} onClick={() => { app.setTokenPalette("digits"); sync(); }}>123</button>
      <button className={app.tokenPalette === "letters" ? "active" : ""} onClick={() => { app.setTokenPalette("letters"); sync(); }}>ABC</button>
    </div>
    <div className="token-grid" style={{ gridTemplateColumns: `repeat(${candidateShape.cols}, minmax(32px, 1fr))` }}>
      {tokens.map((token) => <button
        key={token}
        disabled={!app.selection}
        aria-label={`输入 ${token}`}
        onClick={(event) => {
          app.applyPaletteToken(token);
          event.currentTarget.blur();
          sync();
        }}
      >{token}</button>)}
    </div>
    <div className="custom-token-row">
      <input
        type="text"
        data-input="customCellToken"
        value={app.customCellToken}
        placeholder="任意单字符"
        onChange={(event) => { app.setCustomCellToken(event.target.value); sync(); }}
        onKeyDown={(event) => { if (event.key === "Enter") applyCustom(); }}
      />
      <button disabled={!app.customCellToken || !app.selection} onClick={applyCustom}>填入 / 切换</button>
      <button className="danger keypad-delete" disabled={!app.selection} title="删除全部选中格的对应内容" onClick={() => { app.keyClear(); sync(); }}>⌫ 删除</button>
    </div>
  </div>;
}

export function ToolContext({ app, sync }: Props) {
  const t = app.tool;
  const standardSumMax = maximumStandardSum(app.puzzle.grid);
  const maximumSide = Math.max(app.puzzle.grid.rows, app.puzzle.grid.cols);
  const updateText = (key: "edgeText" | "cornerText" | "cageSum") =>
    (event: ChangeEvent<HTMLInputElement>) => {
      app[key] = event.target.value;
      sync();
    };

  let content: ReactNode;

  if (t === "digit" || t === "corner" || t === "center") {
    const hint = t === "digit"
      ? app.mode === "edit"
        ? "选择格子后，通过小键盘设置题目已知字符；默认使用数字。"
        : "选择格子后，通过小键盘填入数字或字符，也可以直接按键盘快捷键；已知字符不可修改。"
      : t === "corner"
        ? "选择格子后，通过小键盘切换中标（居中候选数）。"
        : "选择格子后，通过小键盘切换角标（按数字位置排列）。";
    content = <>
      <Hint>{hint} 普通单击总是重新选择；按住拖动可沿正交相邻格扩展，按住 Shift 点击或拖动可追加离散区域。字符会一次作用于全部选中格；若全部已有该字符，再点一次即可全部移除。</Hint>
      <CharacterDial app={app} sync={sync} />
    </>;
  } else if (t === "color") {
    content = <>
      <Hint>普通单击总是重新选择；按住拖动可沿正交相邻格扩展，按住 Shift 点击或拖动可追加离散区域。颜色会一次作用于全部选中格；若全部已有该颜色，再点一次即可全部移除。</Hint>
      <div className="selection-summary color-selection-summary">
        {app.selection ? `已选择 ${Math.max(1, app.selectedCells.length)} 格` : "请先选择格子"}
        <span>同一格的多种颜色仍会等分显示</span>
      </div>
      <div className="row color-keypad">
        {COLOR_PALETTE.map((color) => (
          <button
            key={color}
            data-color={color}
            className="swatch"
            style={{ background: SWATCH_CSS[color] }}
            title={color}
            disabled={!app.selection}
            onClick={(event) => {
              app.applyPaletteColor(color);
              event.currentTarget.blur();
              sync();
            }}
          />
        ))}
      </div>
      <div className="row"><button className="danger keypad-delete" disabled={!app.selection} onClick={() => { app.keyClear(); sync(); }}>⌫ 删除颜色</button></div>
    </>;
  } else if (t === "cell-shape") {
    const shapeOptions: Array<[CellDecoration["kind"], string]> = [
      ["square", "□ 正方形"],
      ["circle", "○ 圆形"],
      ["triangle", "△ 三角形"],
      ["cross", "× 大叉号"],
      ["arrow", "↗ 箭头"],
      ["custom", "自定义"],
    ];
    const arrowDirections: Array<[EightDirection, string]> = [
      ["up-left", "↖"], ["up", "↑"], ["up-right", "↗"],
      ["left", "←"], ["right", "→"],
      ["down-left", "↙"], ["down", "↓"], ["down-right", "↘"],
    ];
    content = <>
      <Hint>在单元格内绘制题面形状；不同形状和不同方向的小箭头可以叠加。按住滑动可连续添加或删除当前形状。</Hint>
      <div className="row shape-options">
        {shapeOptions.map(([kind, label]) => <button key={kind} className={`opt-btn${app.cellShapeKind === kind ? " active" : ""}`} onClick={() => { app.cellShapeKind = kind; sync(); }}>{label}</button>)}
      </div>
      {app.cellShapeKind === "arrow" && <div className="direction-grid" aria-label="格内箭头方向">
        {arrowDirections.map(([direction, label]) => <button key={direction} className={`opt-btn${app.cellArrowDirection === direction ? " active" : ""}`} onClick={() => { app.cellArrowDirection = direction; sync(); }}>{label}</button>)}
      </div>}
      {app.cellShapeKind === "custom" && <div className="row">
        <input type="text" data-input="cellShapeText" value={app.cellShapeText} maxLength={6} placeholder="自定义文字或符号" onChange={(event) => { app.cellShapeText = event.target.value; sync(); }} />
      </div>}
    </>;
  } else if (t === "edge-bold") {
    const edgeOptions: Array<["bold" | EdgeDecoration["kind"], string]> = [
      ["bold", "粗线"], ["cross", "× 叉号"], ["triangle", "△ 三角"],
      ["square", "□ 方形"], ["circle", "○ 圆形"], ["custom", "自定义"],
    ];
    content = <>
      <Hint>选择粗线或蓝色边装饰后，按住滑过边连续添加；从已有同款标记开始则连续删除。蓝色装饰与黑白点约束使用不同数据和样式。</Hint>
      <div className="row shape-options">
        {edgeOptions.map(([kind, label]) => <button key={kind} className={`opt-btn${app.edgeDrawKind === kind ? " active" : ""}`} onClick={() => { app.edgeDrawKind = kind; sync(); }}>{label}</button>)}
      </div>
      {app.edgeDrawKind === "custom" && <div className="row">
        <input type="text" data-input="edgeMarkText" value={app.edgeMarkText} maxLength={4} placeholder="边装饰文字" onChange={(event) => { app.edgeMarkText = event.target.value; sync(); }} />
      </div>}
    </>;
  } else if (t === "edge-dot") {
    content = <>
      <Hint><strong>连续 / 黑白点：</strong>白点表示两格相差 1；黑点表示一格是另一格的 2 倍。按住滑过多条边可连续添加或删除。</Hint>
      <div className="row">
        {(["white", "black"] as const).map((color) => (
          <button key={color} data-dot={color} className={`opt-btn${app.dotColor === color ? " active" : ""}`} onClick={() => { app.dotColor = color; sync(); }}>
            {color === "white" ? "白点 · 差 1" : "黑点 · 2 倍"}
          </button>
        ))}
      </div>
    </>;
  } else if (t === "edge-ineq") {
    content = <>
      <Hint><strong>不等号：</strong>开口朝向较大的格子。第一格指左格或上格，第二格指右格或下格。</Hint>
      <div className="row">
        {(["first", "second"] as const).map((greater) => (
          <button key={greater} data-ineq={greater} className={`opt-btn${app.inequalityGreater === greater ? " active" : ""}`} onClick={() => { app.inequalityGreater = greater; sync(); }}>
            {greater === "first" ? "左 / 上较大" : "右 / 下较大"}
          </button>
        ))}
      </div>
    </>;
  } else if (t === "edge-vx") {
    content = <>
      <Hint><strong>XV：</strong>V 表示两格和为 5，X 表示两格和为 10；完整规则下，未标记边不能和为 5 或 10。</Hint>
      <div className="row">
        {(["V", "X"] as const).map((value) => (
          <button key={value} data-vx={value} className={`opt-btn${app.vxValue === value ? " active" : ""}`} onClick={() => { app.vxValue = value; sync(); }}>
            {value}（和={value === "V" ? 5 : 10}）
          </button>
        ))}
      </div>
    </>;
  } else if (t === "edge-text") {
    content = <>
      <Hint>输入文字后按住滑过多条边可连续添加；从相同文字开始则连续删除。</Hint>
      <div className="row"><input type="text" data-input="edgeText" value={app.edgeText} onChange={updateText("edgeText")} maxLength={6} placeholder="边文字" /></div>
    </>;
  } else if (t === "corner-arrow") {
    const directions: Array<[Direction, string]> = [["up", "↑ 上"], ["right", "→ 右"], ["down", "↓ 下"], ["left", "← 左"]];
    content = <>
      <Hint>选择方向后点击网格顶点添加箭头；再次点击取消。</Hint>
      <div className="row">
        {directions.map(([direction, label]) => (
          <button key={direction} data-dir={direction} className={`opt-btn${app.arrowDir === direction ? " active" : ""}`} onClick={() => { app.arrowDir = direction; sync(); }}>{label}</button>
        ))}
      </div>
    </>;
  } else if (t === "corner-text") {
    content = <>
      <Hint>输入文字后点击顶点添加；再次点击取消。</Hint>
      <div className="row"><input type="text" data-input="cornerText" value={app.cornerText} onChange={updateText("cornerText")} maxLength={6} placeholder="顶点文字 / 数字" /></div>
    </>;
  } else if (t === "cage") {
    const cageRelations = [
      ["equal", "和值 ="],
      ["at-least", "和值 ≥"],
      ["at-most", "和值 ≤"],
      ["none", "空框"],
    ] as const;
    content = <>
      <Hint><strong>杀手框：</strong>默认显示笼内数字和值，也可表示和值下限、上限，或只绘制纯虚线区域。按住滑动可连续加入或移出格子。</Hint>
      {app.cageError && <div className="err">{app.cageError}</div>}
      <div className="row shape-options">
        {cageRelations.map(([relation, label]) => (
          <button key={relation} className={`opt-btn${app.cageRelation === relation ? " active" : ""}`} onClick={() => { app.cageRelation = relation; app.cageError = ""; sync(); }}>{label}</button>
        ))}
      </div>
      <div className="row"><input type="number" data-input="cageSum" value={app.cageSum} onChange={updateText("cageSum")} min={1} max={standardSumMax * Math.max(app.puzzle.grid.rows, app.puzzle.grid.cols)} disabled={app.cageRelation === "none"} placeholder={app.cageRelation === "none" ? "空框不显示数字" : "提示数字"} /></div>
      <div className="row">
        <button className="primary" onClick={() => { app.commitCage(); sync(); }}>✓ 完成</button>
        <button className="danger" onClick={() => { app.deleteCage(); sync(); }}>删除笼</button>
        <button onClick={() => { app.cancelCage(); sync(); }}>取消</button>
      </div>
    </>;
  } else if (t === "skyscraper") {
    content = <>
      <Hint><strong>摩天楼：</strong>选择 1-{maximumSide} 后点击盘面外侧。数字表示从该方向能看到的楼房数量，大数会挡住后面的小数。</Hint>
      <div className="row">
        <input
          type="number"
          data-input="skyscraperValue"
          value={app.skyscraperValue}
          min={1}
          max={maximumSide}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) app.skyscraperValue = Math.max(1, Math.min(maximumSide, Math.round(value)));
            sync();
          }}
        />
      </div>
    </>;
  } else if (t === "x-sum") {
    content = <>
      <Hint><strong>X 和：</strong>从该方向看，第一个格子的数字 X 决定要累加前几个格；盘外填写这 X 个数字的总和。</Hint>
      <div className="row">
        <input type="number" data-input="xSumValue" value={app.xSumValue} min={1} max={standardSumMax} onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) app.xSumValue = Math.max(1, Math.min(standardSumMax, Math.round(value)));
          sync();
        }} />
      </div>
    </>;
  } else if (t === "little-killer") {
    const directions: Array<[DiagonalDirection, string]> = [
      ["down-right", "↘"], ["down-left", "↙"],
      ["up-right", "↗"], ["up-left", "↖"],
    ];
    content = <>
      <Hint><strong>小杀手：</strong>选择和值和斜向箭头，再点击盘面虚拟外圈的单元格。数字留在外格内，箭头从外部指向对应的盘面边界交点。</Hint>
      {app.littleKillerError && <div className="err">{app.littleKillerError}</div>}
      <div className="row">
        <input type="number" data-input="littleKillerValue" value={app.littleKillerValue} min={1} max={standardSumMax} onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) app.littleKillerValue = Math.max(1, Math.min(standardSumMax, Math.round(value)));
          sync();
        }} />
        {directions.map(([direction, label]) => <button key={direction} className={`opt-btn direction-btn${app.littleKillerDirection === direction ? " active" : ""}`} onClick={() => { app.littleKillerDirection = direction; app.littleKillerError = ""; sync(); }}>{label}</button>)}
      </div>
    </>;
  } else if (t === "lookout") {
    content = <>
      <Hint><strong>瞭望塔：</strong>输入当前题目字符表中的互不相同字符，再点击网格交汇点或相邻格之间的边；相邻单元格中必须出现圈内全部字符。</Hint>
      <div className="row">
        <input type="text" data-input="lookoutDigits" maxLength={maximumSide} value={app.lookoutDigits} onChange={(event) => {
          const palette = gridTokens(app.puzzle.grid);
          app.lookoutDigits = Array.from(new Set(Array.from(event.target.value.toUpperCase()).filter((token) => palette.includes(token)))).join("");
          sync();
        }} placeholder="例如 34" />
      </div>
    </>;
  } else if (isPathTool(t)) {
    const pathType = pathTypeForTool(t);
    const variantNames = {
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
      custom: "自定义线",
    } as const;
    const description = pathType && pathType !== "thermo" && pathType !== "arrow"
      ? LINE_RULE_DESCRIPTIONS[pathType]
      : pathType === "thermo"
        ? "灯泡端最小，沿温度计严格递增。"
        : "圆圈格是总和，箭头线上其余格子的和等于圆圈数字。";
    const name = pathType && pathType !== "thermo" && pathType !== "arrow"
      ? variantNames[pathType]
      : pathType === "thermo" ? "温度计" : "箭头";
    const hasLineStyle = Boolean(pathType);
    content = <>
      <Hint><strong>{name}：</strong>{description} 按住拖动连续绘制，支持斜向连接和反向回退。</Hint>
      {hasLineStyle && <>
        <div className="row line-style-row">
          <label>颜色 <input type="color" value={app.lineColor} onChange={(event) => { app.setLineColor(event.target.value); sync(); }} /></label>
          <label className="line-width-control">粗细
            <input type="range" min={4} max={30} step={1} value={app.lineThickness} onChange={(event) => { app.setLineThickness(Number(event.target.value)); sync(); }} />
            <output>{app.lineThickness}%</output>
          </label>
        </div>
        {pathType === "custom" && <textarea
          rows={3}
          maxLength={240}
          value={app.customLineDescription}
          placeholder="说明这条自定义线的含义；解题模式会显示此说明"
          onChange={(event) => { app.setCustomLineDescription(event.target.value); sync(); }}
        />}
      </>}
      <div className="row">
        <button className="primary" onClick={() => { app.commitPath(); sync(); }}>✓ 完成</button>
        <button onClick={() => { app.cancelPath(); sync(); }}>取消</button>
        
      </div>
    </>;
  } else {
    content = <Hint>{app.mode === "solve"
      ? "按住滑动可连续清除答案、候选、着色和解题描边；题目约束与已知数保持锁定。"
      : "按住滑动可连续清除格子、边、顶点、盘外提示以及对应约束。"}</Hint>;
  }

  return <div className="context" id="context">{content}</div>;
}
