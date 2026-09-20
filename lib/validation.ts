// Must stay in sync with public.is_valid_http_url() (migration 0022): the database is
// the real enforcement, this only gives immediate, friendly feedback before a request is made.
const HTTP_URL = /^https?:\/\/[^\s/?#@]+\.[^\s/?#@]+([/?#]\S*)?$/i

/** Returns an error message for an invalid product link, or null when it is acceptable. */
export function validateProductUrl(value: string): string | null {
  const v = value.trim()
  if (!v) return 'A product link is required.'
  if (v.length > 2048) return 'That link is too long.'
  if (!/^https?:\/\//i.test(v)) return 'Enter the full link, starting with http:// or https://'
  if (!HTTP_URL.test(v)) return "That doesn't look like a valid link."
  return null
}
