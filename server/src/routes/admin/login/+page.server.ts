import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { checkAdminPassword, setAdminCookie } from '$lib/server/auth';

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.admin) {
    const next = url.searchParams.get('next') ?? '/admin';
    throw redirect(302, safeNext(next, '/admin'));
  }
  return { next: url.searchParams.get('next') ?? '/admin' };
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    const next = String(data.get('next') ?? url.searchParams.get('next') ?? '/admin');

    if (!checkAdminPassword(password)) {
      return fail(401, { error: 'Wrong admin password.' });
    }

    setAdminCookie(cookies);
    throw redirect(303, safeNext(next, '/admin'));
  }
};

function safeNext(n: string, fallback: string): string {
  if (!n.startsWith('/') || n.startsWith('//')) return fallback;
  return n;
}
