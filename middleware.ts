import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const AUTH_PATHS = ['/login', '/signup', '/pending-approval']

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
      .select('approved')
      .eq('id', user.id)
      .single()

    if (!profile?.approved && pathname !== '/pending-approval') {
      const url = request.nextUrl.clone()
      url.pathname = '/pending-approval'
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
