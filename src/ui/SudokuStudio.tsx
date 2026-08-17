import { useCallback, useEffect, useRef, useState } from "react";
import { App, type AppMode } from "../app";
import { persistPuzzleToFolder, savePuzzleToLibrary, type PuzzleLibraryEntry } from "../library";
import type { Puzzle } from "../types";
// import { validationDescription } from "../grid";
import { deriveAutomaticRuleDescriptions } from "../constraintRules";
import { validatableRuleKeys } from "../constraintValidation";
import { BoardCanvas } from "./BoardCanvas";
import { DifficultyStars } from "./DifficultyStars";
import { LibraryPage } from "./LibraryPage";
import { ExportModal, ImportModal, NewPuzzleModal } from "./Modals";
import { ToolPanel } from "./ToolPanel";

type ModalKind = "export" | "import" | "new" | null;
type PageKind = "studio" | "library";

interface Props {
  initialPuzzle: Puzzle;
}

interface DebugWindow extends Window {
  __sudoku?: App;
}

export function SudokuStudio({ initialPuzzle }: Props) {
  // React Fast Refresh 会保留 hook 状态；若 App 模块已被热替换，旧 class
  // 实例仍会携带旧输入逻辑。通过构造器身份识别并替换实例，避免开发中
  // 出现源码已更新但“隐藏激活字符”仍存活的假象。
  const appRef = useRef<App | null>(null);
  let app = appRef.current;
  if (app == null || Object.getPrototypeOf(app) !== App.prototype) {
    const previous = app;
    app = new App(previous?.puzzle ?? initialPuzzle);
    if (previous?.mode === "edit") app.setMode("edit");
    appRef.current = app;
  }
  const [, setRevision] = useState(0);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>("builtin-0");
  const [modal, setModal] = useState<ModalKind>(null);
  const [page, setPage] = useState<PageKind>("studio");
  const [saveLabel, setSaveLabel] = useState("保存到题库");
  const [focusTitleToken, setFocusTitleToken] = useState(0);
  const saveTimer = useRef<number | null>(null);

  const sync = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    (window as DebugWindow).__sudoku = app;
    return () => {
      delete (window as DebugWindow).__sudoku;
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [app]);

  const setMode = (mode: AppMode) => {
    app.setMode(mode);
    sync();
  };

  const openEntry = (entry: PuzzleLibraryEntry, mode: AppMode) => {
    app.loadPuzzle(entry.puzzle);
    app.setMode(mode);
    setCurrentEntryId(entry.id);
    setPage("studio");
    sync();
  };

  const savePuzzle = () => {
    const title = app.puzzle.title.trim() || "未命名题目";
    const rules = app.puzzle.rules.trim() || "标准数独规则适用";
    app.setPuzzleMetadata(title, rules);
    const saved = savePuzzleToLibrary(app.puzzle, currentEntryId);
    setCurrentEntryId(saved.id);
    setSaveLabel("已保存 ✓");
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSaveLabel("保存到题库"), 1200);
    void persistPuzzleToFolder(app.puzzle).then((ok) => {
      if (!ok) return;
      setSaveLabel("已保存 ✓（已写入文件）");
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => setSaveLabel("保存到题库"), 1600);
    });
    sync();
  };

  const clearPuzzle = () => {
    const message = app.mode === "solve"
      ? "确定清空当前解题记录吗？题目和约束会保留。"
      : "确定清空题面编辑吗？将保留进入出题模式时的已知数字。";
    if (!confirm(message)) return;
    app.clearAll();
    sync();
  };

  return <div className={app.mode === "solve" ? "app-mode-solve" : "app-mode-author"} id="studio-shell">
    <header className="topbar">
      <div className="brand">Sudoku<span>Studio</span></div>
      <button id="btn-library" className={`library-button${page === "library" ? " active" : ""}`} title="打开题库页面" onClick={() => { setModal(null); setPage("library"); }}>▦ 题库</button>
      {/* <div className="topbar-title">{page === "library" ? "数独题库" : app.puzzle.title || "未命名题目"}</div> */}
      {page === "studio" ? <>
        <div className="mode-switch" role="group" aria-label="工作模式">
        <button data-mode="solve" className={app.mode === "solve" ? "active" : ""} onClick={() => setMode("solve")} title="进入独立的解题窗口">
          <span>解题</span>
        </button>
        <button data-mode="edit" className={app.mode === "edit" ? "active" : ""} onClick={() => setMode("edit")} title="进入独立的出题窗口">
          <span>出题</span>
        </button>
      </div>
      <div className="spacer" />
      <button id="btn-undo" disabled={!app.canUndo()} onClick={() => { app.undo(); sync(); }} title="撤销 (Ctrl/Cmd+Z)">↶ 撤销</button>
      <button id="btn-redo" disabled={!app.canRedo()} onClick={() => { app.redo(); sync(); }} title="重做 (Ctrl/Cmd+Shift+Z)">↷ 重做</button>
      <button id="btn-reset" onClick={() => { app.resetPuzzle(); sync(); }} title="重置到当前谜题初始状态">重置</button>
      <button id="btn-clear" onClick={clearPuzzle} title="清空当前内容">清空</button>
      {app.mode === "edit" && <div className="author-actions">
        <button id="btn-new" onClick={() => {
          setModal("new");
        }} title="创建一道空白题目">＋ 新建题目</button>
        <button id="btn-save" className="primary-action" onClick={savePuzzle} title="保存到浏览器本地题库">{saveLabel}</button>
        <button id="btn-export" onClick={() => setModal("export")} title="导出 PNG 题目卡片或 JSON">导出</button>
        <button id="btn-import" onClick={() => setModal("import")} title="从 JSON 导入">导入</button>
      </div>}
      </> : <>
        <div className="spacer" />
        <button className="primary-action" onClick={() => setPage("studio")}>← 返回工作台</button>
      </>}
    </header>

    {page === "studio" ? <main className="main">
      <div className="board-wrap" id="board-wrap">
        <PuzzleInfo app={app} sync={sync} focusTitleToken={focusTitleToken} />
        <BoardCanvas app={app} sync={sync} />
        <div className="made-by">Made by NorthLing</div>
      </div>
      <ToolPanel app={app} sync={sync} />
    </main> : <LibraryPage
      currentEntryId={currentEntryId}
      openEntry={openEntry}
      onDelete={(id) => { if (currentEntryId === id) setCurrentEntryId(null); }}
    />}

    {/* {page === "studio"
      ? <HelpBar app={app} />
      : <div className="helpbar"><span className="mode-note">独立题库页面</span>&nbsp;·&nbsp; 我的题目保存在当前浏览器本地</div>} */}

    {modal === "new" && <NewPuzzleModal close={() => setModal(null)} create={(grid) => {
      app.newEmptyPuzzle(grid);
      app.setMode("edit");
      setCurrentEntryId(null);
      setModal(null);
      setFocusTitleToken((value) => value + 1);
      sync();
    }} />}
    {modal === "export" && <ExportModal puzzle={app.puzzle} json={app.exportJSON()} close={() => setModal(null)} />}
    {modal === "import" && <ImportModal app={app} close={() => setModal(null)} imported={() => {
      setCurrentEntryId(null);
      setModal(null);
      sync();
    }} />}
  </div>;
}

