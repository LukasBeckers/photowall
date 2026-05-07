// Wraps fetch with credentials: 'same-origin'. Modern browsers default to
// this anyway, but older Chromium (notably some smart-TV WebViews — e.g.
// Philips/Android-TV models) default to 'omit', stripping the session
// cookie and breaking auth-gated APIs. Use this for every client-side
// API call so the wall + gallery work everywhere.
export function api(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { credentials: 'same-origin', ...init });
}
