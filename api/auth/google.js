export const config = { runtime: 'edge' };

export default async function handler(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response(null, { status: 302, headers: { Location: '/?error=google_not_configured' } });
  }

  const state = crypto.randomUUID();
  const baseUrl = new URL(req.url).origin;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  const headers = new Headers({ Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  headers.append('Set-Cookie', `emp_oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`);
  return new Response(null, { status: 302, headers });
}
