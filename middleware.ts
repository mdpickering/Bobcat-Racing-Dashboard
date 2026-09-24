import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const AUTH_PATHS = ['/login', '/signup', '/pending-approval', '/deactivated']

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request)
  const pathname = request.nextUrl.pathname

  const isAuthPath = AUTH_PATHS.some((p) => pathname.startsWith(p))

  if (!isAuthPath) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('approved, active')
      .eq('id', user.id)
      .single()

    if (!profile?.approved) {
      const url = request.nextUrl.clone()
      url.pathname = '/pending-approval'
      return NextResponse.redirect(url)
    }

    // RLS already blocks a deactivated user's data access (migration 0021);
    // this just shows them why instead of a shell full of empty/error states.
    if (!profile.active) {
      const url = request.nextUrl.clone()
      url.pathname = '/deactivated'
      return NextResponse.redirect(url)
    }
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // /api/cron/* is called by a scheduler, not a signed-in user; those routes authenticate
    // themselves with a bearer secret (see app/api/cron/email/route.ts).
    '/((?!_next/static|_next/image|favicon.ico|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
