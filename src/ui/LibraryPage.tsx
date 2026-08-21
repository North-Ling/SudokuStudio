import { useMemo, useState } from "react";
import type { AuthorMode } from "../app";
import {
  deleteDraft,
  deletePublishedEntry,
  getChallengeRecord,
  getDraftEntries,
  getPublishedEntries,
  type PublishedPuzzleEntry,
  type PuzzleDraftEntry,
} from "../library";
import { deriveAutomaticRuleDescriptions } from "../constraintRules";
import { renderPuzzleThumbnail } from "../puzzleCard";
import type { Puzzle } from "../types";
import { DifficultyStars } from "./DifficultyStars";

type LibraryTab = "published" | "drafts";

interface LibraryPageProps {
  activeId: string | null;
  version: number;
  openDraft: (entry: PuzzleDraftEntry, mode: AuthorMode) => void;
  publishEntry: (entry: PuzzleDraftEntry) => void;
  startEntry: (entry: PublishedPuzzleEntry, restart?: boolean) => void;
  onDelete: (id: string) => void;
}

export function LibraryPage({
  activeId,
  version,
  openDraft,
  publishEntry,
  startEntry,
  onDelete,
}: LibraryPageProps) {
  const [tab, setTab] = useState<LibraryTab>("published");
  const [query, setQuery] = useState("");
  const published = useMemo(() => getPublishedEntries(), [version]);
  const drafts = useMemo(() => getDraftEntries(), [version]);
  const entries = tab === "published" ? published : drafts;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = entries.filter((entry) => matchesQuery(entry.puzzle, normalizedQuery));
  const completedCount = published.filter((entry) => getChallengeRecord(entry.id, entry.updatedAt)?.status === "completed").length;

  return <main className="library-page">
    <section className="library-page-header">
      <div>
        <div className="library-kicker">谜题空间</div>
      </div>
      <div className="library-stats">
        <div><strong>{drafts.length}</strong><span>出题草稿</span></div>
        <div><strong>{published.length}</strong><span>已发布</span></div>
        <div><strong>{completedCount}</strong><span>已完成</span></div>
      </div>
    </section>

    <section className="library-space-tabs" role="tablist" aria-label="谜题空间">
      <button role="tab" aria-selected={tab === "published"} className={tab === "published" ? "active" : ""} onClick={() => setTab("published")}>
        做题 <span>{published.length}</span>
      </button>
      <button role="tab" aria-selected={tab === "drafts"} className={tab === "drafts" ? "active" : ""} onClick={() => setTab("drafts")}>
        出题 <span>{drafts.length}</span>
      </button>
    </section>

    <section className="library-toolbar">
      <label className="library-search">
        <span>⌕</span>
        <input
          type="search"
          aria-label="搜索谜题"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称、规则或约束…"
        />
      </label>
      <span>{filtered.length} 道{tab === "published" ? "已发布题目" : "草稿"}</span>
    </section>

    <section className="library-page-grid">
      {tab === "published"
        ? (filtered as PublishedPuzzleEntry[]).map((entry) => {
          const record = getChallengeRecord(entry.id, entry.updatedAt);
          const status = record?.status === "completed"
            ? `已完成 · ${formatDuration(record.elapsedMs)}`
            : record
              ? `挑战中 · ${formatDuration(record.elapsedMs)}`
              : "尚未挑战";
          return <PuzzleCard
            key={entry.id}
            puzzle={entry.puzzle}
            active={entry.id === activeId}
            kind={entry.builtIn ? "内置发布" : "我的发布"}
            tone={entry.builtIn ? "built-in" : "personal"}
            time={record?.completedAt
              ? `完成于 ${formatDate(record.completedAt)}`
              : entry.updatedAt == null ? "随应用提供" : `发布更新 ${formatDate(entry.updatedAt)}`}
            status={status}
            actions={<>
              <button className="primary" onClick={() => {
                if (record?.status === "completed") {
                  if (!confirm("这道题已经完成，确定重新开始一次挑战吗？")) return;
                  startEntry(entry, true);
                } else startEntry(entry);
              }}>{record?.status === "completed" ? "重新挑战" : record ? "继续挑战" : "开始挑战"}</button>
              {/* <button onClick={() => openPublishedDraft(entry)}>{entry.sourceDraftId ? "继续出题" : "创建草稿"}</button> */}
              {!entry.builtIn && <button className="danger" onClick={() => {
                if (!confirm(`确定删除已发布题目“${entry.puzzle.title || "未命名题目"}”吗？草稿和挑战记录会保留。`)) return;
                if (deletePublishedEntry(entry.id)) onDelete(entry.id);
              }}>删除</button>}
            </>}
          />;
        })
        : (filtered as PuzzleDraftEntry[]).map((entry) => <PuzzleCard
          key={entry.id}
          puzzle={entry.puzzle}
          active={entry.id === activeId}
          kind={entry.publishedId ? "已发布草稿" : "未发布草稿"}
          tone="personal"
          time={`保存于 ${formatDate(entry.updatedAt)}`}
          status={entry.publishedId ? "可更新现有发布" : "仅作者可见"}
          actions={<>
            <button className="primary" onClick={() => openDraft(entry, "edit")}>继续出题</button>
            <button onClick={() => openDraft(entry, "preview")}>预览</button>
            <button onClick={() => publishEntry(entry)}>{entry.publishedId ? "更新发布" : "发布"}</button>
            <button className="danger" onClick={() => {
              if (!confirm(`确定删除草稿“${entry.puzzle.title || "未命名题目"}”吗？已发布题目不会被删除。`)) return;
              if (deleteDraft(entry.id)) onDelete(entry.id);
            }}>删除草稿</button>
          </>}
        />)}
      {filtered.length === 0 && <div className="library-empty">
        {normalizedQuery ? "没有找到匹配的谜题。" : tab === "drafts" ? "还没有草稿。可以返回工作台新建一道题。" : "还没有已发布题目。"}
      </div>}
    </section>
  </main>;
}

