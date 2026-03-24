import bcrypt from "bcryptjs";
import { signToken, setCookieHeader, kvGet, kvSet } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Nom, email et mot de passe requis" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères" });
  }

  const existing = await kvGet(`user:${email.toLowerCase()}`);
  if (existing) {
    return res.status(409).json({ error: "Un compte avec cet email existe déjà" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = Date.now();
  const user = {
    id,
    name,
    email: email.toLowerCase(),
    passwordHash,
    generationsUsed: 0,
    plan: "free",
  };

  await kvSet(`user:${email.toLowerCase()}`, user);
  await kvSet(`userid:${id}`, email.toLowerCase());

  const token = signToken(id);
  res.setHeader("Set-Cookie", setCookieHeader(token));
  return res.json({ success: true });
}
