#!/usr/bin/env node
// Simple file-based migration runner. Applies any SQL file in ./migrations
// not already in the schema_migrations table, in lexical order.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

const sql = postgres(url, { max: 1 });

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz DEFAULT now() NOT NULL
  )
`;

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const appliedRows = await sql`SELECT name FROM schema_migrations`;
const applied = new Set(appliedRows.map((r) => r.name));

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip  ${file}`);
    continue;
  }
  const body = readFileSync(join(migrationsDir, file), 'utf8');
  console.log(`apply ${file}`);
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
  });
}

await sql.end();
console.log('migrations done');
