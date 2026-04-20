const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

const EMAIL_PREVIEW_DIR = path.join(__dirname, '..', '.mail-previews');

function sanitizePreviewSegment(value) {
  return String(value || 'email')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'email';
}

async function writeEmailPreview({ to, subject, text }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${timestamp}-${sanitizePreviewSegment(to)}-${sanitizePreviewSegment(subject)}.txt`;
  const filePath = path.join(EMAIL_PREVIEW_DIR, fileName);
  await fsPromises.mkdir(EMAIL_PREVIEW_DIR, { recursive: true });
  await fsPromises.writeFile(filePath, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, 'utf8');
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[email] Preview written to ${filePath}`);
  }
  return { ok: true, mode: 'preview', file: filePath };
}

async function sendWithResend({ to, subject, text }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  if (!apiKey || !from) return null;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  return { ok: true, mode: 'resend', id: payload.id || null };
}

async function sendEmail({ to, subject, text }) {
  const resendResult = await sendWithResend({ to, subject, text });
  if (resendResult) return resendResult;

  if (process.env.EMAIL_PREVIEW === 'true' && process.env.NODE_ENV !== 'production') {
    return writeEmailPreview({ to, subject, text });
  }

  const message = 'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM, or enable EMAIL_PREVIEW=true for local previews.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[email] ${message}`);
  }
  return { ok: true, mode: 'suppressed' };
}

module.exports = { sendEmail };
