import { notificationHref } from '@/lib/notificationLinks'
import { parseRenewalMessage } from '@/lib/sponsorshipRenewals'
import type { AppNotification } from '@/types/database'

// One claimed row from claim_email_batch() (migration 0029): the recipient plus the content of the
// in-app notification the email mirrors.
export interface EmailJob {
  outbox_id: string
  attempt: number
  to_email: string
  recipient_name: string | null
  notification_type: string
  title: string
  message: string | null
  entity_type: string | null
  entity_id: string | null
  category_key: string
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// The email says exactly what the in-app notification says and links to the same page
// (notificationHref is the same helper the notification bell uses), so the two can never disagree.
export function renderEmail(job: EmailJob, appUrl: string): RenderedEmail {
  const base = appUrl.replace(/\/+$/, '')
  const href = notificationHref({
    id: job.outbox_id,
    user_id: '',
    type: job.notification_type,
    title: job.title,
    message: job.message,
    entity_type: job.entity_type,
    entity_id: job.entity_id,
    read_at: null,
    created_at: '',
  } as AppNotification)
  const link = `${base}${href}`
  const settings = `${base}/account`
  const greeting = job.recipient_name ? `Hi ${job.recipient_name},` : 'Hi,'

  // A sponsorship renewal reminder gets its own, more useful layout: the facts as a small table. Anything the message
  // does not parse as (it always does when the database wrote it) falls back to the generic email below.
  const renewal = job.notification_type === 'sponsorship_renewal' ? parseRenewalMessage(job.message) : null
  const renewalRows: [string, string][] = renewal
    ? [
        ['Sponsor', renewal.sponsor],
        ...(renewal.level ? ([['Level', renewal.level]] as [string, string][]) : []),
        ['Renewal date', renewal.renewalDate],
        ['Time left', renewal.remaining === 'renews today' ? 'Renews today' : renewal.remaining.replace(' remaining', '')],
        ['Responsible', renewal.responsible === 'not assigned' ? 'Not assigned' : renewal.responsible],
      ]
    : []

  const subject = renewal
    ? `Bobcat Racing: ${renewal.sponsor} renewal ${renewal.daysRemaining === 0 ? 'is today' : `in ${renewal.daysRemaining} ${renewal.daysRemaining === 1 ? 'day' : 'days'}`}`
    : `Bobcat Racing: ${job.title}`
  const text = [
    greeting,
    '',
    job.title,
    ...(renewal ? renewalRows.map(([k, v]) => `${k}: ${v}`) : job.message ? [job.message] : []),
    '',
    `Open it: ${link}`,
    '',
    `You get this email because this type of notification is turned on. You can change that under Account > Email Notifications: ${settings}`,
  ].join('\n')

  const detailsHtml = renewal
    ? `<table role="presentation" style="border-collapse:collapse;margin:0 0 20px;font-size:14px;color:#374151">${renewalRows
        .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;font-weight:600">${escapeHtml(v)}</td></tr>`)
        .join('')}</table>`
    : job.message
      ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;white-space:pre-wrap">${escapeHtml(job.message)}</p>`
      : '<div style="height:12px"></div>'

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:24px">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Bobcat Racing</div>
    <p style="margin:16px 0 4px;font-size:14px;color:#374151">${escapeHtml(greeting)}</p>
    <h1 style="margin:0 0 8px;font-size:18px;line-height:1.3">${escapeHtml(job.title)}</h1>
    ${detailsHtml}
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#00205b;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 16px;border-radius:8px">Open in Bobcat Racing</a>
    <p style="margin:24px 0 0;font-size:11px;color:#6b7280">You get this email because this type of notification is turned on. Change it any time under <a href="${escapeHtml(settings)}" style="color:#6b7280">Account &rarr; Email Notifications</a>.</p>
  </div>
</body></html>`

  return { subject, text, html }
}
