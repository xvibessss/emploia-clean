export const config = { runtime: 'edge' };
import { kvGet, kvSet, kvSadd, signToken, setCookieHeader, htmlEscape } from '../../_lib/auth.js';

export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return new Response(null, { status: 302, headers: { Location: '/?error=google_denied' } });
  }

  // Validate CSRF state
  const cookies = req.headers.get('cookie') || '';
  const cookieState = cookies.match(/emp_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || state !== cookieState) {
    return new Response(null, { status: 302, headers: { Location: '/?error=oauth_invalid' } });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new Response(null, { status: 302, headers: { Location: '/?error=google_not_configured' } });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

    // Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) throw new Error('Token exchange failed');
    const tokens = await tokenRes.json();

    // Get user info from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) throw new Error('Failed to get user info');
    const googleUser = await userRes.json();

    const email = googleUser.email?.toLowerCase();
    if (!email) throw new Error('No email returned by Google');

    // Find or create user
    let user = await kvGet(`user:${email}`);
    const isNewUser = !user;
    if (!user) {
      const id = `u_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      user = {
        id,
        name: (googleUser.name || email.split('@')[0]).replace(/[\r\n]/g, ' ').trim().slice(0, 100),
        email,
        passwordHash: null,
        passwordSalt: null,
        provider: 'google',
        googleId: googleUser.id,
        avatar: googleUser.picture || null,
        generationsUsed: 0,
        plan: 'free',
        createdAt: new Date().toISOString(),
      };
      await kvSet(`user:${email}`, user);
      await kvSet(`userid:${id}`, email);
      kvSadd('all_users', email).catch(() => {});

      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || 'là';
        const firstName = htmlEscape(firstNameRaw);
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Emploia <noreply@emploia.fr>',
            to: [email],
            subject: `Bienvenue sur Emploia, ${firstNameRaw} ! 🎉`,
            html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div></div><div style="padding:32px"><h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">Bienvenue, ${firstName} ! 🎉</h1><p style="color:#475569;line-height:1.6;margin:0 0 20px">Votre compte Emploia est créé via Google. Vous avez <strong style="color:#0f172a">5 générations gratuites</strong> prêtes à l'emploi — votre copilote de candidature IA 100% français.</p><a href="https://emploia.fr/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">✨ Générer mon premier CV →</a></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a></p></div></body></html>`,
          }),
        }).catch(() => {});
      }
    } else {
      const updates = { lastLoginAt: new Date().toISOString() };
      if (!user.googleId) {
        updates.googleId = googleUser.id;
        updates.avatar = googleUser.picture || user.avatar;
      }
      kvSet(`user:${email}`, { ...user, ...updates }).catch(() => {});
    }

    const token = await signToken(user.id);
    const headers = new Headers({ Location: isNewUser ? '/onboarding' : '/dashboard' });
    headers.append('Set-Cookie', setCookieHeader(token));
    headers.append('Set-Cookie', 'emp_oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
    return new Response(null, { status: 302, headers });

  } catch (err) {
    console.error('Google OAuth error:', err);
    return new Response(null, { status: 302, headers: { Location: '/?error=oauth_failed' } });
  }
}
