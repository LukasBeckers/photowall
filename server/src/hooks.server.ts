import type { Handle } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import { readSessionFromCookies, readAdminFromCookies } from '$lib/server/auth';

// Routes that don't require a guest session.
function isPublicRoute(pathname: string, search: string): boolean {
  if (pathname === '/login') return true;
  if (pathname === '/wall') return true;
  if (pathname === '/health') return true;
  if (
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png' ||
    pathname === '/icon.svg' ||
    pathname === '/manifest.webmanifest'
  )
    return true;
  if (pathname.startsWith('/_app/')) return true;
  if (pathname === '/admin/login') return true;
  if (pathname === '/api/upload/sdcard') return true;
  if (pathname === '/api/wall/initial') return true;
  if (pathname === '/api/sse' && new URLSearchParams(search).get('wall') === '1') return true;
  if (
    pathname.startsWith('/api/photos/') &&
    pathname.endsWith('/file') &&
    new URLSearchParams(search).get('wall') === '1'
  )
    return true;
  return false;
}

function isAdminPage(pathname: string): boolean {
  if (pathname === '/admin/login') return false;
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isAdminApi(pathname: string): boolean {
  return pathname.startsWith('/api/admin/');
}

export const handle: Handle = async ({ event, resolve }) => {
  const session = await readSessionFromCookies(event.cookies);
  if (session) event.locals.session = session;
  event.locals.admin = readAdminFromCookies(event.cookies);

  const { pathname, search } = event.url;

  if (isAdminPage(pathname)) {
    if (!event.locals.admin) {
      throw redirect(302, `/admin/login?next=${encodeURIComponent(pathname + search)}`);
    }
  } else if (isAdminApi(pathname)) {
    if (!event.locals.admin) throw error(403, 'Admin only');
  } else if (!isPublicRoute(pathname, search) && !event.locals.session) {
    throw redirect(302, `/login?next=${encodeURIComponent(pathname + search)}`);
  }

  return resolve(event);
};
