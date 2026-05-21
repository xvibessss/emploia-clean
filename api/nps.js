export const config = { runtime: 'nodejs' };

import { kvGet, kvSet, kvZadd } from './_lib/auth.js';

const MAX_BODY_SIZE = 2048;
const ONE_YEAR_SECONDS = 365 * 86400;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const uid = req.query?.uid;
    if (!uid) return res.status(400).json({ error: 'Missing uid parameter' });
    try {
      const done = await kvGet(`nps:done:${uid}`);
      return res.status(200).json({ alreadyAnswered: !!done });
    } catch (err) {
      console.error('[nps] KV GET error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_BODY_SIZE) return res.status(413).json({ error: 'Payload too large' });

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const { userId, score, comment } = body || {};
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId is required' });
    if (score === undefined || score === null || typeof score !== 'number' || score < 0 || score > 10 || !Number.isInteger(score)) {
      return res.status(400).json({ error: 'score must be an integer between 0 and 10' });
    }

    try {
      const alreadyDone = await kvGet(`nps:done:${userId}`);
      if (alreadyDone) return res.status(409).json({ error: 'Already answered' });

      const now = Date.now();
      const member = JSON.stringify({ userId, score, comment: comment || '', date: new Date().toISOString() });
      await kvZadd('nps:scores', now, member);
      await kvSet(`nps:done:${userId}`, '1', ONE_YEAR_SECONDS);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[nps] KV POST error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
