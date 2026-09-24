import nodemailer from 'nodemailer'

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html: string
  // Stable per outbox row. Providers that support it (Resend) use it to refuse a second send of the
  // same message; for SMTP it is the deterministic Message-ID.
  idempotencyKey: string
}

export interface EmailTransport {
  name: string
  send(message: OutgoingEmail): Promise<{ id?: string }>
}

type Env = Record<string, string | undefined>

// Picks the provider from server-side environment variables; nothing here is ever sent to the
// browser. Returns null when no provider is configured, in which case the worker leaves queued
// emails untouched instead of failing them.
//   Resend:  EMAIL_FROM + RESEND_API_KEY
//   SMTP:    EMAIL_FROM + SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS
export function getEmailTransportFromEnv(env: Env = process.env): EmailTransport | null {
  const from = env.EMAIL_FROM?.trim()
  if (!from) return null

  if (env.RESEND_API_KEY) {
    const apiKey = env.RESEND_API_KEY
    return {
      name: 'resend',
      async send(message) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey,
          },
          body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        })
        if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
        const body = (await res.json().catch(() => ({}))) as { id?: string }
        return { id: body.id }
      },
    }
  }

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    const port = Number(env.SMTP_PORT ?? 587)
    const smtp = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
    const fromDomain = from.match(/@([^>\s]+)/)?.[1] ?? 'bobcat-racing.local'
    return {
      name: 'smtp',
      async send(message) {
        const info = await smtp.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          messageId: `<${message.idempotencyKey}@${fromDomain}>`,
        })
        return { id: info.messageId }
      },
    }
  }

  return null
}
