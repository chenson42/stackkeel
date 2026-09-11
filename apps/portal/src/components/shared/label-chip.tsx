"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderKanban, X } from "lucide-react";
import { Button } from "@repo/ui";

/**
 * Shared label chip (task-mgmt-1a-inc3-labels). Renders a label's color +
 * name, with a treatment that differs by whether the label is direct or
 * inherited from the parent project (FR-INH-04). Used from task rows
 * (`task-row.tsx`), task detail, project detail, and both label
 * pickers — one component, so the direct/inherited visual language never
 * drifts between surfaces.
 *
 * FR-INH-04 (MUST): color alone never carries the distinction (this app's
 * NFR-USE-03 invariant) — inherited chips add a project-icon glyph AND
 * "(inherited)" micro-text, not just a lighter shade.
 *
 * FR-INH-05 (MUST): an inherited chip has no remove control at all — in its
 * place, a small info affordance that reveals the exact explanation text on
 * click (works on touch, not hover-only). This mirrors the same copy
 * `removeTaskLabel` returns server-side, so the two surfaces never disagree.
 */
export function LabelChip({
  label,
  inherited,
  onRemove,
  removing,
  href,
}: {
  label: { id: string; name: string; color: string };
  inherited: boolean;
  /** Omit entirely for a read-only (list-row) rendering. */
  onRemove?: () => void;
  removing?: boolean;
  /** When present (task-mgmt-1a-inc4-list-view), the label's name renders as
   * a <Link> to `/labels/[id]` — the only entry point into Label scope. */
  href?: string;
}) {
  const [explainOpen, setExplainOpen] = useState(false);
  const nameNode = href ? (
    <Link
      href={href}
      className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {label.name}
    </Link>
  ) : (
    label.name
  );

  if (inherited) {
    return (
      <span className="relative inline-flex">
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
          style={{ borderColor: `${label.color}80` }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full opacity-50"
            style={{ backgroundColor: label.color }}
            aria-hidden="true"
          />
          <FolderKanban
            className="h-3 w-3 shrink-0 opacity-70"
            aria-hidden="true"
          />
          {nameNode}
          <span className="opacity-70">(inherited)</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setExplainOpen((v) => !v)}
            aria-expanded={explainOpen}
            aria-label={`Why can't I remove ${label.name} here?`}
            title="This label comes from the project"
            className="ml-0.5 h-4 w-4 rounded-full text-[10px] leading-none opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
          >
            ⓘ
          </Button>
        </span>
        {explainOpen && (
          <span
            role="status"
            className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-border bg-background p-2 text-xs text-muted-foreground shadow-md"
          >
            This label comes from the project. Remove it from the project, or
            move this task out of the project, to remove it here.
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
        aria-hidden="true"
      />
      {nameNode}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${label.name}`}
          className="h-4 w-4 rounded-full hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      )}
    </span>
  );
}
