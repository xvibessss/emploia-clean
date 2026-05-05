export const config = { runtime: 'edge' };
import { getAllowedOrigin } from '../_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };

  if (req.method === "OPTIONS") return new Response(null, {
    status: 204, headers: { ...H, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
  });

  // Clear both old and new cookie names for smooth migration
  const clearCookies = [
    "__Host-emploia-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure",
    "emploia-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure",
  ];

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      ...H,
      "Set-Cookie": clearCookies.join(", "),
    }
  });
}
