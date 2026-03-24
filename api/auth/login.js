import { kv } from "@vercel/kv";
import bcrypt from "bcryptjs";
import { signToken, setCookieHeader } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }

  const user = await kv.get(`user:${email.toLowerCase()}`);
  if (!user) {
    return res.status(401).json({ error: "Email ou mot de passe incorrect" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Email ou mot de passe incorrect" });
  }

  const token = signToken(user.id);
  res.setHeader("Set-Cookie", setCookieHeader(token));
  return res.json({ success: true });
}
