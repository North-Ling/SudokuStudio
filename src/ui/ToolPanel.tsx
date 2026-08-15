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
      <label title="两条主对角线上的数字分别不能重复；自动显示两条主对角线">
        <input type="checkbox" checked={app.puzzle.globalConstraints.diagonal} onChange={() => { app.toggleGlobalConstraint("diagonal"); sync(); }} />
        <strong>对角线数独</strong>
      </label>
      <label title="国际象棋马步相邻的两个格子不能出现相同数字">
        <input type="checkbox" checked={app.puzzle.globalConstraints.antiKnight} onChange={() => { app.toggleGlobalConstraint("antiKnight"); sync(); }} />
        <strong>无马数独</strong>
      </label>
      <label title="对角相邻的两个格子不能出现相同数字">
        <input type="checkbox" checked={app.puzzle.globalConstraints.antiKing} onChange={() => { app.toggleGlobalConstraint("antiKing"); sync(); }} />
        <strong>无缘数独</strong>
      </label>
      <label title="上下左右相邻格中的数字不能相差 1">
        <input type="checkbox" checked={app.puzzle.globalConstraints.nonConsecutive} onChange={() => { app.toggleGlobalConstraint("nonConsecutive"); sync(); }} />
        <strong>不连续数独</strong>
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
