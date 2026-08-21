import { clonePuzzle, deserializePuzzle } from "./model";
import { PUZZLES } from "./puzzles";
import type { Puzzle } from "./types";

const LEGACY_LIBRARY_KEY = "sudoku-studio.library.v1";
const DRAFTS_KEY = "sudoku-studio.drafts.v1";
const PUBLISHED_KEY = "sudoku-studio.published.v1";
const CHALLENGES_KEY = "sudoku-studio.challenges.v1";

export interface PuzzleDraftEntry {
  id: string;
  puzzle: Puzzle;
  updatedAt: number;
  publishedId?: string;
}

export interface PublishedPuzzleEntry {
  id: string;
  puzzle: Puzzle;
  builtIn: boolean;
  publishedAt: number | null;
  updatedAt: number | null;
  sourceDraftId?: string;
}

/** 兼容仍以“题库条目”称呼已发布题目的旧调用。 */
export type PuzzleLibraryEntry = PublishedPuzzleEntry;
export type ChallengeStatus = "in-progress" | "completed";

export interface ChallengeRecord {
  puzzleId: string;
  /** 挑战开始时对应的发布版本；发布更新后旧记录不冒充新版本状态。 */
  publishedUpdatedAt: number | null;
  status: ChallengeStatus;
  puzzle: Puzzle;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  /** 从首次开始到完成/最近保存的耗时，单位毫秒。 */
  elapsedMs: number;
}

interface LegacyStoredEntry {
  id: string;
  puzzle: Puzzle;
  updatedAt: number;
}

interface StoredPublishedEntry {
  id: string;
  puzzle: Puzzle;
  publishedAt: number;
  updatedAt: number;
  sourceDraftId?: string;
}

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

function decodePuzzle(raw: unknown): Puzzle | null {
  try {
    return deserializePuzzle(JSON.stringify(raw));
  } catch {
    return null;
  }
}

function readArray(key: string): unknown[] | null {
  if (!storageAvailable()) return [];
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, entries: unknown[]): void {
  if (storageAvailable()) localStorage.setItem(key, JSON.stringify(entries));
}

function createId(prefix: "draft" | "published" | "legacy"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLegacyEntries(): LegacyStoredEntry[] {
  const raw = readArray(LEGACY_LIBRARY_KEY) ?? [];
  return raw.flatMap((item) => {
    const entry = item as Partial<LegacyStoredEntry>;
    const puzzle = decodePuzzle(entry.puzzle);
    if (!puzzle) return [];
    return [{
      id: String(entry.id ?? createId("legacy")),
      puzzle,
      updatedAt: Number(entry.updatedAt) || Date.now(),
    }];
  });
}

function readDraftEntries(): PuzzleDraftEntry[] {
  const stored = readArray(DRAFTS_KEY);
  if (stored == null) {
    // 旧版“我的题目”同时承担草稿和成品职责。迁移时各留一份，避免猜错用户意图。
    return readLegacyEntries().map((entry) => ({
      id: `draft-${entry.id}`,
      puzzle: clonePuzzle(entry.puzzle),
      updatedAt: entry.updatedAt,
      publishedId: `published-${entry.id}`,
    }));
  }
  return stored.flatMap((item) => {
    const entry = item as Partial<PuzzleDraftEntry>;
    const puzzle = decodePuzzle(entry.puzzle);
    if (!puzzle || !entry.id) return [];
    return [{
      id: String(entry.id),
      puzzle,
      updatedAt: Number(entry.updatedAt) || Date.now(),
      publishedId: entry.publishedId ? String(entry.publishedId) : undefined,
    }];
  });
}

function readPublishedEntries(): StoredPublishedEntry[] {
  const stored = readArray(PUBLISHED_KEY);
  if (stored == null) {
    return readLegacyEntries().map((entry) => ({
      id: `published-${entry.id}`,
      puzzle: clonePuzzle(entry.puzzle),
      publishedAt: entry.updatedAt,
      updatedAt: entry.updatedAt,
      sourceDraftId: `draft-${entry.id}`,
    }));
  }
  return stored.flatMap((item) => {
    const entry = item as Partial<StoredPublishedEntry>;
    const puzzle = decodePuzzle(entry.puzzle);
    if (!puzzle || !entry.id) return [];
    const updatedAt = Number(entry.updatedAt) || Date.now();
    return [{
      id: String(entry.id),
      puzzle,
      publishedAt: Number(entry.publishedAt) || updatedAt,
      updatedAt,
      sourceDraftId: entry.sourceDraftId ? String(entry.sourceDraftId) : undefined,
    }];
  });
}

function builtInEntries(): PublishedPuzzleEntry[] {
  return PUZZLES.map((definition, index) => ({
    id: `builtin-${index}`,
    puzzle: definition.build(),
    builtIn: true,
    publishedAt: null,
    updatedAt: null,
  }));
}

export function getDraftEntries(): PuzzleDraftEntry[] {
  return readDraftEntries().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDraftEntry(id: string): PuzzleDraftEntry | null {
  return getDraftEntries().find((entry) => entry.id === id) ?? null;
}

export function saveDraft(puzzle: Puzzle, id?: string | null): PuzzleDraftEntry {
  const entries = readDraftEntries();
  const draftId = id?.startsWith("draft-") ? id : createId("draft");
  const previous = entries.find((entry) => entry.id === draftId);
  const saved: PuzzleDraftEntry = {
    id: draftId,
    puzzle: clonePuzzle(puzzle),
    updatedAt: Date.now(),
    publishedId: previous?.publishedId,
  };
  const index = entries.findIndex((entry) => entry.id === draftId);
  if (index >= 0) entries[index] = saved;
  else entries.push(saved);
  writeArray(DRAFTS_KEY, entries);
  return saved;
}

export function deleteDraft(id: string): boolean {
  if (!id.startsWith("draft-")) return false;
  const entries = readDraftEntries();
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) return false;
  writeArray(DRAFTS_KEY, next);
  return true;
}

export function getPublishedEntries(): PublishedPuzzleEntry[] {
  const custom: PublishedPuzzleEntry[] = readPublishedEntries()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({ ...entry, builtIn: false }));
  return [...custom, ...builtInEntries()];
}

