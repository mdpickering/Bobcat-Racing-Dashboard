import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  // usually a plain label; a selection column passes a "select all" checkbox instead
  header: ReactNode
  cell: (row: T) => ReactNode
  // money and counts are right-aligned (and set in the mono face) so they scan in a column
  align?: 'left' | 'right'
  // narrow screens keep the columns that matter; put the essentials in the first column's cell
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
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
  // e.g. "tasks": adds a quiet "12 tasks" footer to the card so the size of a filtered list is always visible
  countLabel?: string
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' } as const

// The one table for every workspace, shown as a floating card: a tinted header band, soft row rules, a hover wash,
// mono right-aligned figures, and horizontal scrolling as a last resort. Rows are not made clickable as a whole; the
// first column carries the link so keyboard and screen-reader users get a real link.
export default function DataTable<T>({ columns, rows, rowKey, caption, density = 'compact', emptyState, rowClassName, countLabel }: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>
  const pad = density === 'compact' ? 'py-2.5' : 'py-3.5'
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-panel">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-raised/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-3 py-3 text-2xs font-semibold text-text-secondary first:pl-5 last:pr-5 ${c.align === 'right' ? 'text-right' : ''} ${c.hideBelow ? HIDE[c.hideBelow] : ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => (
              <tr key={rowKey(row)} className={`transition-colors hover:bg-surface-raised/70 ${rowClassName?.(row) ?? ''}`}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 ${pad} align-middle first:pl-5 last:pr-5 ${c.align === 'right' ? 'text-right font-mono tabular-nums text-text-primary' : ''} ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${c.className ?? ''}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {countLabel && (
        <div className="border-t border-border bg-surface-raised/30 px-5 py-2.5 text-2xs text-text-muted">
          {rows.length} {rows.length === 1 ? countLabel.replace(/s$/, '') : countLabel}
        </div>
      )}
    </div>
  )
}