function matchesQuery(puzzle: Puzzle, query: string): boolean {
  if (!query) return true;
  const automatic = deriveAutomaticRuleDescriptions(puzzle)
    .map((rule) => `${rule.label} ${rule.description}`)
    .join(" ");
  return `${puzzle.title} ${puzzle.rules} ${automatic}`.toLowerCase().includes(query);
}

function PuzzleCard({ puzzle, active, kind, tone, time, status, actions }: {
  puzzle: Puzzle;
  active: boolean;
  kind: string;
  tone: "built-in" | "personal";
  time: string;
  status: string;
  actions: React.ReactNode;
}) {
  const automaticRules = deriveAutomaticRuleDescriptions(puzzle);
  return <article className={`library-page-card${active ? " current" : ""}`}>
    <PuzzleThumbnail puzzle={puzzle} />
    <div className="library-page-card-content">
      <div className="library-card-topline">
        <span className={tone}>{kind}</span>
        {active && <span className="current-badge">当前打开</span>}
        <span className="challenge-badge">{status}</span>
      </div>
      <h2>{puzzle.title || "未命名题目"}</h2>
      <DifficultyStars value={puzzle.difficulty} compact />
      <div className="library-card-rules"><p>{puzzle.rules?.trim() || "标准数独规则适用"}</p></div>
      {automaticRules.length > 0 && <div className="library-rule-tags">
        {automaticRules.slice(0, 4).map((rule) => <span key={rule.key}>{rule.label}</span>)}
        {automaticRules.length > 4 && <span>+{automaticRules.length - 4}</span>}
      </div>}
      <div className="library-page-card-footer">
        <small>{time}</small>
        <div>{actions}</div>
      </div>
    </div>
  </article>;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}时${minutes}分` : minutes > 0 ? `${minutes}分${rest}秒` : `${rest}秒`;
}

function PuzzleThumbnail({ puzzle }: { puzzle: Puzzle }) {
  const src = useMemo(() => renderPuzzleThumbnail(puzzle), [puzzle]);
  if (!src) return null;
  return <img className="puzzle-thumbnail" src={src} alt="" aria-hidden="true" />;
}
