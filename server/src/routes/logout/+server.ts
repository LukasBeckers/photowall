import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie, clearAdminCookie } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies, url }) => {
  const which = url.searchParams.get('which');
  if (which === 'admin') {
    clearAdminCookie(cookies);
    throw redirect(303, '/admin/login');
  } else {
    clearSessionCookie(cookies);
    throw redirect(303, '/login');
  }
};
