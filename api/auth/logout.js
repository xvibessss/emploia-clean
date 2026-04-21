export const config = { runtime: 'edge' };
import { COOKIE_NAME } from "../_lib/auth.js";

export default function handler(req) {
  const headers = { "Content-Type": "application/json", "Set-Cookie": `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax` };
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