function PuzzleInfo({ app, sync, focusTitleToken }: { app: App; sync: () => void; focusTitleToken: number }) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusTitleToken > 0) titleRef.current?.focus();
  }, [focusTitleToken]);

  const title = app.puzzle.title || "未命名题目";
  const rules = app.puzzle.rules?.trim() || "标准数独规则适用";
  const automaticRules = deriveAutomaticRuleDescriptions(app.puzzle);
  const customLineDescriptions = Array.from(new Set(
    app.puzzle.lines
      .filter((line) => line.kind === "custom")
      .map((line) => line.description?.trim())
      .filter((description): description is string => Boolean(description)),
  ));
  return <section className="puzzle-info" id="puzzle-info">
    {/* <div className="window-label">{app.mode === "solve" ? "解题窗口" : "出题工作台"}</div> */}
    {app.mode === "solve"
      ? <div className="puzzle-heading">
        <h1>{title}</h1>
        {/* <div className="grid-badge">{app.puzzle.grid.rows}×{app.puzzle.grid.cols}{app.puzzle.grid.regionMode === "standard" ? ` · ${app.puzzle.grid.boxRows}×${app.puzzle.grid.boxCols} 宫` : " · 无标准宫"}</div> */}
        <DifficultyStars value={app.puzzle.difficulty} compact />
        <p>{rules}</p>
        {automaticRules.length > 0 && <AutomaticRules rules={automaticRules} violatedKeys={new Set(app.getViolatedRuleKeys())} />}
        {customLineDescriptions.map((description) => (
          <p key={description} className="custom-line-rule">自定义线：{description}</p>
        ))}
      </div>
      : <div className="puzzle-editor">
        {/* <div className="grid-badge">{app.puzzle.grid.rows}×{app.puzzle.grid.cols}{app.puzzle.grid.regionMode === "standard" ? ` · ${app.puzzle.grid.boxRows}×${app.puzzle.grid.boxCols} 标准宫` : " · 无标准宫"} · {validationDescription(app.puzzle.grid)}</div> */}
        <label>题目名称
          <input
            ref={titleRef}
            data-meta="title"
            maxLength={80}
            value={app.puzzle.title}
            onChange={(event) => { app.setPuzzleMetadata(event.target.value, app.puzzle.rules); sync(); }}
          />
        </label>
        <div className="difficulty-field">
          <div className="field-label">难度星级</div>
          <DifficultyStars
            value={app.puzzle.difficulty}
            editable
            onChange={(value) => { app.setPuzzleDifficulty(value); sync(); }}
          />
        </div>
        <label>限制条件
          <textarea
            data-meta="rules"
            rows={5}
            value={app.puzzle.rules}
            onChange={(event) => { app.setPuzzleMetadata(app.puzzle.title, event.target.value); sync(); }}
          />
        </label>
        {/* <div className="metadata-tip">留空保存时恢复默认规则。</div> */}
        <div className="automatic-rules-editor">
          {/* <div><strong>自动约束描述</strong><span>随题面约束实时更新，不修改上方手写文本</span></div> */}
          {automaticRules.length > 0
            ? <AutomaticRules rules={automaticRules} editable app={app} sync={sync} />
            : <div className="automatic-rules-empty"></div>}
        </div>
      </div>}
  </section>;
}

