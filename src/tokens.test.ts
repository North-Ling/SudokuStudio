import { describe, expect, it } from "vitest";
import { findViolatedRules } from "./constraintValidation";
import { createGridSpec, gridTokens } from "./grid";
import { createEmptyPuzzle, deserializePuzzle } from "./model";
import {
  cellTokenNumericValue,
  normalizeCellToken,
  parseGridTokenList,
  splitGraphemes,
} from "./tokens";

describe("cell token normalization", () => {
  it("keeps at most three visible characters", () => {
    expect(normalizeCellToken("数独框架")).toBe("数独框");
    expect(normalizeCellToken(" 1234 ")).toBe("123");
  });

  it("counts composed emoji as one visible character", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(splitGraphemes(`${family}ABCD`)).toEqual([family, "A", "B", "C", "D"]);
    expect(normalizeCellToken(`${family}ABCD`)).toBe(`${family}AB`);
  });

  it("normalizes imported puzzle values without splitting multi-character tokens", () => {
    const puzzle = createEmptyPuzzle("token test");
    puzzle.cells[0][0].value = "十二号";
    puzzle.cells[0][1].value = "ABCD";
    const restored = deserializePuzzle(JSON.stringify(puzzle));
    expect(restored.cells[0][0].value).toBe("十二号");
    expect(restored.cells[0][1].value).toBe("ABC");
  });
});

describe("standard numeric palettes", () => {
  it("uses decimal tokens for 12x12 and 16x16 grids", () => {
    expect(gridTokens(createGridSpec(12))).toEqual(Array.from({ length: 12 }, (_, index) => String(index + 1)));
    expect(gridTokens(createGridSpec(16)).at(-1)).toBe("16");
  });

  it("parses multi-digit clue token lists", () => {
    const palette = gridTokens(createGridSpec(16));
    expect(parseGridTokenList("10 11 12", palette)).toEqual(["10", "11", "12"]);
    expect(parseGridTokenList("101112", palette)).toEqual(["10", "11", "12"]);
    expect(parseGridTokenList("34", palette)).toEqual(["3", "4"]);
  });

  it("keeps the legacy A-G numeric mapping for old 12/16 puzzles", () => {
    const grid = createGridSpec(16);
    expect(cellTokenNumericValue("A", grid)).toBe(10);
    expect(cellTokenNumericValue("G", grid)).toBe(16);
    expect(cellTokenNumericValue("ABC", grid)).toBeNull();
  });
});

describe("numeric constraints with multi-character tokens", () => {
  it("validates decimal 10 and 11 in non-consecutive Sudoku", () => {
    const puzzle = createEmptyPuzzle("12x12", createGridSpec(12));
    puzzle.globalConstraints.nonConsecutive = true;
    puzzle.cells[0][0].value = "10";
    puzzle.cells[0][1].value = "11";
    expect(findViolatedRules(puzzle, [0, 1], new Set())).toContain("non-consecutive");
  });

  it("validates legacy A and B with the same numeric semantics", () => {
    const puzzle = createEmptyPuzzle("legacy", createGridSpec(16));
    puzzle.globalConstraints.nonConsecutive = true;
    puzzle.cells[0][0].value = "A";
    puzzle.cells[0][1].value = "B";
    expect(findViolatedRules(puzzle, [0, 1], new Set())).toContain("non-consecutive");
  });

  it("keeps arbitrary three-character tokens non-numeric", () => {
    const puzzle = createEmptyPuzzle("generic grid", createGridSpec(12));
    puzzle.globalConstraints.nonConsecutive = true;
    puzzle.cells[0][0].value = "A-1";
    puzzle.cells[0][1].value = "A-2";
    expect(findViolatedRules(puzzle, [0, 1], new Set())).not.toContain("non-consecutive");
  });
});
