export const config = { runtime: 'edge' };
import { getAllowedOrigin } from '../_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);

  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  });

  // Set-Cookie headers must be sent separately — joining with comma breaks cookie parsing
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  });
  headers.append("Set-Cookie", "__Host-emploia-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure");
  headers.append("Set-Cookie", "emploia-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure");

  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
