import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  // money and counts are right-aligned so they scan in a column
  align?: 'left' | 'right'
  // narrow screens keep the columns that matter; put the essentials in the first column's cell
  hideBelow?: 'sm' | 'md' | 'lg'
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  // accessible name for the table
  caption: string
  // Engineering is compact; Business is a little roomier.
  density?: 'compact' | 'comfortable'
  emptyState?: ReactNode
  rowClassName?: (row: T) => string
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const

// The one table for every workspace: quiet header, subtle row rules, hover, right-aligned numerals, and horizontal
// scrolling as a last resort. Rows are not made clickable as a whole; the first column carries the link so keyboard
// and screen-reader users get a real link.
export default function DataTable<T>({ columns, rows, rowKey, caption, density = 'compact', emptyState, rowClassName }: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>
  const pad = density === 'compact' ? 'py-2' : 'py-3'
  return (
    <div className="overflow-x-auto scrollbar-thin rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-text-muted first:pl-4 last:pr-4 ${c.align === 'right' ? 'text-right' : ''} ${c.hideBelow ? HIDE[c.hideBelow] : ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={`transition-colors hover:bg-surface-raised ${rowClassName?.(row) ?? ''}`}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 ${pad} align-middle first:pl-4 last:pr-4 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${c.className ?? ''}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
