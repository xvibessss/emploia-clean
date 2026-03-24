import { createClient } from "@vercel/kv";

const kv = createClient({
  url: process.env.STORAGE_KV_REST_API_URL || process.env.KV_REST_API_URL,
  token: process.env.STORAGE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN,
});
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-prod";
export const COOKIE_NAME = "emploia-token";
export const FREE_LIMIT = 5;

function getToken(req) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function setCookieHeader(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
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

  const email = await kv.get(`userid:${payload.userId}`);
  if (!email) return null;

  return kv.get(`user:${email}`);
}

export async function incrementGenerations(user) {
  await kv.set(`user:${user.email}`, {
    ...user,
    generationsUsed: user.generationsUsed + 1,
  });
}
