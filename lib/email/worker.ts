import { renderEmail, type EmailJob } from './templates'
import type { EmailTransport } from './transport'

type RpcResult = { data: unknown; error: { message: string } | null }

export interface WorkerDeps {
  // Calls a database function as the service role (see lib/supabase/admin.ts).
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>
  // null when no email provider is configured: the due-soon scan still runs (it creates the in-app
  // notifications), but nothing is claimed or sent, so queued emails simply wait.
  transport: EmailTransport | null
  appUrl: string
  batchSize?: number
  maxAttempts?: number
}

export interface WorkerResult {
  dueSoonCreated: number | null
  // notifications created by the sponsorship renewal scan; null if the scan failed (or 0036 is not applied yet)
  renewalRemindersCreated: number | null
  claimed: number
  sent: number
  retryScheduled: number
  gaveUp: number
  problems: string[]
}

// One pass of the email queue: run the due-soon and renewal-reminder scans, claim a batch, send each email, and record the
// outcome. All the state (locking, retries, "sent exactly once") lives in the database functions from
// migration 0029 — this only moves data between them and the email provider, so it is safe to run
// repeatedly or from more than one place at once.
export async function processEmailQueue(deps: WorkerDeps): Promise<WorkerResult> {
  const batchSize = deps.batchSize ?? 25
  const maxAttempts = deps.maxAttempts ?? 5
  const result: WorkerResult = { dueSoonCreated: null, renewalRemindersCreated: null, claimed: 0, sent: 0, retryScheduled: 0, gaveUp: 0, problems: [] }

  const scan = await deps.rpc('enqueue_due_soon_notifications', { p_today: null })
  if (scan.error) result.problems.push(`due-soon scan failed: ${scan.error.message}`)
  else result.dueSoonCreated = Number(scan.data ?? 0)

  // Sponsorship renewal reminders (migration 0036): the same idea, and the same rules for retries. The database
  // records each (renewal date, threshold) before it notifies anyone, so running this on every pass is safe. Its own
  // failure never stops the due-soon scan above or the email sending below, and nothing here needs a mail provider.
  const renewals = await deps.rpc('enqueue_sponsorship_renewal_reminders', { p_today: null })
  if (renewals.error) result.problems.push(`renewal reminder scan failed: ${renewals.error.message}`)
  else result.renewalRemindersCreated = Number(renewals.data ?? 0)

  const transport = deps.transport
  if (!transport) return result

  const claim = await deps.rpc('claim_email_batch', { p_limit: batchSize, p_max_attempts: maxAttempts })
  if (claim.error) {
    result.problems.push(`claim failed: ${claim.error.message}`)
    return result
  }
  const jobs = (claim.data ?? []) as EmailJob[]
  result.claimed = jobs.length

  for (const job of jobs) {
    try {
      const email = renderEmail(job, deps.appUrl)
      await transport.send({ to: job.to_email, ...email, idempotencyKey: job.outbox_id })
    } catch (err) {
      const failed = await deps.rpc('fail_email', {
        p_outbox_id: job.outbox_id,
        p_error: err instanceof Error ? err.message : String(err),
        p_max_attempts: maxAttempts,
      })
      if (failed.error) result.problems.push(`could not record failure for ${job.outbox_id}: ${failed.error.message}`)
      else if (failed.data === 'failed') result.gaveUp++
      else result.retryScheduled++
      continue
    }

    // The provider accepted it. If recording that fails, the row stays 'sending' and is recovered
    // after the lock times out; the provider-side idempotency key / Message-ID is what keeps that
    // recovery from turning into a second delivery.
    const done = await deps.rpc('complete_email', { p_outbox_id: job.outbox_id })
    if (done.error) result.problems.push(`sent but could not record ${job.outbox_id}: ${done.error.message}`)
    result.sent++
  }

  return result
}
