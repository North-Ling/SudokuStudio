import { useEffect, useState, type ReactNode } from "react";
import type { App } from "../app";
import {
  createGridSpec,
  STANDARD_GRID_PRESETS,
  standardPresetFor,
  validationDescription,
} from "../grid";
import { createPuzzleCardBlob, downloadBlob, puzzleCardFilename } from "../puzzleCard";
import type { GridSpec, Puzzle } from "../types";

interface ModalFrameProps {
  title: string;
  close: () => void;
  children: ReactNode;
}

function ModalFrame({ title, close, children }: ModalFrameProps) {
  return <div className="modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) close();
  }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </div>
  </div>;
}

interface NewPuzzleModalProps {
  close: () => void;
  create: (grid: GridSpec) => void;
}

export function NewPuzzleModal({ close, create }: NewPuzzleModalProps) {
  const [rows, setRows] = useState(9);
  const [cols, setCols] = useState(9);
  const [standardRegions, setStandardRegions] = useState(true);
  const preset = standardPresetFor(rows, cols);
  const grid = createGridSpec(rows, cols, preset != null && standardRegions);

  const setDimension = (value: number, setter: (next: number) => void) => {
    setter(Math.max(1, Math.min(16, Math.round(value || 1))));
  };

  return <ModalFrame title="新建题目 · 选择数独样式" close={close}>
    <div className="new-puzzle-section">
      <div className="new-puzzle-label">标准大小</div>
      <div className="preset-grid">
        {STANDARD_GRID_PRESETS.map((item) => (
          <button
            key={item.size}
            className={rows === item.size && cols === item.size ? "active" : ""}
            onClick={() => {
              setRows(item.size);
              setCols(item.size);
              setStandardRegions(true);
            }}
          >
            <strong>{item.size}×{item.size}</strong>
            <small>{item.boxRows}×{item.boxCols} 宫</small>
          </button>
        ))}
      </div>
    </div>

    <div className="new-puzzle-section">
      <div className="new-puzzle-label">自定义网格</div>
      <div className="dimension-row">
        <label>行数
          <input type="number" min={1} max={16} value={rows} onChange={(event) => setDimension(Number(event.target.value), setRows)} />
        </label>
        <span>×</span>
        <label>列数
          <input type="number" min={1} max={16} value={cols} onChange={(event) => setDimension(Number(event.target.value), setCols)} />
        </label>
      </div>
    </div>

    {preset
      ? <label className="standard-region-option">
        <input type="checkbox" checked={standardRegions} onChange={(event) => setStandardRegions(event.target.checked)} />
        <span>
          <strong>绘制标准宫格</strong>
          <small>{preset.boxRows} 行 × {preset.boxCols} 列；关闭后可用描边工具绘制不规则宫</small>
        </span>
      </label>
      : <div className="freeform-grid-note">
        非标准比例按自由网格创建，不绘制标准宫，也不启用自动判错。
      </div>}

    <div className="grid-summary">
      <strong>{grid.rows}×{grid.cols}</strong>
      <span>{grid.regionMode === "standard" ? `${grid.boxRows}×${grid.boxCols} 标准宫` : "无标准宫"}</span>
      <span>{validationDescription(grid)}</span>
    </div>

    <div className="modal-actions">
      <button onClick={close}>取消</button>
      <button className="primary" onClick={() => create(grid)}>创建题目</button>
    </div>
  </ModalFrame>;
}

interface ExportModalProps {
  json: string;
  puzzle: Puzzle;
  close: () => void;
}

export function ExportModal({ json, puzzle, close }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<"png" | "json">("png");
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cardError, setCardError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void createPuzzleCardBlob(puzzle).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setCardBlob(blob);
      setPreviewUrl(objectUrl);
    }).catch((error: unknown) => {
      if (active) setCardError(error instanceof Error ? error.message : "生成 PNG 失败");
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [puzzle]);

  const jsonName = `${(puzzle.title.trim() || "未命名题目").replace(/[\\/:*?"<>|]/g, "-")}.json`;
  return <ModalFrame title="导出谜题" close={close}>
    <div className="export-format-tabs" role="tablist" aria-label="导出格式">
      <button role="tab" aria-selected={format === "png"} className={format === "png" ? "active" : ""} onClick={() => setFormat("png")}>PNG 题目卡片</button>
      <button role="tab" aria-selected={format === "json"} className={format === "json" ? "active" : ""} onClick={() => setFormat("json")}>JSON 数据</button>
    </div>

    {format === "png" ? <div className="png-export-panel">
      <div className="export-description">自动组合完整题面、题目名称、难度星级、限制条件与明确约束描述，导出高清 PNG。</div>
      <div className="puzzle-card-preview">
        {previewUrl
          ? <img src={previewUrl} alt="PNG 题目卡片预览" />
          : cardError
            ? <div className="export-error">{cardError}</div>
            : <div className="export-loading">正在生成题目卡片…</div>}
      </div>
      <div className="modal-actions">
        <button onClick={close}>关闭</button>
        <button className="primary" disabled={!cardBlob} onClick={() => {
          if (cardBlob) downloadBlob(cardBlob, puzzleCardFilename(puzzle));
        }}>下载 PNG 卡片</button>
      </div>
    </div> : <div className="json-export-panel">
      <textarea aria-label="谜题 JSON" readOnly value={json} />
      <div className="modal-actions">
        <button onClick={async () => {
          try {
            await navigator.clipboard.writeText(json);
            setCopied(true);
          } catch {
            // 浏览器拒绝剪贴板时，保留文本供手动选择。
          }
        }}>{copied ? "已复制 ✓" : "复制到剪贴板"}</button>
        <button onClick={() => downloadBlob(new Blob([json], { type: "application/json" }), jsonName)}>下载 JSON</button>
        <button onClick={close}>关闭</button>
      </div>
    </div>}
  </ModalFrame>;
}

interface ImportModalProps {
  app: App;
  close: () => void;
  imported: () => void;
}

export function ImportModal({ app, close, imported }: ImportModalProps) {
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  return <ModalFrame title="导入谜题（粘贴 JSON）" close={close}>
    <textarea value={json} onChange={(event) => setJson(event.target.value)} placeholder="粘贴谜题 JSON …" />
    <div className="err">{error}</div>
    <div className="modal-actions">
      <button onClick={close}>取消</button>
      <button className="primary" onClick={() => {
        if (app.importJSON(json)) imported();
        else setError("导入失败：JSON 格式无效。");
      }}>导入</button>
    </div>
  </ModalFrame>;
}
