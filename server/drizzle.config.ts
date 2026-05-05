import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/server/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://photowall:photowall@localhost:5432/photowall'
  }
} satisfies Config;
