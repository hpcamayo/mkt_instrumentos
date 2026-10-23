"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

// A data table (docs/store-operations/design.md §13.1): a semantic <table> with a sticky header, an optional checkbox
// per row and one keyboard stop per row (↑/↓ move between rows, Home/End jump; the row's own links and buttons stay
// in the Tab order). From 768 px it is a table; on phones each row is a stacked card and each cell shows its column
// name (data-label), the UX-6a pattern of the listing table, so nothing scrolls sideways.

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  // Phone label shown before the value; the first ("primary") column has none and spans the card.
  label?: string;
  cell: (row: T) => ReactNode;
  className?: string;
  primary?: boolean;
};

export type DataTableSelection<T> = {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
  rowLabel: (row: T) => string;
};

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  selection,
  rowClassName,
  onRowShortcut,
}: {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selection?: DataTableSelection<T>;
  rowClassName?: (row: T) => string | undefined;
  // Letter shortcuts for the focused row (stock-18): return true when the key was used.
  onRowShortcut?: (row: T, key: string, opener: HTMLElement) => boolean;
}) {
  const allSelected = Boolean(selection) && rows.length > 0 && rows.every((row) => selection!.selected.has(rowKey(row)));
  const someSelected = Boolean(selection) && rows.some((row) => selection!.selected.has(rowKey(row)));

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (event.target !== event.currentTarget) return;
    if (onRowShortcut && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
      && onRowShortcut(row, event.key.toLowerCase(), event.currentTarget)) {
      event.preventDefault();
      return;
    }
    const body = event.currentTarget.parentElement;
    if (!body) return;
    const all = [...body.children] as HTMLElement[];
    const index = all.indexOf(event.currentTarget);
    const target =
      event.key === "ArrowDown" ? all[index + 1]
      : event.key === "ArrowUp" ? all[index - 1]
      : event.key === "Home" ? all[0]
      : event.key === "End" ? all[all.length - 1]
      : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  const toggleAll = selection ? (
    <input
      type="checkbox"
      className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
      aria-label={allSelected ? "Quitar la selección de esta página" : "Seleccionar todos los de esta página"}
      checked={allSelected}
      ref={(input) => {
        if (input) input.indeterminate = !allSelected && someSelected;
      }}
      onChange={(event) => selection.onToggleAll(event.target.checked)}
    />
  ) : null;

  return (
    <div className="md:overflow-x-auto xl:overflow-visible">
      {/* fast-04: on phones the rows are cards and the header is for screen readers only, so "select all" is its own
          visible row above them; from 768 px it is the header's checkbox. */}
      {selection ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-subtle px-4 t-ui text-ink md:hidden">
          {toggleAll}
          <span aria-hidden="true">{allSelected ? "Quitar la selección" : "Seleccionar todos"}</span>
        </label>
      ) : null}
      <table className="block w-full text-left text-sm md:table md:min-w-full">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only t-micro text-ink-2 md:not-sr-only md:table-header-group">
          <tr>
            {selection ? (
              <th scope="col" className={cn(HEAD, "w-12")}>
                <span className="max-md:hidden">{toggleAll}</span>
              </th>
            ) : null}
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn(HEAD, column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block divide-y divide-subtle md:table-row-group">
          {rows.map((row) => {
            const id = rowKey(row);
            const checked = selection?.selected.has(id) ?? false;
            return (
              <tr
                key={id}
                tabIndex={0}
                onKeyDown={(event) => onRowKeyDown(event, row)}
                className={cn(
                  "relative grid gap-2 px-4 py-4 align-top outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink md:table-row md:p-0",
                  checked && "bg-accent-tint",
                  selection && "pl-12 md:pl-0",
                  rowClassName?.(row),
                )}
              >
                {selection ? (
                  <td className="absolute left-4 top-4 md:static md:table-cell md:px-5 md:py-4">
                    <input
                      type="checkbox"
                      className="h-5 w-5 cursor-pointer accent-ink"
                      aria-label={selection.rowLabel(row)}
                      checked={checked}
                      onChange={() => selection.onToggle(id)}
                    />
                  </td>
                ) : null}
                {columns.map((column) =>
                  column.primary ? (
                    <td key={column.key} className={cn("block md:table-cell md:px-5 md:py-4", column.className)}>
                      {column.cell(row)}
                    </td>
                  ) : (
                    <td key={column.key} data-label={column.label} className={cn(column.label ? CELL : "block pt-1 md:table-cell md:px-5 md:py-4", column.className)}>
                      {column.cell(row)}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const HEAD = "bg-canvas px-5 py-3 md:sticky md:top-0 md:z-10";

// Phones: label on the left, value on the right; 768 px and up: an ordinary cell.
const CELL = "flex items-start justify-between gap-4 t-ui before:t-meta before:content-[attr(data-label)] md:table-cell md:px-5 md:py-4 md:before:content-none";
