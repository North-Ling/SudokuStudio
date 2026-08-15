import { deriveAutomaticRuleDescriptions } from "./constraintRules";
import { computeLayout } from "./geometry";
import { DEFAULT_RULES } from "./model";
import { render } from "./renderer";
import type { Puzzle } from "./types";

const CARD_WIDTH = 1440;
const CONTENT_WIDTH = 1248;
const CARD_PADDING = (CARD_WIDTH - CONTENT_WIDTH) / 2;
const FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

interface TextBlock {
  lines: string[];
  font: string;
  color: string;
  lineHeight: number;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const character of Array.from(paragraph)) {
      const next = line + character;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = next;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function makeTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  color: string,
  lineHeight: number,
  maxWidth = CONTENT_WIDTH,
): TextBlock {
  ctx.font = font;
  return { lines: wrapText(ctx, text, maxWidth), font, color, lineHeight };
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  x: number,
  y: number,
): number {
  ctx.font = block.font;
  ctx.fillStyle = block.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  block.lines.forEach((line, index) => ctx.fillText(line, x, y + index * block.lineHeight));
  return y + block.lines.length * block.lineHeight;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawDifficulty(
  ctx: CanvasRenderingContext2D,
  value: number,
  x: number,
  y: number,
): void {
  const normalized = Math.max(0, Math.min(5, Math.round(value * 2) / 2));
  const size = 34;
  const gap = 7;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let index = 0; index < 5; index++) {
    const starX = x + index * (size + gap);
    const star = "★";
    ctx.fillStyle = "#d7dce4";
    ctx.fillText(star, starX, y);
    const fraction = Math.max(0, Math.min(1, normalized - index));
    if (fraction <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(starX, y - size * 0.55, size * fraction, size * 1.1);
    ctx.clip();
    ctx.fillStyle = "#f59e0b";
    ctx.fillText(star, starX, y);
    ctx.restore();
  }
  const label = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = "#64748b";
  ctx.fillText(`${label} 星`, x + 5 * (size + gap) + 4, y + 1);
}

function boardDimensions(puzzle: Puzzle): { width: number; height: number } {
  const displayRows = puzzle.grid.rows + 2;
  const displayCols = puzzle.grid.cols + 2;
  const cell = Math.min(112, CONTENT_WIDTH / displayCols, 1248 / displayRows);
  return {
    width: Math.max(1, Math.round(displayCols * cell)),
    height: Math.max(1, Math.round(displayRows * cell)),
  };
}

/** 生成包含完整题面、标题、难度与规则说明的高清 PNG 卡片。 */
export async function createPuzzleCardBlob(puzzle: Puzzle): Promise<Blob> {
  await document.fonts?.ready;
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("无法创建图片排版上下文");

  const manualRules = puzzle.rules.trim() || DEFAULT_RULES;
  const automaticRules = deriveAutomaticRuleDescriptions(puzzle);
  const title = puzzle.title.trim() || "未命名题目";
  const titleBlock = makeTextBlock(
    measureContext,
    title,
    `700 58px ${FONT}`,
    "#172033",
    70,
    880,
  );
  const manualBlock = makeTextBlock(
    measureContext,
    manualRules,
    `400 29px ${FONT}`,
    "#334155",
    45,
  );
  const automaticBlocks = automaticRules.map((rule) => makeTextBlock(
    measureContext,
    `${rule.label}：${rule.description}`,
    `400 26px ${FONT}`,
    "#475569",
    41,
    CONTENT_WIDTH - 42,
  ));
  const board = boardDimensions(puzzle);
  const rulesHeight = 74 + manualBlock.lines.length * manualBlock.lineHeight +
    (automaticBlocks.length > 0
      ? 70 + automaticBlocks.reduce((height, block) => height + block.lines.length * block.lineHeight + 18, 0)
      : 0);
  const metaY = CARD_PADDING + 40 + titleBlock.lines.length * titleBlock.lineHeight;
  const dividerY = metaY + 42;
  const headerHeight = dividerY - CARD_PADDING + 54;
  const cardHeight = Math.ceil(CARD_PADDING + headerHeight + board.height + 74 + rulesHeight + 86);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = cardHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 PNG 画布");

  ctx.fillStyle = "#eef2f7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, 34, 34, canvas.width - 68, canvas.height - 68, 34);
  ctx.fill();

  drawTextBlock(ctx, titleBlock, CARD_PADDING, CARD_PADDING + 12);

  const meta = puzzle.grid.regionMode === "standard"
    ? `${puzzle.grid.rows}×${puzzle.grid.cols} · ${puzzle.grid.boxRows}×${puzzle.grid.boxCols} 宫`
    : `${puzzle.grid.rows}×${puzzle.grid.cols} · 无标准宫`;
  ctx.font = `600 23px ${FONT}`;
  ctx.fillStyle = "#7c3aed";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(meta, CARD_PADDING, metaY);
  drawDifficulty(ctx, puzzle.difficulty, CARD_WIDTH - CARD_PADDING - 304, CARD_PADDING + 59);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CARD_PADDING, dividerY);
  ctx.lineTo(CARD_WIDTH - CARD_PADDING, dividerY);
  ctx.stroke();

  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = board.width;
  boardCanvas.height = board.height;
  const boardContext = boardCanvas.getContext("2d");
  if (!boardContext) throw new Error("无法创建题面画布");
  render(boardContext, puzzle, computeLayout(board.width, board.height, puzzle.grid.rows, puzzle.grid.cols), {
    selection: null,
    selectedCells: [],
    highlightValue: "",
    hover: null,
    pendingCage: null,
    pendingPath: null,
    showConflicts: false,
  });
  const boardX = Math.round((CARD_WIDTH - board.width) / 2);
  const boardY = CARD_PADDING + headerHeight;
  ctx.drawImage(boardCanvas, boardX, boardY);

  let rulesY = boardY + board.height + 74;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = "#172033";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("限制条件", CARD_PADDING, rulesY);
  rulesY += 56;
  rulesY = drawTextBlock(ctx, manualBlock, CARD_PADDING, rulesY);

  if (automaticBlocks.length > 0) {
    rulesY += 34;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = "#0f766e";
    ctx.fillText("题面约束", CARD_PADDING, rulesY);
    rulesY += 46;
    automaticBlocks.forEach((block) => {
      ctx.fillStyle = "#14b8a6";
      ctx.beginPath();
      ctx.arc(CARD_PADDING + 10, rulesY + 15, 5, 0, Math.PI * 2);
      ctx.fill();
      rulesY = drawTextBlock(ctx, block, CARD_PADDING + 34, rulesY) + 18;
    });
  }

  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("SudokuStudio", CARD_WIDTH - CARD_PADDING, cardHeight - 66);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("浏览器无法生成 PNG 图片"));
    }, "image/png");
  });
}

export function puzzleCardFilename(puzzle: Puzzle): string {
  const name = (puzzle.title.trim() || "未命名题目")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return `${name}-题目卡片.png`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 生成数独缩略图（PNG dataURL），用于题库卡片预览。
 * 复用与主盘面相同的渲染引擎，不显示选中、悬停与自动判错高亮。
 */
export function renderPuzzleThumbnail(puzzle: Puzzle, maxSize = 168): string {
  const displayRows = puzzle.grid.rows + 2;
  const displayCols = puzzle.grid.cols + 2;
  const cell = Math.max(1, Math.min(maxSize / displayCols, maxSize / displayRows));
  const width = Math.max(1, Math.round(displayCols * cell));
  const height = Math.max(1, Math.round(displayRows * cell));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  render(ctx, puzzle, computeLayout(width, height, puzzle.grid.rows, puzzle.grid.cols), {
    selection: null,
    selectedCells: [],
    highlightValue: "",
    hover: null,
    pendingCage: null,
    pendingPath: null,
    showConflicts: false,
  });
  return canvas.toDataURL("image/png");
}
