"use client";

import { Fragment } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState, ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Input } from "./input";
import { cn } from "../../lib/utils";

// Promoted from a predecessor app
// (admin app, Increment 2, DECISION-054/055 — Phase 1's own
// recommendation, Phase 2 approved it against the five-point dependency
// criteria). This is the first `packages/ui` component to depend on
// something outside Radix/cva: @tanstack/react-table, added to this
// package's own package.json dependencies. Byte-identical logic to the
// a predecessor app original; only the `table.tsx`/`input.tsx`/`cn` import paths
// changed to this package's relative convention.
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  initialSorting?: SortingState;
  renderExpandedRow?: (row: TData) => ReactNode | null;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  initialSorting,
  renderExpandedRow,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
  });

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className={(header.column.columnDef.meta as Record<string, string>)?.className}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
          <TableRow>
            {table.getHeaderGroups()[0]?.headers.map((header) => (
              <TableHead key={header.id} className={cn("p-1", (header.column.columnDef.meta as Record<string, string>)?.className)}>
                {header.column.getCanFilter() ? (
                  <Input
                    placeholder="Filter..."
                    value={(header.column.getFilterValue() as string) ?? ""}
                    onChange={(e) =>
                      header.column.setFilterValue(e.target.value || undefined)
                    }
                    className="h-8 text-sm"
                  />
                ) : null}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const expanded = renderExpandedRow?.(row.original);
              return (
                <Fragment key={row.id}>
                  <TableRow>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={(cell.column.columnDef.meta as Record<string, string>)?.className}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {expanded && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="p-0">
                        {expanded}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
