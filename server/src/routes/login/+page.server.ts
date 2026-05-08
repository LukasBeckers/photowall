import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  checkPartyPassword,
  createSession,
  setSessionCookie
} from '$lib/server/auth';
import { verifyToken } from '$lib/server/token';
import { randomDisplayName } from '$lib/server/names';

export const load: PageServerLoad = ({ locals, url }) => {
  // If already logged in, bounce.
  if (locals.session) {
    const next = url.searchParams.get('next') ?? '/';
    throw redirect(302, safeNext(next));
  }
  const t = url.searchParams.get('t') ?? '';
  const tokenValid = t ? verifyToken(t) !== null : false;
  return { hasToken: tokenValid, next: url.searchParams.get('next') ?? '/' };
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    const displayName = String(data.get('display_name') ?? '').trim();
    const tokenInput = String(data.get('t') ?? url.searchParams.get('t') ?? '');
    const next = String(data.get('next') ?? url.searchParams.get('next') ?? '/');

    const hasValidToken = tokenInput && verifyToken(tokenInput) !== null;

    if (!hasValidToken && !checkPartyPassword(password)) {
      return fail(401, { error: 'Wrong password.', displayName, hasToken: false });
    }

    if (displayName.length > 40) {
      return fail(400, {
        error: 'Name too long (max 40 characters).',
        displayName,
        hasToken: hasValidToken
      });
    }
    // Some phones don't pop the keyboard for the name field; let blank
    // submissions through with a fun auto-generated name.
    const finalName = displayName.length === 0 ? randomDisplayName() : displayName;

    const { id } = await createSession(finalName);
    setSessionCookie(cookies, id, finalName);

    throw redirect(303, safeNext(next));
  }
};

function safeNext(n: string): string {
  // Prevent open-redirect — only allow same-site relative paths.
  if (!n.startsWith('/') || n.startsWith('//')) return '/';
  return n;
}
