import { getCurrentUser } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      generationsUsed: user.generationsUsed,
    },
  });
}