export function getPublishedEntry(id: string): PublishedPuzzleEntry | null {
  return getPublishedEntries().find((entry) => entry.id === id) ?? null;
}

export function publishDraft(
  puzzle: Puzzle,
  draftId?: string | null,
  publishedId?: string | null,
): PublishedPuzzleEntry {
  const entries = readPublishedEntries();
  const id = publishedId?.startsWith("published-") ? publishedId : createId("published");
  const previous = entries.find((entry) => entry.id === id);
  const now = Date.now();
  const saved: StoredPublishedEntry = {
    id,
    puzzle: clonePuzzle(puzzle),
    publishedAt: previous?.publishedAt ?? now,
    updatedAt: now,
    sourceDraftId: draftId?.startsWith("draft-") ? draftId : undefined,
  };
  const index = entries.findIndex((entry) => entry.id === id);
  if (index >= 0) entries[index] = saved;
  else entries.push(saved);
  writeArray(PUBLISHED_KEY, entries);

  if (saved.sourceDraftId) {
    const drafts = readDraftEntries();
    const draft = drafts.find((entry) => entry.id === saved.sourceDraftId);
    if (draft) {
      draft.publishedId = id;
      writeArray(DRAFTS_KEY, drafts);
    }
  }
  return { ...saved, builtIn: false };
}

export function deletePublishedEntry(id: string): boolean {
  if (!id.startsWith("published-")) return false;
  const entries = readPublishedEntries();
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) return false;
  writeArray(PUBLISHED_KEY, next);
  return true;
}

function readChallengeRecords(): ChallengeRecord[] {
  const stored = readArray(CHALLENGES_KEY) ?? [];
  return stored.flatMap((item) => {
    const entry = item as Partial<ChallengeRecord>;
    const puzzle = decodePuzzle(entry.puzzle);
    if (!puzzle || !entry.puzzleId) return [];
    const startedAt = Number(entry.startedAt) || Date.now();
    const updatedAt = Number(entry.updatedAt) || startedAt;
    const completedAt = entry.completedAt == null ? null : Number(entry.completedAt) || null;
    return [{
      puzzleId: String(entry.puzzleId),
      publishedUpdatedAt: entry.publishedUpdatedAt == null ? null : Number(entry.publishedUpdatedAt) || null,
      status: entry.status === "completed" ? "completed" : "in-progress",
      puzzle,
      startedAt,
      updatedAt,
      completedAt,
      elapsedMs: Math.max(0, Number(entry.elapsedMs) || updatedAt - startedAt),
    }];
  });
}

function writeChallenge(record: ChallengeRecord): ChallengeRecord {
  const records = readChallengeRecords();
  const index = records.findIndex((entry) => entry.puzzleId === record.puzzleId);
  if (index >= 0) records[index] = record;
  else records.push(record);
  writeArray(CHALLENGES_KEY, records);
  return record;
}

export function getChallengeRecord(
  puzzleId: string,
  publishedUpdatedAt?: number | null,
): ChallengeRecord | null {
  const record = readChallengeRecords().find((item) => item.puzzleId === puzzleId) ?? null;
  if (record && arguments.length > 1 && record.publishedUpdatedAt !== (publishedUpdatedAt ?? null)) return null;
  return record;
}

export function startChallenge(entry: PublishedPuzzleEntry, restart = false): ChallengeRecord {
  const previous = getChallengeRecord(entry.id, entry.updatedAt);
  if (previous && !restart) return previous;
  const now = Date.now();
  return writeChallenge({
    puzzleId: entry.id,
    publishedUpdatedAt: entry.updatedAt,
    status: "in-progress",
    puzzle: clonePuzzle(entry.puzzle),
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    elapsedMs: 0,
  });
}

export function saveChallengeProgress(puzzleId: string, puzzle: Puzzle): ChallengeRecord | null {
  const previous = getChallengeRecord(puzzleId);
  if (!previous || previous.status === "completed") return previous;
  const now = Date.now();
  return writeChallenge({
    ...previous,
    puzzle: clonePuzzle(puzzle),
    updatedAt: now,
    elapsedMs: Math.max(0, now - previous.startedAt),
  });
}

export function completeChallenge(puzzleId: string, puzzle: Puzzle): ChallengeRecord | null {
  const previous = getChallengeRecord(puzzleId);
  if (!previous) return null;
  const now = Date.now();
  return writeChallenge({
    ...previous,
    status: "completed",
    puzzle: clonePuzzle(puzzle),
    updatedAt: now,
    completedAt: now,
    elapsedMs: Math.max(0, now - previous.startedAt),
  });
}

// ---- 旧 API：把“题库”解释为已发布空间，供外部调用平滑迁移。 ----
export const getLibraryEntries = getPublishedEntries;
export const getLibraryEntry = getPublishedEntry;
export function savePuzzleToLibrary(puzzle: Puzzle, id?: string | null): PuzzleLibraryEntry {
  return publishDraft(puzzle, null, id);
}
export const deleteLibraryEntry = deletePublishedEntry;

/** 开发模式下把题目 JSON 写入 src/puzzles/；失败不影响浏览器内保存。 */
export async function persistPuzzleToFolder(puzzle: Puzzle): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const res = await fetch("/__sudoku/save-puzzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: puzzle.title, json: JSON.stringify(puzzle, null, 2) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
