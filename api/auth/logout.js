import { COOKIE_NAME } from "../_lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`);
  return res.json({ success: true });
}
