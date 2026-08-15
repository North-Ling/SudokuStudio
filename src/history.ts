import type { Puzzle } from "./types";
import { clonePuzzle } from "./model";

// ----------------------------------------------------------------------------
// 基于快照的撤销 / 重做
// ----------------------------------------------------------------------------

const MAX_STEPS = 200;

export class History {
  private undoStack: Puzzle[] = [];
  private redoStack: Puzzle[] = [];

  /** 在发生修改前调用，记录当前状态 */
  snapshot(p: Puzzle): void {
    this.undoStack.push(clonePuzzle(p));
    if (this.undoStack.length > MAX_STEPS) this.undoStack.shift();
    // 新修改后重做栈清空
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(current: Puzzle): Puzzle | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(clonePuzzle(current));
    return prev;
  }

  redo(current: Puzzle): Puzzle | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(clonePuzzle(current));
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
