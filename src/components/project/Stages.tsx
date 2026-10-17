"use client";

import { Check } from "lucide-react";
import { cx } from "../ui";
import { STAGES, stageDef, stageIndex } from "@/lib/project";
import type { ProjectStage } from "@/lib/types";

const TONE: Record<ProjectStage, string> = {
  quote: "bg-amber-50 text-amber-700",
  purchase: "bg-blue-50 text-blue-700",
  install: "bg-violet-50 text-violet-700",
  service: "bg-green-50 text-green-700",
};

export function StageBadge({ stage }: { stage: ProjectStage }) {
  const def = stageDef(stage);
  const Icon = def.icon;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONE[stage])}>
      <Icon size={12} /> {def.label}
    </span>
  );
}

/** The project's four stages in order: the ones behind it done, the current one marked. Tapping one moves the project there. */
export function StageBar({ stage, onPick }: { stage: ProjectStage; onPick?: (s: ProjectStage) => void }) {
  const at = stageIndex(stage);
  return (
    <ol className="grid grid-cols-4 gap-1 rounded-2xl bg-white p-1.5 ring-1 ring-slate-200">
      {STAGES.map((s, i) => {
        const Icon = i < at ? Check : s.icon;
        const current = i === at;
        return (
          <li key={s.id} className="min-w-0">
            <button
              disabled={!onPick || current}
              onClick={() => onPick?.(s.id)}
              aria-current={current ? "step" : undefined}
              className={cx(
                "flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-xs transition sm:flex-row sm:justify-center sm:gap-2 sm:text-sm",
                current ? "bg-slate-900 font-semibold text-white" : i < at ? "text-slate-700" : "text-slate-400",
                onPick && !current && "hover:bg-slate-100",
              )}
            >
              <span
                className={cx(
                  "grid size-7 shrink-0 place-items-center rounded-full",
                  current ? "bg-white/15" : i < at ? "bg-green-100 text-green-700" : "bg-slate-100",
                )}
              >
                <Icon size={15} />
              </span>
              <span className="truncate">
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
