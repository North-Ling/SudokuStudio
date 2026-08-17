import { clonePuzzle, deserializePuzzle } from "./model";
import { PUZZLES } from "./puzzles";
import type { Puzzle } from "./types";

const STORAGE_KEY = "sudoku-studio.library.v1";

export interface PuzzleLibraryEntry {
  id: string;
  puzzle: Puzzle;
  builtIn: boolean;
  updatedAt: number | null;
}

interface StoredEntry {
  id: string;
  puzzle: Puzzle;
  updatedAt: number;
}

function builtInEntries(): PuzzleLibraryEntry[] {
  return PUZZLES.map((definition, index) => ({
    id: `builtin-${index}`,
    puzzle: definition.build(),
    builtIn: true,
    updatedAt: null,
  }));
}

function readStoredEntries(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      try {
        return [{
          id: String(entry.id),
          puzzle: deserializePuzzle(JSON.stringify(entry.puzzle)),
          updatedAt: Number(entry.updatedAt) || Date.now(),
        }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function writeStoredEntries(entries: StoredEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `custom-${crypto.randomUUID()}`;
  }
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getLibraryEntries(): PuzzleLibraryEntry[] {
  const custom = readStoredEntries()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({ ...entry, builtIn: false }));
  return [...custom, ...builtInEntries()];
}

export function getLibraryEntry(id: string): PuzzleLibraryEntry | null {
  return getLibraryEntries().find((entry) => entry.id === id) ?? null;
}

export function savePuzzleToLibrary(puzzle: Puzzle, id?: string | null): PuzzleLibraryEntry {
  const entries = readStoredEntries();
  const customId = id?.startsWith("custom-") ? id : createId();
  const saved: StoredEntry = {
    id: customId,
    puzzle: clonePuzzle(puzzle),
    updatedAt: Date.now(),
  };
  const index = entries.findIndex((entry) => entry.id === customId);
  if (index >= 0) entries[index] = saved;
  else entries.push(saved);
  writeStoredEntries(entries);
  return { ...saved, builtIn: false };
}

export function deleteLibraryEntry(id: string): boolean {
  if (!id.startsWith("custom-")) return false;
  const entries = readStoredEntries();
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) return false;
  writeStoredEntries(next);
  return true;
}

/**
 * 开发模式下，把题目 JSON 写入 src/puzzles/ 文件夹（通过 dev server 中间件）。
 * 生产环境或写入失败时静默返回 false，不影响 localStorage 保存。
 */
export async function persistPuzzleToFolder(puzzle: Puzzle): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const res = await fetch("/__sudoku/save-puzzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: puzzle.title,
        json: JSON.stringify(puzzle, null, 2),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
