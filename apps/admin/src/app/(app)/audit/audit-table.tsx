"use client";

import { DataTable, FormattedDate } from "@repo/ui";
import type { ColumnDef } from "@tanstack/react-table";
import type { CrossAppAuditRow } from "@/lib/cross-app-audit";

const APP_LABELS: Record<string, string> = {
  portal: "Portal",
  admin: "ADMIN",
};

const columns: ColumnDef<CrossAppAuditRow>[] = [
  {
    accessorKey: "createdAt",
    header: "When",
    cell: ({ row }) => <FormattedDate value={row.original.createdAt} mode="datetime" />,
  },
  {
    accessorKey: "app",
    header: "App",
    cell: ({ row }) => APP_LABELS[row.original.app] ?? row.original.app,
  },
  { accessorKey: "action", header: "Action" },
  {
    accessorKey: "actorEmail",
    header: "Actor",
    // System writes have no actor by design (bootstrap scripts, cron). Say so
    // rather than rendering an empty cell that reads like missing data.
    cell: ({ row }) => row.original.actorEmail ?? <span className="text-muted-foreground">system</span>,
  },
  {
    id: "resource",
    header: "Resource",
    cell: ({ row }) => {
      const { resourceType, resourceId } = row.original;
      if (!resourceType && !resourceId) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="font-mono text-xs">
          {resourceType ?? "?"}
          {resourceId ? `/${resourceId.slice(0, 8)}` : ""}
        </span>
      );
    },
  },
  {
    accessorKey: "ip",
    header: "IP",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.ip ?? "—"}</span>
    ),
  },
  {
    accessorKey: "userAgent",
    header: "User-agent",
    cell: ({ row }) =>
      row.original.userAgent ? (
        <span
          className="block max-w-[200px] truncate text-xs"
          title={row.original.userAgent}
        >
          {row.original.userAgent}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    id: "metadata",
    header: "Metadata",
    cell: ({ row }) => {
      const meta = row.original.metadata;
      const hasMetadata = meta != null && Object.keys(meta).length > 0;
      if (!hasMetadata) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            View metadata
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </details>
      );
    },
  },
];

export function AuditTable({ rows }: { rows: CrossAppAuditRow[] }) {
  return <DataTable columns={columns} data={rows} />;
}
