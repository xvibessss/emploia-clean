// Compteurs d'événements produit (funnel de la console admin).
//
// Les handlers serveur passaient par `fetch('/api/track')`, c'est-à-dire par
// l'endpoint public — qui acceptait donc aussi `plan_upgraded`,
// `user_registered` ou `cv_generated` de n'importe quel navigateur : le funnel
// et le MRR affichés dans l'admin pouvaient être gonflés à volonté. Le serveur
// écrit désormais directement ici, et `/api/track` ne reçoit plus que les
// événements qui naissent vraiment dans le navigateur (CLIENT_EVENTS).
import { kvIncr, kvZadd, kvZcard, kvZremrangebyrank, kvExpire } from './auth.js';

export const SERVER_EVENTS = [
  'cv_generated', 'user_registered', 'plan_upgraded', 'ats_checked',
  'letter_generated', 'referral_code_created', 'referral_signup', 'interview_started',
];
export const CLIENT_EVENTS = ['paywall_viewed', 'checkout_started', 'interview_started'];

const MAX_TIMELINE_SIZE = 10000;
const DAILY_BUCKET_TTL = 120 * 86400;

export async function trackEvent(event, props) {
  if (!SERVER_EVENTS.includes(event) && !CLIENT_EVENTS.includes(event)) return false;
  const now = Date.now();
  await kvIncr(`track:${event}`);
  const bucketKey = `track:${event}:${new Date(now).toISOString().slice(0, 10)}`;
  const { result } = await kvIncr(bucketKey);
  if (Number(result) === 1) await kvExpire(bucketKey, DAILY_BUCKET_TTL);
  // Propriétés bornées : uniquement des scalaires courts, 8 clés au plus.
  const safeProps = {};
  if (props && typeof props === 'object') {
    for (const [k, v] of Object.entries(props).slice(0, 8)) {
      if (['string', 'number', 'boolean'].includes(typeof v)) safeProps[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 80) : v;
    }
  }
  await kvZadd('track:events', now, JSON.stringify({ event, props: safeProps, ts: now }));
  const size = await kvZcard('track:events');
  if (size > MAX_TIMELINE_SIZE) await kvZremrangebyrank('track:events', 0, size - MAX_TIMELINE_SIZE - 1);
  return true;
}
