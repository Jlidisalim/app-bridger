/**
 * Admin notification service.
 * Sends alerts to Slack and/or email for critical events (disputes, fraud, KYC manual review).
 */
import config from '../config/env';
import logger from '../utils/logger';

export async function notifyAdminNewDispute(dispute: {
  id: string;
  dealId: string;
  reason: string;
  slaDeadline: Date;
  filerId: string;
}): Promise<void> {
  const text = [
    `🚨 *New Dispute Opened*`,
    `Dispute ID: \`${dispute.id}\``,
    `Deal ID: \`${dispute.dealId}\``,
    `Filed by: \`${dispute.filerId}\``,
    `Reason: ${dispute.reason}`,
    `SLA deadline: ${dispute.slaDeadline.toISOString()}`,
  ].join('\n');

  await Promise.allSettled([
    sendSlack(text),
    sendEmail(`[Bridger] New Dispute — ${dispute.dealId}`, text),
  ]);
}

export async function notifyAdminKycManualReview(payload: {
  userId: string;
  similarity: number;
}): Promise<void> {
  const text = [
    `🔍 *KYC Manual Review Required*`,
    `User ID: \`${payload.userId}\``,
    `Face similarity score: ${payload.similarity.toFixed(4)} (threshold: 0.65)`,
    `Action: Review the user's submitted ID and selfie in the admin panel.`,
  ].join('\n');

  await Promise.allSettled([
    sendSlack(text),
    sendEmail(`[Bridger] KYC Manual Review — User ${payload.userId}`, text),
  ]);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function sendSlack(text: string): Promise<void> {
  const webhookUrl = config.admin.slackWebhookUrl;
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn('Slack alert failed', { status: res.status });
    }
  } catch (err: any) {
    logger.warn('Slack alert error', { error: err.message });
  }
}

async function sendEmail(subject: string, body: string): Promise<void> {
  const adminEmail = config.admin.email;
  if (!adminEmail) return;

  // Nodemailer integration — only initialised when SMTP_* env vars are set
  // Add SMTP_HOST, SMTP_USER, SMTP_PASS to .env to enable email alerts
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `noreply@bridger.app`,
      to: adminEmail,
      subject,
      text: body,
    });
  } catch (err: any) {
    logger.warn('Email alert error', { error: err.message });
  }
}
