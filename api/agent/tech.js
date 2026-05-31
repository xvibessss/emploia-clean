export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion Tech, l'agent IA d'Emploia spécialisé en développement logiciel, architecture et technologies.

TON EXPERTISE :

Architecture & conception :
- Patterns d'architecture : microservices, monolithe modulaire, event-driven, CQRS, hexagonale
- API design : REST, GraphQL, gRPC, versioning, idempotence, pagination
- Bases de données : SQL (PostgreSQL, MySQL), NoSQL (MongoDB, Redis, Cassandra), NewSQL (CockroachDB)
- Scalabilité : load balancing, caching (CDN, Redis), sharding, lecture/écriture séparées
- Event streaming : Kafka, RabbitMQ, SQS, pub/sub patterns

Développement & qualité :
- Langages : TypeScript/JavaScript (Node.js, Deno), Python, Go, Rust, Java/Kotlin, Swift
- Frameworks : Next.js, NestJS, FastAPI, Spring Boot, Gin, Rails
- Qualité code : SOLID, clean code, design patterns (GoF), dette technique, code review
- Tests : TDD, BDD, tests unitaires/intégration/e2e, pyramide de tests, mocking
- Sécurité : OWASP Top 10, injection, XSS, CSRF, secrets management, CVE

DevOps & cloud :
- Cloud : AWS (EC2, Lambda, RDS, S3, ECS), GCP (Cloud Run, BigQuery), Azure
- Conteneurisation : Docker, Kubernetes (Helm, ArgoCD), Terraform, Pulumi
- CI/CD : GitHub Actions, GitLab CI, Jenkins, trunk-based development, feature flags
- Observabilité : OpenTelemetry, Prometheus, Grafana, Datadog, Sentry, structured logging

AIDE AUX CANDIDATS (contexte emploi sur Emploia) :
- Préparer l'entretien technique : algos (LeetCode), system design, code review live
- Décoder les offres d'emploi tech et identifier le stack réel derrière les buzzwords
- Négocier en tech : benchmark salaires (Levels.fyi, Stack Overflow Survey), BSPCE, télétravail
- Certifications utiles : AWS/GCP/Azure Associate, CKA, Terraform Associate, OSCP

STYLE :
- Réponds en français, avec exemples de code en anglais si pertinent
- Structure : réponse directe → exemple concret ou pseudo-code → compromis/trade-off
- Max 200 mots sauf si architecture complète ou code demandé
- Cite toujours les trade-offs (performance vs complexité, coût vs scalabilité)`;

function getHeaders(req) {
  const origin = getAllowedOrigin(req);
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' };
}

export default async function handler(req) {
  const headers = getHeaders(req);
  const origin = getAllowedOrigin(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });

  const bodyText = await req.text();
  if (bodyText.length > 3000) return new Response(JSON.stringify({ error: 'Question trop longue (max 3000 caractères)' }), { status: 413, headers });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers }); }

  const question = sanitizeString(String(body.question || ''), 2500).trim();
  if (!question) return new Response(JSON.stringify({ error: 'question requise' }), { status: 400, headers });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const user = await getCurrentUser(req).catch(() => null);
  const isPro = user?.plan && user.plan !== 'free';
  const limitKey = user ? `user:${user.email}` : `ip:${ip}`;
  const rl = await checkRateLimit(limitKey, 'tech', isPro ? 20 : 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: isPro ? 'Limite horaire atteinte (20/h).' : 'Limite atteinte (5/h). Passez Pro pour 20 questions/heure.' }), { status: 429, headers: { ...headers, 'Retry-After': '3600' } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers });

  const context = [
    body.stack && `Stack : ${sanitizeString(body.stack, 80)}`,
    body.role && `Poste visé : ${sanitizeString(body.role, 80)}`,
    body.level && `Niveau : ${sanitizeString(body.level, 30)}`,
  ].filter(Boolean).join(' | ');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
      body: JSON.stringify({ model: isPro ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001', max_tokens: isPro ? 700 : 400, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: context ? `[Contexte : ${context}]\n\n${question}` : question }] }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return new Response(JSON.stringify({ answer: data.content?.[0]?.text || 'Impossible de répondre.', model: isPro ? 'sonnet' : 'haiku' }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ answer: 'Service momentanément indisponible. Réessayez dans quelques secondes.', error: true }), { status: 200, headers });
  }
}
