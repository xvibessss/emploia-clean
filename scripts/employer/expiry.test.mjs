#!/usr/bin/env node
// Unit tests for employer offer lifecycle (pure helpers). No framework — run: node scripts/employer/expiry.test.mjs
import assert from 'node:assert/strict';
import { isJobLive, expiresAt, toPublicJob, EMPLOYER_JOB_EXPIRY_DAYS } from '../../api/_lib/employer.js';

const DAY = 86400000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

test('active + fresh → live', () => {
  const job = { status: 'active', postedAt: iso(now - 2 * DAY) };
  assert.equal(isJobLive(job, now), true);
});

test('active but past expiry → not live', () => {
  const job = { status: 'active', postedAt: iso(now - (EMPLOYER_JOB_EXPIRY_DAYS + 1) * DAY) };
  assert.equal(isJobLive(job, now), false);
});

test('closed → never live even if fresh', () => {
  const job = { status: 'closed', postedAt: iso(now) };
  assert.equal(isJobLive(job, now), false);
});

test('renew resets the clock', () => {
  const job = { status: 'active', postedAt: iso(now - (EMPLOYER_JOB_EXPIRY_DAYS + 5) * DAY), renewedAt: iso(now - DAY) };
  assert.equal(isJobLive(job, now), true);
});

test('missing/invalid dates → not live (fail closed)', () => {
  assert.equal(isJobLive({ status: 'active' }, now), false);
  assert.equal(isJobLive(null, now), false);
});

test('expiresAt is EXPIRY_DAYS after last refresh', () => {
  const posted = now - 10 * DAY;
  const job = { status: 'active', postedAt: iso(posted) };
  const expected = posted + EMPLOYER_JOB_EXPIRY_DAYS * DAY;
  assert.equal(new Date(expiresAt(job)).getTime(), expected);
});

test('toPublicJob strips the manage token', () => {
  const job = { id: 'emp_1', title: 'Dev', manageToken: 'secret123', contactEmail: 'a@b.fr' };
  const pub = toPublicJob(job);
  assert.equal('manageToken' in pub, false);
  assert.equal(pub.title, 'Dev');
  // immutability: original untouched
  assert.equal(job.manageToken, 'secret123');
});

console.log(`\n✓ employer lifecycle: ${passed} tests passed\n`);
