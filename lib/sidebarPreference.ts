// Desktop sidebar collapsed/expanded preference — a per-viewer convenience kept in
// localStorage, mirroring how the theme preference is stored (see ThemeProvider).
//
// The state is exposed to CSS as <html data-sidebar="collapsed">. The blocking script
// below sets it before first paint, so a refresh renders the sidebar in the saved
// state immediately instead of flashing expanded and then collapsing.

const STORAGE_KEY = 'bobcat-sidebar'

export const SIDEBAR_BLOCKING_SCRIPT = `(function(){try{if(localStorage.getItem('${STORAGE_KEY}')==='collapsed'){document.documentElement.setAttribute('data-sidebar','collapsed')}}catch(e){}})();`

export function readSidebarCollapsed(): boolean {
  return document.documentElement.getAttribute('data-sidebar') === 'collapsed'
}

export function writeSidebarCollapsed(collapsed: boolean) {
  if (collapsed) {
    document.documentElement.setAttribute('data-sidebar', 'collapsed')
  } else {
    document.documentElement.removeAttribute('data-sidebar')
  }
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded')
  } catch {
    // storage blocked — the preference just lasts for this page session
  }
}
