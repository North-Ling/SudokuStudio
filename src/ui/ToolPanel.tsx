import { useEffect, useRef } from "react";
import type { App } from "../app";
import { ToolContext } from "./ToolContext";
import { AUTHOR_TOOL_GROUPS, SOLVE_TOOL_GROUPS } from "./toolDefinitions";

interface Props {
  app: App;
  sync: () => void;
}

export function ToolPanel({ app, sync }: Props) {
  const activeGroupRef = useRef<HTMLDivElement>(null);
  const groups = app.mode === "solve" ? SOLVE_TOOL_GROUPS : AUTHOR_TOOL_GROUPS;

  useEffect(() => {
    activeGroupRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [app.mode, app.tool]);

  return <aside className="panel">
    <div className="panel-heading">
      <strong>{app.mode === "solve" ? "作答工具" : "题面与约束"}</strong>
      <span>{app.mode === "solve" ? "题目约束已锁定" : "完整出题工具"}</span>
    </div>
    {app.mode === "edit" && <div className="global-constraints">
      <div className="group-label">全局额外限制</div>
      <label>
        <input type="checkbox" checked={app.puzzle.globalConstraints.diagonal} onChange={() => { app.toggleGlobalConstraint("diagonal"); sync(); }} />
        <span><strong>对角线不重复</strong><small>自动显示两条主对角线</small></span>
      </label>
      <label>
        <input type="checkbox" checked={app.puzzle.globalConstraints.antiKnight} onChange={() => { app.toggleGlobalConstraint("antiKnight"); sync(); }} />
        <span><strong>无马数独</strong><small>马步位置不能出现相同数字</small></span>
      </label>
      <label>
        <input type="checkbox" checked={app.puzzle.globalConstraints.antiKing} onChange={() => { app.toggleGlobalConstraint("antiKing"); sync(); }} />
        <span><strong>无缘数独</strong><small>对角相邻格不能出现相同数字</small></span>
      </label>
      <label>
        <input type="checkbox" checked={app.puzzle.globalConstraints.nonConsecutive} onChange={() => { app.toggleGlobalConstraint("nonConsecutive"); sync(); }} />
        <span><strong>不连续数独</strong><small>上下左右相邻数字不能相差 1</small></span>
      </label>
    </div>}
    <div id="tools">
      {groups.map((group) => {
        const active = group.tools.some((tool) => tool.tool === app.tool);
        return <div key={group.label} className={`group${active ? " active-group" : ""}`} ref={active ? activeGroupRef : undefined}>
          <div className="group-label">{group.label}</div>
          <div className="tool-grid">
            {group.tools.map((definition) => (
              <button
                key={definition.tool}
                data-tool={definition.tool}
                className={`tool-btn${definition.tool === app.tool ? " active" : ""}`}
                title={definition.hint}
                onClick={() => { app.selectTool(definition.tool); sync(); }}
              >
                {definition.label}
              </button>
            ))}
          </div>
          {active && <ToolContext app={app} sync={sync} />}
        </div>;
      })}
    </div>
  </aside>;
}
