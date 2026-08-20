import { describe, expect, it } from "vitest";
import { App } from "./app";
import { findViolatedRules } from "./constraintValidation";
import { computeLayout, hitEdge, hitPathCell } from "./geometry";
import { createEmptyPuzzle, deserializePuzzle } from "./model";

describe("author-first outside clues", () => {
  it("keeps author-defined values outside standard Sudoku ranges", () => {
    const app = new App(createEmptyPuzzle("author clues"));
    app.setMode("edit");

    app.selectTool("skyscraper");
    app.skyscraperValue = 99;
    app.handleOutsideClick({ kind: "outside", side: "top", index: 0 });

    app.selectTool("x-sum");
    app.xSumValue = -45;
    app.handleOutsideClick({ kind: "outside", side: "left", index: 0 });

    expect(app.puzzle.skyscrapers[0]?.value).toBe(99);
    expect(app.puzzle.xSums[0]?.value).toBe(-45);
  });

  it("keeps out-of-range author clues out of standard automatic validation", () => {
    const puzzle = createEmptyPuzzle("custom clue semantics");
    puzzle.skyscrapers.push({ side: "top", index: 0, value: 99 });
    puzzle.xSums.push({ side: "left", index: 0, value: 999 });
    for (let r = 0; r < 9; r++) puzzle.cells[r][0].value = String(r + 1);
    for (let c = 0; c < 9; c++) puzzle.cells[0][c].value = String(c + 1);

    const violations = findViolatedRules(puzzle, [0, 0], new Set());
    expect(violations).not.toContain("skyscraper");
    expect(violations).not.toContain("x-sum");
  });

  it("preserves unrestricted Killer and little-killer integers", () => {
    const app = new App(createEmptyPuzzle("custom sums"));
    app.setMode("edit");
    app.selectTool("cage");
    app.cageCellClick(0, 0);
    app.cageSum = "-8";
    app.commitCage();
    expect(app.puzzle.cages[0]?.sum).toBe(-8);

    const raw = createEmptyPuzzle("little killer");
    raw.littleKillers.push({ anchor: { r: 0, c: 0 }, direction: "down-right", value: 999 });
    const restored = deserializePuzzle(JSON.stringify(raw));
    expect(restored.littleKillers[0]?.value).toBe(999);
  });
});

describe("outer border marks", () => {
  it("creates and migrates all four groups of border edges", () => {
    const puzzle = createEmptyPuzzle("border edges");
    expect(puzzle.borderEdges.top).toHaveLength(9);
    expect(puzzle.borderEdges.right).toHaveLength(9);

    const legacy = JSON.parse(JSON.stringify(puzzle)) as Record<string, unknown>;
    delete legacy.borderEdges;
    const restored = deserializePuzzle(JSON.stringify(legacy));
    expect(restored.borderEdges.bottom).toHaveLength(9);
    expect(restored.borderEdges.left.every((edge) => edge.symbol == null)).toBe(true);
  });

  it("allows free text on the real grid border", () => {
    const app = new App(createEmptyPuzzle("border text"));
    app.setMode("edit");
    app.selectTool("edge-text");
    app.edgeText = "外";
    app.handleEdgeClick({
      kind: "borderEdge",
      side: "top",
      index: 2,
      r: -1,
      c: 2,
      dist: 0,
    });
    expect(app.puzzle.borderEdges.top[2].symbol).toEqual({ kind: "text", text: "外" });
  });

  it("allows a lookout marker on the real grid border", () => {
    const app = new App(createEmptyPuzzle("border lookout"));
    app.setMode("edit");
    app.selectTool("lookout");
    app.lookoutDigits = "3";
    app.handleEdgeClick({
      kind: "borderEdge",
      side: "right",
      index: 4,
      r: 4,
      c: 9,
      dist: 0,
    });
    expect(app.puzzle.lookouts[0]?.anchor).toEqual({
      kind: "borderEdge",
      side: "right",
      index: 4,
    });
  });

  it("hits the nearest segment on the outer border", () => {
    const layout = computeLayout(1100, 1100, 9, 9);
    const hit = hitEdge(layout, layout.pad + layout.cell * 2.5, layout.pad, layout.cell * 0.2);
    expect(hit).toMatchObject({ kind: "borderEdge", side: "top", index: 2 });
  });
});

describe("paths through virtual outside cells", () => {
  it("uses one logical coordinate system for real and virtual cells", () => {
    const layout = computeLayout(1100, 1100, 9, 9);
    expect(hitPathCell(layout, layout.cell * 1.5, layout.cell * 0.5)).toEqual([-1, 0]);
    expect(hitPathCell(layout, layout.cell * 1.5, layout.cell * 1.5)).toEqual([0, 0]);
  });

  it("allows a line to leave the board and return", () => {
    const app = new App(createEmptyPuzzle("outside path"));
    app.setMode("edit");
    app.selectTool("thermo");
    app.pathCellClick(0, 0);
    app.pathCellClick(-1, 0);
    app.pathCellClick(-1, 1);
    app.pathCellClick(0, 1);
    app.commitPath();

    expect(app.puzzle.thermos[0]?.cells).toEqual([[0, 0], [-1, 0], [-1, 1], [0, 1]]);
  });

  it("skips automatic validation for a constraint that crosses outside", () => {
    const puzzle = createEmptyPuzzle("outside validation");
    puzzle.cells[0][0].value = "9";
    puzzle.cells[0][1].value = "1";
    puzzle.thermos.push({
      id: 1,
      cells: [[0, 0], [-1, 0], [-1, 1], [0, 1]],
    });

    expect(findViolatedRules(puzzle, [0, 1], new Set())).not.toContain("thermometer");
  });
});
