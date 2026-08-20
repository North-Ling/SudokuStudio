import { isPathTool, type App } from "./app";
import type { CellRef } from "./types";
import { hitCell, hitPathCell } from "./geometry";
import { gridTokens, letterGridTokens, symbolGridTokens } from "./grid";

const L = (app: App) => app.getLayout();

// ----------------------------------------------------------------------------
// 鼠标 / 触摸 / 键盘输入
// ----------------------------------------------------------------------------

function digitFromCode(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!m) return null;
  return Number(m[1]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  ) != null;
}

export function attachInput(
  app: App,
  canvas: HTMLCanvasElement,
  onStateChange: () => void,
): () => void {
  let dragging = false;
  let selectionAdditive = false;
  let lastCell: CellRef | null = null;
  let lastTargetKey: string | null = null;

  const pos = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    const { x, y } = pos(e);
    dragging = true;
    selectionAdditive = e.shiftKey;
    lastCell = null;
    lastTargetKey = null;
    app.beginPointerStroke();

    const tool = app.tool;
    if (
      tool === "none" ||
      tool === "digit" ||
      tool === "corner" ||
      tool === "center" ||
      tool === "color"
    ) {
      const cell = hitCell(L(app), x, y);
      if (cell) {
        app.handleCellClick(cell.r, cell.c, selectionAdditive);
        lastCell = [cell.r, cell.c];
      }
    } else if (tool === "cell-shape") {
      const cell = hitCell(L(app), x, y);
      if (cell) {
        app.beginCellDecorationStroke(cell.r, cell.c);
        lastCell = [cell.r, cell.c];
      }
    } else if (tool === "cage") {
      const cell = hitCell(L(app), x, y);
      if (cell) {
        app.beginCageStroke(cell.r, cell.c);
        lastCell = [cell.r, cell.c];
      }
    } else if (isPathTool(tool)) {
      const node = hitPathCell(L(app), x, y);
      if (node) {
        app.pathCellClick(node[0], node[1]);
        lastCell = node;
      }
    } else if (tool === "skyscraper" || tool === "x-sum") {
      const target = app.hitTest(x, y);
      if (target?.kind === "outside") app.handleOutsideClick(target);
    } else if (tool === "erase") {
      app.eraseAt(x, y);
    } else if (tool.startsWith("edge")) {
      const target = app.hitTest(x, y);
      if (target && (target.kind === "edgeH" || target.kind === "edgeV" || target.kind === "borderEdge")) {
        app.beginEdgeStroke(target);
        lastTargetKey = `${target.kind}:${target.r},${target.c}`;
      }
    } else {
      // 边 / 角工具：直接命中检测
      const target = app.hitTest(x, y);
      if (target) {
        if (target.kind === "edgeH" || target.kind === "edgeV" || target.kind === "borderEdge") {
          if (tool === "lookout") app.handleEdgeClick(target);
          else app.beginEdgeStroke(target);
        } else if (target.kind === "corner") {
          app.handleCornerClick(target.r, target.c);
        } else if (target.kind === "outside") {
          app.handleOutsideClick(target);
        } else if (target.kind === "outerCell") {
          app.handleOuterCellClick(target);
        }
      }
    }
    onStateChange();
  };

  const onPointerMove = (e: PointerEvent) => {
    const { x, y } = pos(e);
    if (dragging) {
      const tool = app.tool;
      if (tool === "digit" || tool === "corner" || tool === "center" || tool === "color") {
        const cell = hitCell(L(app), x, y);
        if (cell) {
          const key = `${cell.r},${cell.c}`;
          const lastKey = lastCell ? `${lastCell[0]},${lastCell[1]}` : null;
          if (key !== lastKey) {
            app.extendInputSelection(cell.r, cell.c, selectionAdditive);
            lastCell = [cell.r, cell.c];
            onStateChange();
          }
        }
      } else if (tool === "cell-shape" || tool === "cage") {
        const cell = hitCell(L(app), x, y);
        if (cell) {
          const key = `${cell.r},${cell.c}`;
          const lastKey = lastCell ? `${lastCell[0]},${lastCell[1]}` : null;
          if (key !== lastKey) {
            if (tool === "cell-shape") app.continueCellDecorationStroke(cell.r, cell.c);
            else app.cageCellPaint(cell.r, cell.c);
            lastCell = [cell.r, cell.c];
            onStateChange();
          }
        }
      } else if (isPathTool(tool)) {
        const node = hitPathCell(L(app), x, y);
        if (node) {
          const key = `${node[0]},${node[1]}`;
          const lastKey = lastCell ? `${lastCell[0]},${lastCell[1]}` : null;
          if (key !== lastKey) {
            app.pathCellPaint(node[0], node[1]);
            lastCell = node;
            onStateChange();
          }
        }
      } else if (tool.startsWith("edge")) {
        const target = app.hitTest(x, y);
        if (target && (target.kind === "edgeH" || target.kind === "edgeV" || target.kind === "borderEdge")) {
          const key = `${target.kind}:${target.r},${target.c}`;
          if (key !== lastTargetKey) {
            app.continueEdgeStroke(target);
            lastTargetKey = key;
            onStateChange();
          }
        }
      } else if (tool === "erase") {
        app.eraseAt(x, y);
        onStateChange();
      }
      return;
    }
    app.updateHover(x, y);
  };

  const onPointerUp = () => {
    dragging = false;
    selectionAdditive = false;
    lastCell = null;
    lastTargetKey = null;
    app.endPointerStroke();
  };

  const onPointerLeave = () => {
    dragging = false;
    selectionAdditive = false;
    lastCell = null;
    lastTargetKey = null;
    app.endPointerStroke();
    app.clearHover();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);

  // ---- 键盘 ----
  const onKeyDown = (e: KeyboardEvent) => {
    // 表单控件拥有完整的键盘输入权：数字、删除、方向键和撤销均不传给棋盘。
    if (e.isComposing || isEditableTarget(e.target)) return;

    const digit = digitFromCode(e.code);
    const mod = e.ctrlKey || e.metaKey;

    if (digit != null) {
      e.preventDefault();
      if (mod) {
        app.markCenterOnSelection(String(digit));
      } else if (e.shiftKey) {
        app.markCornerOnSelection(String(digit));
      } else {
        app.keyDigit(digit);
      }
      onStateChange();
      return;
    }

    const palette = app.tokenPalette === "digits"
      ? gridTokens(app.puzzle.grid)
      : app.tokenPalette === "letters"
        ? letterGridTokens(app.puzzle.grid)
        : symbolGridTokens(app.puzzle.grid);
    const letter = e.key.length === 1 ? e.key.toUpperCase() : "";
    if (palette.includes(letter) && /^[A-Z]$/.test(letter)) {
      e.preventDefault();
      if (mod) app.markCenterOnSelection(letter);
      else if (e.shiftKey) app.markCornerOnSelection(letter);
      else app.keyToken(letter);
      onStateChange();
      return;
    }

    if (
      e.key === "Backspace" ||
      e.key === "Delete" ||
      e.code === "Numpad0" ||
      e.code === "Digit0"
    ) {
      e.preventDefault();
      app.keyClear();
      onStateChange();
      return;
    }

    const allowWasd = !palette.some((token) => /^[A-Z]$/.test(token));
    if (e.code === "ArrowUp" || (allowWasd && e.key.toLowerCase() === "w")) {
      e.preventDefault();
      app.moveSelection(-1, 0);
      onStateChange();
      return;
    }
    if (e.code === "ArrowDown" || (allowWasd && e.key.toLowerCase() === "s")) {
      e.preventDefault();
      app.moveSelection(1, 0);
      onStateChange();
      return;
    }
    if (e.code === "ArrowLeft" || (allowWasd && e.key.toLowerCase() === "a")) {
      e.preventDefault();
      app.moveSelection(0, -1);
      onStateChange();
      return;
    }
    if (e.code === "ArrowRight" || (allowWasd && e.key.toLowerCase() === "d")) {
      e.preventDefault();
      app.moveSelection(0, 1);
      onStateChange();
      return;
    }

    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) app.redo();
      else app.undo();
      onStateChange();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      app.redo();
      onStateChange();
      return;
    }

    if (e.key === "Escape") {
      app.cancelPending();
      onStateChange();
      return;
    }
  };

  window.addEventListener("keydown", onKeyDown);

  // 返回清理函数
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("keydown", onKeyDown);
  };
}
