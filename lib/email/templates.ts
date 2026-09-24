import { notificationHref } from '@/lib/notificationLinks'
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

  const subject = `Bobcat Racing: ${job.title}`
  const text = [
    greeting,
    '',
    job.title,
    ...(job.message ? [job.message] : []),
    '',
    `Open it: ${link}`,
    '',
    `You get this email because this type of notification is turned on. You can change that under Account > Email Notifications: ${settings}`,
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:24px">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Bobcat Racing</div>
    <p style="margin:16px 0 4px;font-size:14px;color:#374151">${escapeHtml(greeting)}</p>
    <h1 style="margin:0 0 8px;font-size:18px;line-height:1.3">${escapeHtml(job.title)}</h1>
    ${job.message ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;white-space:pre-wrap">${escapeHtml(job.message)}</p>` : '<div style="height:12px"></div>'}
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#00205b;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 16px;border-radius:8px">Open in Bobcat Racing</a>
    <p style="margin:24px 0 0;font-size:11px;color:#6b7280">You get this email because this type of notification is turned on. Change it any time under <a href="${escapeHtml(settings)}" style="color:#6b7280">Account &rarr; Email Notifications</a>.</p>
  </div>
</body></html>`

  return { subject, text, html }
}