function AutomaticRules({ rules, editable = false, violatedKeys, app, sync }: {
  rules: ReturnType<typeof deriveAutomaticRuleDescriptions>;
  editable?: boolean;
  violatedKeys?: Set<string>;
  app?: App;
  sync?: () => void;
}) {
  const validatable = new Set(validatableRuleKeys());
  return <div className="automatic-rules">
    {rules.map((rule) => {
      const isViolated = violatedKeys?.has(rule.key) ?? false;
      const isDisabled = editable && app
        ? (app.puzzle.disabledRuleKeys ?? []).includes(rule.key)
        : false;
      const canToggle = validatable.has(rule.key);
      return <div key={rule.key} className={`automatic-rule${isViolated ? " violated" : ""}${isDisabled ? " disabled" : ""}`}>
        <div className="automatic-rule-head">
          <strong>{rule.label}</strong>
          {editable && canToggle && <label className="rule-toggle" title="启用 / 禁用该约束的自动判错">
            <input type="checkbox" checked={!isDisabled} onChange={() => { app?.toggleRuleValidation(rule.key); sync?.(); }} />
          </label>}
          {!editable && isViolated && <span className="rule-alert" title="此约束不成立">!</span>}
        </div>
        <span className="automatic-rule-desc">{rule.description}</span>
      </div>;
    })}
  </div>;
}

// function HelpBar({ app }: { app: App }) {
//   const validation = validationDescription(app.puzzle.grid);
//   return <div className="helpbar">
//     {app.mode === "solve" ? <>
//       <span className="mode-note">解题模式</span>
//       &nbsp;·&nbsp; 字符键填入/标记 &nbsp;·&nbsp; <kbd>Shift</kbd>+字符 中标 &nbsp;·&nbsp; <kbd>Ctrl/Cmd</kbd>+字符 角标 &nbsp;·&nbsp; <kbd>Del</kbd> 清除 &nbsp;·&nbsp; {validation}
//     </> : <>
//       <span className="mode-note">出题模式</span>
//       &nbsp;·&nbsp; 箭头与温度计支持斜向连接 &nbsp;·&nbsp; {validation} &nbsp;·&nbsp; <kbd>Esc</kbd> 取消绘制
//     </>}
//   </div>;
// }
