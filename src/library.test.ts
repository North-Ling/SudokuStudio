import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import {
  completeChallenge,
  getChallengeRecord,
  getDraftEntries,
  getPublishedEntries,
  publishDraft,
  saveChallengeProgress,
  saveDraft,
  startChallenge,
} from "./library";
import { createEmptyPuzzle } from "./model";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.useRealTimers();
});

describe("作者草稿、发布题目与挑战记录", () => {
  it("草稿更新不会改写已经发布的题面快照", () => {
    const puzzle = createEmptyPuzzle("第一版");
    const draft = saveDraft(puzzle);
    const published = publishDraft(puzzle, draft.id);

    puzzle.title = "第二版草稿";
    saveDraft(puzzle, draft.id);

    expect(getDraftEntries()[0].puzzle.title).toBe("第二版草稿");
    expect(getPublishedEntries().find((entry) => entry.id === published.id)?.puzzle.title).toBe("第一版");
  });

  it("正式挑战独立保存开始、进度、完成时间与耗时", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T10:00:00+08:00"));
    const puzzle = createEmptyPuzzle("挑战题");
    const draft = saveDraft(puzzle);
    const published = publishDraft(puzzle, draft.id);
    const record = startChallenge(published);

    vi.advanceTimersByTime(65_000);
    puzzle.cells[0][0].value = "1";
    saveChallengeProgress(published.id, puzzle);
    vi.advanceTimersByTime(5_000);
    completeChallenge(published.id, puzzle);

    const completed = getChallengeRecord(published.id);
    expect(record.status).toBe("in-progress");
    expect(completed?.status).toBe("completed");
    expect(completed?.puzzle.cells[0][0].value).toBe("1");
    expect(completed?.elapsedMs).toBe(70_000);
    expect(completed?.completedAt).not.toBeNull();
  });

  it("更新发布后不会把旧版本的完成记录显示为新版本完成", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T10:00:00+08:00"));
    const puzzle = createEmptyPuzzle("版本一");
    const draft = saveDraft(puzzle);
    const first = publishDraft(puzzle, draft.id);
    startChallenge(first);
    completeChallenge(first.id, puzzle);

    vi.advanceTimersByTime(1000);
    puzzle.title = "版本二";
    const second = publishDraft(puzzle, draft.id, first.id);

    expect(getChallengeRecord(second.id, second.updatedAt)).toBeNull();
    expect(startChallenge(second).puzzle.title).toBe("版本二");
  });

  it("旧版我的题目同时迁移为草稿与发布副本", () => {
    const puzzle = createEmptyPuzzle("旧题目");
    localStorage.setItem("sudoku-studio.library.v1", JSON.stringify([{
      id: "custom-old",
      puzzle,
      updatedAt: 1234,
    }]));

    const draft = getDraftEntries().find((entry) => entry.puzzle.title === "旧题目");
    const published = getPublishedEntries().find((entry) => entry.puzzle.title === "旧题目");
    expect(draft?.id).toBe("draft-custom-old");
    expect(draft?.publishedId).toBe("published-custom-old");
    expect(published?.id).toBe("published-custom-old");
  });
});

describe("App 会话边界", () => {
  it("作者预览答案不会进入保存和发布使用的题面", () => {
    const app = new App(createEmptyPuzzle("预览隔离"));
    app.setMode("edit");
    app.puzzle.cells[0][0].value = "1";
    app.puzzle.cells[0][0].given = true;
    app.setMode("preview");
    app.puzzle.cells[0][1].value = "2";

    const definition = app.getPuzzleDefinition();
    expect(definition.cells[0][0].value).toBe("1");
    expect(definition.cells[0][1].value).toBe("");
  });

  it("正式挑战从发布题面和独立进度启动", () => {
    const definition = createEmptyPuzzle("正式挑战");
    definition.cells[0][0].value = "1";
    definition.cells[0][0].given = true;
    const progress = structuredClone(definition);
    progress.cells[0][1].value = "2";
    const app = new App(createEmptyPuzzle());

    app.startChallenge(definition, progress);

    expect(app.mode).toBe("play");
    expect(app.puzzle.cells[0][1].value).toBe("2");
    expect(app.getPuzzleDefinition().cells[0][1].value).toBe("");
  });
});
