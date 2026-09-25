import { WORKSPACE_COOKIE, type WorkspaceId } from '@/lib/workspaceAccess'

// The last-used workspace is a per-browser convenience (like the theme and the collapsed sidebar). The server only
// ever treats it as a hint and re-checks it against what the person is actually allowed to use.
export function rememberWorkspace(id: WorkspaceId) {
  try {
    document.cookie = `${WORKSPACE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`
  } catch {
    // cookies blocked — the choice simply is not remembered
  }
}
