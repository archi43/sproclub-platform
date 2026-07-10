import "server-only";

/**
 * Mailer PORT (hexagonal boundary) — the notification domain depends on this
 * interface, never on a concrete e-mail vendor. Resend is the first adapter;
 * swapping to SMTP or a per-org provider is another adapter, no domain change.
 * Mirrors the booking provider port/adapter pattern.
 */

export interface MailMessage {
  to: string;
  subject: string;
  body: string; // plain text
}

export interface Mailer {
  /** Send one message; returns the provider message id. */
  send(message: MailMessage): Promise<{ id: string }>;
}

/**
 * Resolve the configured mailer, or null when none is configured. Returning null
 * (rather than throwing) lets the dispatch degrade gracefully: notifications stay
 * `pending` until a provider is wired, and the app keeps working meanwhile —
 * same philosophy as the booking provider.
 */
export function getMailer(): Mailer | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIF_FROM;
  if (!apiKey || !from) return null;
  return new ResendMailer(apiKey, from);
}

/** Resend adapter (https://resend.com) via its REST API — no SDK dependency. */
class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(message: MailMessage): Promise<{ id: string }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: message.to, subject: message.subject, text: message.body }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: data.id ?? "unknown" };
  }
}
