'use client'

import { useEffect } from 'react'

let counter = 0

// React marks every DOM node it has hydrated or created with an internal fiber key. Touching a server-rendered node
// BEFORE React has hydrated it makes React report "extra attributes from the server", so such nodes are skipped now and
// picked up by a later scan.
const isHydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith('__reactFiber$'))

// Many forms in the app put a <label> beside a field without linking them (no htmlFor/id), so a screen reader announces
// an unnamed field and clicking the label does not focus it. This links each such label to its field after render --
// but only in the unambiguous case: the label's parent holds exactly ONE field, that field has no name yet, and the
// label does not already wrap it. Anything less clear-cut is left alone. Runs a few times while the page hydrates, then
// shortly after later DOM additions (modals, drawers, route changes).
function associate(root: ParentNode) {
  root.querySelectorAll<HTMLLabelElement>('label:not([for])').forEach((label) => {
    if (label.querySelector('input, select, textarea')) return
    const parent = label.parentElement
    if (!parent) return
    const fields = parent.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="hidden"]), select, textarea')
    if (fields.length !== 1) return
    const field = fields[0]
    if (!isHydrated(label) || !isHydrated(field)) return
    if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby')) return
    if (field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`)) return
    if (!field.id) field.id = `auto-label-${++counter}`
    label.htmlFor = field.id
  })
}

export default function LabelAssociator() {
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [300, 1200, 3500].map((ms) => setTimeout(() => associate(document.body), ms))
    associate(document.body)
    let debounce: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => associate(document.body), 0)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      clearTimeout(debounce)
      timers.forEach(clearTimeout)
    }
  }, [])
  return null
}
