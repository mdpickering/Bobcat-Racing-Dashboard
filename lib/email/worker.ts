import { renderEmail, type EmailJob } from './templates'
import type { EmailTransport } from './transport'

type RpcResult = { data: unknown; error: { message: string } | null }

export interface WorkerDeps {
  // Calls a database function as the service role (see lib/supabase/admin.ts).
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>
  transport: EmailTransport
  appUrl: string
  batchSize?: number
  maxAttempts?: number
}

export interface WorkerResult {
  dueSoonCreated: number | null
  claimed: number
  sent: number
  retryScheduled: number
  gaveUp: number
  problems: string[]
}

// One pass of the email queue: run the due-soon scan, claim a batch, send each email, and record the
// outcome. All the state (locking, retries, "sent exactly once") lives in the database functions from
// migration 0029 — this only moves data between them and the email provider, so it is safe to run
// repeatedly or from more than one place at once.
export async function processEmailQueue(deps: WorkerDeps): Promise<WorkerResult> {
  const batchSize = deps.batchSize ?? 25
  const maxAttempts = deps.maxAttempts ?? 5
  const result: WorkerResult = { dueSoonCreated: null, claimed: 0, sent: 0, retryScheduled: 0, gaveUp: 0, problems: [] }

  const scan = await deps.rpc('enqueue_due_soon_notifications', { p_today: null })
  if (scan.error) result.problems.push(`due-soon scan failed: ${scan.error.message}`)
  else result.dueSoonCreated = Number(scan.data ?? 0)

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
      await deps.transport.send({ to: job.to_email, ...email, idempotencyKey: job.outbox_id })
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
