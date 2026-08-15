import { useEffect, useRef } from "react";
import type { App } from "../app";
import { attachInput } from "../input";

interface Props {
  app: App;
  sync: () => void;
}

export function BoardCanvas({ app, sync }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rows = app.puzzle.grid.rows;
  const cols = app.puzzle.grid.cols;

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 2D 上下文");

    app.attach(ctx);
    const fitCanvas = () => {
      const rect = box.getBoundingClientRect();
      // 以正方形单元格缩放完整虚拟区域；矩形题盘不拉伸，并在容器中居中。
      const cell = Math.max(1, Math.min(rect.width / (cols + 2), rect.height / (rows + 2)));
      const width = Math.max(1, Math.floor(cell * (cols + 2)));
      const height = Math.max(1, Math.floor(cell * (rows + 2)));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      app.resize(width, height);
    };

    const detachInput = attachInput(app, canvas, sync);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(fitCanvas);
    observer?.observe(box);
    window.addEventListener("resize", fitCanvas);
    fitCanvas();

    return () => {
      detachInput();
      observer?.disconnect();
      window.removeEventListener("resize", fitCanvas);
    };
  }, [app, sync, rows, cols]);

  return <div className="canvas-box" id="canvas-box" ref={boxRef}>
    <canvas id="board" ref={canvasRef} />
  </div>;
}
