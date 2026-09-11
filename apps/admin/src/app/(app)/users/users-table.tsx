"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable, StatusPill } from "@repo/ui";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  accountStatus: string;
  createdAt: Date;
};

function AccountStatusBadge({ status }: { status: string }) {
  // Was raw emerald/amber Tailwind defaults, which are not in BRANDING.md's
  // palette and set small text in a saturated hue on a same-hue ground.
  // StatusPill takes a MEANING, not a colour, and keeps the text at
  // --foreground so legibility never depends on the hue.
  return status === "active" ? (
    <StatusPill variant="active">Active</StatusPill>
  ) : (
    <StatusPill variant="pending">Invited</StatusPill>
  );
}

// columns must be defined in a Client Component: DataTable itself is
// 'use client', and cell renderers are functions — functions can't cross
// the Server -> Client prop boundary, so this file receives only
// serializable `users` data from the RSC page and builds the ColumnDef[]
// itself.
export function UsersTable({ users }: { users: UserRow[] }) {
  const columns: ColumnDef<UserRow>[] = [
    {
      id: "user",
      accessorFn: (row) => `${row.name ?? ""} ${row.email}`,
      header: "User",
      cell: ({ row }) => (
        <Link href={`/users/${row.original.id}`} className="block hover:underline">
          <div className="font-medium">{row.original.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{row.original.email}</div>
        </Link>
      ),
    },
    {
      accessorKey: "accountStatus",
      header: "Status",
      cell: ({ row }) => <AccountStatusBadge status={row.original.accountStatus} />,
      enableColumnFilter: false,
    },
    {
      id: "actions",
      header: "",
      enableColumnFilter: false,
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Manage roles
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} data={users} />;
}
