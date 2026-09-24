import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEmailTransportFromEnv } from '@/lib/email/transport'
import { processEmailQueue } from '@/lib/email/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_APP_URL = 'https://bobcat-racing-dashboard.vercel.app'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// The email worker. Called on a schedule (Vercel Cron, or Supabase pg_cron via pg_net — see
// supabase/optional/schedule_email_worker.sql) with `Authorization: Bearer $CRON_SECRET`. It has no
// user session, so the auth middleware lets /api/cron through and this bearer secret is its only
// gate: with no CRON_SECRET configured the route is disabled outright.
async function run(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Email worker is not configured' }, { status: 503 })
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 })

  // With no provider configured nothing is sent (queued emails wait), but the due-soon scan still
  // runs so the in-app "task due soon" notifications do not depend on email being set up.
  const transport = getEmailTransportFromEnv()

  const result = await processEmailQueue({
    rpc: async (fn, args) => {
      const { data, error } = await admin.rpc(fn, args)
      return { data, error: error ? { message: error.message } : null }
    },
    transport,
    appUrl: process.env.APP_URL || DEFAULT_APP_URL,
  })

  return NextResponse.json({
    provider: transport?.name ?? null,
    ...(transport ? {} : { note: 'No email provider configured (EMAIL_FROM plus RESEND_API_KEY or SMTP_*): emails stay queued and none were sent.' }),
    ...result,
  })
}

export const GET = run
export const POST = run
