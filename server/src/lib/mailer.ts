import { config } from './config.js';

export type Mail = { to: string; subject: string; text: string };

/**
 * Transactional email. No provider has been chosen yet, so mail is written to
 * the server log. Swap `send` for a provider (Postmark, Resend, SES...) later.
 * Tests read `outbox` to follow verification and reset links.
 */
export const outbox: Mail[] = [];

export async function sendMail(mail: Mail) {
  outbox.push(mail);
  if (!config.isTest) console.log(`\n[mail] to=${mail.to} from=${config.mailFrom}\nSubject: ${mail.subject}\n${mail.text}\n`);
}
