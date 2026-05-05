import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function init() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _client = postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10 });
  _db = drizzle(_client, { schema });
}

// Lazy proxy: connect on first use, not at module-eval time. This matters because
// SvelteKit's build-time route analysis imports server modules.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    if (!_db) init();
    return Reflect.get(_db as object, prop);
  }
});

export { schema };
