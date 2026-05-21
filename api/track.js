export const config = { runtime: 'nodejs' };

import { kvIncr, kvZadd, kvZcard, kvZremrangebyrank } from './_lib/auth.js';

const VALID_EVENTS = [
  'cv_generated',
  'user_registered',
  'plan_upgraded',
  'interview_started',
  'ats_checked',
  'letter_generated',
];

const MAX_TIMELINE_SIZE = 10000;
const MAX_BODY_SIZE = 1024;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) return res.status(413).json({ error: 'Payload too large' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { event, props } = body || {};
  if (!event || typeof event !== 'string') return res.status(400).json({ error: 'Missing or invalid event' });
  if (!VALID_EVENTS.includes(event)) return res.status(400).json({ error: 'Unknown event' });

  try {
    await kvIncr(`track:${event}`);
    const now = Date.now();
    const member = JSON.stringify({ event, props: props || {}, ts: now });
    await kvZadd('track:events', now, member);
    const size = await kvZcard('track:events');
    if (size > MAX_TIMELINE_SIZE) {
      await kvZremrangebyrank('track:events', 0, size - MAX_TIMELINE_SIZE - 1);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[track] KV error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
