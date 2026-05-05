import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    csrf: {
      // Some mobile browsers don't send the Origin header on form POSTs,
      // which made SvelteKit's strict same-origin check reject phone logins
      // with a silent 403. We keep CSRF protection via SameSite=Lax cookies
      // (set in lib/server/auth.ts) — same-site cookies aren't attached to
      // cross-site form POSTs in any modern browser.
      checkOrigin: false
    }
  }
};

export default config;
