import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-prod";
export const COOKIE_NAME = "emploia-token";
export const FREE_LIMIT = 5;

// Direct Upstash REST API calls (no @vercel/kv dependency)
const UPSTASH_URL = process.env.STORAGE_KV_REST_API_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.STORAGE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;

async function upstash(command) {
  const res = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  return res.json();
}

async function kvGet(key) {
  const { result } = await upstash(["GET", key]);
  if (!result) return null;
  try { return JSON.parse(result); } catch { return result; }
}

async function kvSet(key, value) {
  await upstash(["SET", key, JSON.stringify(value)]);
}

// Auth helpers
export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function setCookieHeader(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
}

function getToken(req) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function getCurrentUser(req) {
  const token = getToken(req);
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }

  const email = await kvGet(`userid:${payload.userId}`);
  if (!email) return null;

  return kvGet(`user:${email}`);
}

export async function incrementGenerations(user) {
  await kvSet(`user:${user.email}`, {
    ...user,
    generationsUsed: user.generationsUsed + 1,
  });
}

export { kvGet, kvSet };
