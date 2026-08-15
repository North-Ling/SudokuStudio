import { createRoot } from "react-dom/client";
import "./style.css";
import { PUZZLES } from "./puzzles";
import { SudokuStudio } from "./ui/SudokuStudio";

const root = document.getElementById("app");
if (!root) throw new Error("#app 元素不存在");

createRoot(root).render(<SudokuStudio initialPuzzle={PUZZLES[0].build()} />);
