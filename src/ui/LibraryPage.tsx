import { useMemo, useState } from "react";
import type { AppMode } from "../app";
import {
  deleteLibraryEntry,
  getLibraryEntries,
  type PuzzleLibraryEntry,
} from "../library";
import { deriveAutomaticRuleDescriptions } from "../constraintRules";
import { renderPuzzleThumbnail } from "../puzzleCard";
import type { Puzzle } from "../types";
import { DifficultyStars } from "./DifficultyStars";

interface LibraryPageProps {
  currentEntryId: string | null;
  openEntry: (entry: PuzzleLibraryEntry, mode: AppMode) => void;
  onDelete: (id: string) => void;
}

export function LibraryPage({ currentEntryId, openEntry, onDelete }: LibraryPageProps) {
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const entries = useMemo(() => getLibraryEntries(), [version]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (!normalizedQuery) return true;
    const automatic = deriveAutomaticRuleDescriptions(entry.puzzle)
      .map((rule) => `${rule.label} ${rule.description}`)
      .join(" ");
    return `${entry.puzzle.title} ${entry.puzzle.rules} ${automatic}`
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const customCount = entries.filter((entry) => !entry.builtIn).length;

  return <main className="library-page">
    <section className="library-page-header">
      <div>
        <div className="library-kicker">题库</div>
      </div>
      <div className="library-stats">
        <div><strong>{entries.length}</strong><span>全部题目</span></div>
        <div><strong>{customCount}</strong><span>我的题目</span></div>
      </div>
    </section>

    <section className="library-toolbar">
      <label className="library-search">
        <span>⌕</span>
        <input
          type="search"
          aria-label="搜索题库"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称、规则或约束…"
        />
      </label>
      <span>{filtered.length} 道题目</span>
    </section>

    <section className="library-page-grid">
      {filtered.map((entry) => {
        const automaticRules = deriveAutomaticRuleDescriptions(entry.puzzle);
        const kind = entry.builtIn ? "内置题目" : "我的题目";
        const time = entry.updatedAt == null
          ? ""
          : new Date(entry.updatedAt).toLocaleString("zh-CN", { hour12: false });
        return <article key={entry.id} className={`library-page-card${entry.id === currentEntryId ? " current" : ""}`}>
          <PuzzleThumbnail puzzle={entry.puzzle} />
          <div className="library-page-card-content">
            <div className="library-card-topline">
              <span className={entry.builtIn ? "built-in" : "personal"}>{kind}</span>
              {entry.id === currentEntryId && <span className="current-badge">当前题目</span>}
            </div>
            <h2>{entry.puzzle.title || "未命名题目"}</h2>
            {/* <div className="library-card-meta">
              <span>{entry.puzzle.grid.rows}×{entry.puzzle.grid.cols}</span>
              <span>{entry.puzzle.grid.regionMode === "standard"
                ? `${entry.puzzle.grid.boxRows}×${entry.puzzle.grid.boxCols} 宫`
                : "无标准宫"}</span>
            </div> */}
            <DifficultyStars value={entry.puzzle.difficulty} compact />
            <div className="library-card-rules"><p>{entry.puzzle.rules?.trim() || "标准数独规则适用"}</p></div>
            {automaticRules.length > 0 && <div className="library-rule-tags">
              {automaticRules.slice(0, 4).map((rule) => <span key={rule.key}>{rule.label}</span>)}
              {automaticRules.length > 4 && <span>+{automaticRules.length - 4}</span>}
            </div>}
            <div className="library-page-card-footer">
              <small>{time || "随应用提供"}</small>
              <div>
                <button className="primary" onClick={() => openEntry(entry, "solve")}>解题</button>
                <button onClick={() => openEntry(entry, "edit")}>编辑</button>
                {!entry.builtIn && <button className="danger" onClick={() => {
                  const name = entry.puzzle.title || "这道题";
                  if (!confirm(`确定从本地题库删除“${name}”吗？`)) return;
                  if (deleteLibraryEntry(entry.id)) {
                    onDelete(entry.id);
                    setVersion((value) => value + 1);
                  }
                }}>删除</button>}
              </div>
            </div>
          </div>
        </article>;
      })}
      {filtered.length === 0 && <div className="library-empty">没有找到匹配的题目。</div>}
    </section>
  </main>;
}

function PuzzleThumbnail({ puzzle }: { puzzle: Puzzle }) {
  const src = useMemo(() => renderPuzzleThumbnail(puzzle), [puzzle]);
  if (!src) return null;
  return <img className="puzzle-thumbnail" src={src} alt="" aria-hidden="true" />;
}
