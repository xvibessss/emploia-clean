export const config = { runtime: 'edge' };
import { getCurrentUser } from "../_lib/auth.js";

export default async function handler(req) {
  const headers = { "Content-Type": "application/json" };
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers });
  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers });
  return new Response(JSON.stringify({ user: { id: user.id, name: user.name, email: user.email, plan: user.plan, generationsUsed: user.generationsUsed } }), { status: 200, headers });
}
