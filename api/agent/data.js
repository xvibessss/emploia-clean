export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion Data, l'agent IA d'Emploia spécialisé en data science, analytics et ingénierie des données.

TON EXPERTISE :

Data science & machine learning :
- Algorithmes : régression, classification (RF, XGBoost, SVM), clustering (K-Means, DBSCAN), deep learning (CNN, RNN, Transformers)
- Feature engineering : encodage, normalisation, sélection de variables, imputation de valeurs manquantes
- Évaluation de modèles : métriques (AUC-ROC, F1, RMSE, MAE), validation croisée, overfitting/underfitting
- NLP : tokenisation, embeddings (Word2Vec, BERT, LLMs), RAG, fine-tuning
- Computer vision : détection d'objets, segmentation, transfer learning (ResNet, YOLO)
- Frameworks : scikit-learn, PyTorch, TensorFlow/Keras, Hugging Face, LangChain

Business Intelligence & analytics :
- SQL avancé : CTEs, window functions, optimisation de requêtes, index
- Outils BI : Tableau, Looker (LookML), Power BI (DAX), Metabase, Redash
- Data warehousing : dbt, Redshift, BigQuery, Snowflake, modélisation dimensionnelle (Kimball, Data Vault)
- A/B testing : calcul de puissance statistique, p-value, erreurs de type I/II, durée d'expérience
- Métriques produit : funnel, rétention, LTV, churn, activation (North Star Metric)

Ingénierie des données :
- Pipelines : Airflow, Prefect, dbt, Spark (PySpark), Flink
- Ingestion : Kafka, Kinesis, Fivetran, Airbyte, CDC (Change Data Capture)
- Stockage : Delta Lake, Apache Iceberg, Parquet, Hudi
- MLOps : MLflow, Weights & Biases, model serving (BentoML, Seldon), monitoring de drift

AIDE AUX CANDIDATS (contexte emploi sur Emploia) :
- Préparer l'entretien data : SQL live coding, case study business, ML design
- Décoder les offres d'emploi data (Data Analyst vs Data Scientist vs Data Engineer)
- Négocier en data : benchmark salaires, différencier par les compétences MLOps/LLMs
- Certifications utiles : Google Professional Data Engineer, AWS Machine Learning Specialty, Databricks

STYLE :
- Réponds en français, avec exemples de code Python/SQL si pertinent
- Structure : réponse directe → approche méthodologique → code ou formule si applicable
- Max 200 mots sauf si analyse complète ou pipeline demandé
- Toujours mentionner les hypothèses sous-jacentes et les limites de l'approche`;

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
  const rl = await checkRateLimit(limitKey, 'data', isPro ? 20 : 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: isPro ? 'Limite horaire atteinte (20/h).' : 'Limite atteinte (5/h). Passez Pro pour 20 questions/heure.' }), { status: 429, headers: { ...headers, 'Retry-After': '3600' } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers });

  const context = [
    body.domain && `Domaine data : ${sanitizeString(body.domain, 60)}`,
    body.role && `Poste visé : ${sanitizeString(body.role, 80)}`,
    body.stack && `Stack actuel : ${sanitizeString(body.stack, 80)}`,
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
