import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QueryRunner } from '../db/database';

export type MigrationConnection = {
  query: QueryRunner;
  exec: (script: string) => Promise<void>;
};

export async function applyMigrations(connection: MigrationConnection) {
  // The caller holds a transaction; concurrent deploys cannot apply twice.
  await connection.query('SELECT pg_advisory_xact_lock($1)', [742531909]);
  await connection.exec(`
    CREATE SCHEMA IF NOT EXISTS weekly_report_migrations;
    REVOKE ALL ON SCHEMA weekly_report_migrations FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS weekly_report_migrations.applied (
      name text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    REVOKE ALL ON weekly_report_migrations.applied FROM PUBLIC;
  `);
  const directory = resolve('supabase/migrations');
  const files = (await readdir(directory))
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort();
  const applied: string[] = [];
  for (const name of files) {
    const content = await readFile(resolve(directory, name), 'utf8');
    // Git may change CRLF on Windows; that does not change the migration.
    const normalized = content.replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(normalized).digest('hex');
    const [existing] = await connection.query(
      'SELECT checksum FROM weekly_report_migrations.applied WHERE name=$1',
      [name],
    );
    if (existing) {
      if (existing.checksum !== checksum)
        throw new Error('Applied migration changed: ' + name);
      continue;
    }
    await connection.exec(content);
    await connection.query(
      'INSERT INTO weekly_report_migrations.applied (name,checksum) VALUES ($1,$2)',
      [name, checksum],
    );
    applied.push(name);
  }
  return applied;
}
