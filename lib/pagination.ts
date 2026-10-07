// Lists that can grow without bound (tasks, purchase requests, CAD reviews) read at most `limit` rows. When a list hits
// its limit the page says so and offers "Show more" (the limit is a URL parameter, so it can be shared and survives a
// refresh), instead of quietly cutting the list off or loading everything forever.

export const DEFAULT_LIST_LIMIT = 200
export const MAX_LIST_LIMIT = 2000

/** The page's row limit from `?limit=`: a positive whole number, capped, defaulting to DEFAULT_LIST_LIMIT. */
export function parseListLimit(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIST_LIMIT
  return Math.min(Math.floor(n), MAX_LIST_LIMIT)
}

/** True when the list returned as many rows as it was allowed to, so there may be more behind it. */
export function hitLimit(rowCount: number, limit: number): boolean {
  return rowCount >= limit
}

/** The next "Show more" limit: double the current one, never past the maximum. */
export function nextListLimit(limit: number): number {
  return Math.min(limit * 2, MAX_LIST_LIMIT)
}
