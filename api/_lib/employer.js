// Shared logic for employer-posted job offers.
// Pure, immutable helpers so the posting/serving endpoints and the
// self-service management endpoint agree on lifecycle rules.

// An active offer stays visible this many days after it was posted (or renewed).
export const EMPLOYER_JOB_EXPIRY_DAYS = 45;
const DAY_MS = 86400000;

// Reference timestamp for freshness: the most recent of renewedAt / postedAt / date.
function lastRefreshedAt(job) {
  const ref = job.renewedAt || job.postedAt || job.date;
  const t = ref ? new Date(ref).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

// A job is live (shown to candidates) when it is active AND not expired.
export function isJobLive(job, now = Date.now()) {
  if (!job || job.status !== 'active') return false;
  return now - lastRefreshedAt(job) <= EMPLOYER_JOB_EXPIRY_DAYS * DAY_MS;
}

// ISO date at which a job stops being shown.
export function expiresAt(job) {
  return new Date(lastRefreshedAt(job) + EMPLOYER_JOB_EXPIRY_DAYS * DAY_MS).toISOString();
}

// Public-safe projection: never expose the management token to candidates.
export function toPublicJob(job) {
  const { manageToken, ...rest } = job;
  return rest;
}

// Opaque capability token an employer uses to manage their own offer.
export function genManageToken() {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return uuid.replace(/-/g, '');
}
