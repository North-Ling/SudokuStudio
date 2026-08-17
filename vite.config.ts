import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 开发模式下，把「保存到题库」的题目 JSON 写入 src/puzzles/ 文件夹。
 * 仅在 `pnpm dev` 时生效（生产构建没有 dev server，无法写文件）。
 */
function puzzleFolderWriter(): Plugin {
  return {
    name: "sudoku-puzzle-folder-writer",
    configureServer(server) {
      server.middlewares.use("/__sudoku/save-puzzle", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          res.setHeader("Content-Type", "application/json");
          try {
            const payload = JSON.parse(body) as { filename?: string; json?: string };
            const safe = String(payload.filename || "未命名题目")
              .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 80) || "未命名题目";
            const dir = join(process.cwd(), "src", "puzzles");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, `${safe}.json`), payload.json ?? "", "utf-8");
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, filename: `${safe}.json` }));
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), puzzleFolderWriter()],
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5199,
  },
});
