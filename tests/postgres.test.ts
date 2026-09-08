import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './database';
import { connectionOptions } from '../db/postgres';
import { applyMigrations } from '../scripts/migrations';
import type { Row } from '../db/database';
import { SUPABASE_ROOT_CA } from '../db/supabase-ca';
import { X509Certificate } from 'node:crypto';

test('Supabase pooler connections disable prepared statements and verify remote TLS certificates', () => {
  const { url, options } = connectionOptions(
    'postgresql://app:password@region.pooler.supabase.com:6543/postgres?sslmode=disable',
  );
  assert.equal(new URL(url).searchParams.has('sslmode'), false);
  assert.equal(options.prepare, false);
  assert.ok(options.ssl && options.ssl.rejectUnauthorized);
  assert.ok(
    Array.isArray(options.ssl.ca) && options.ssl.ca.includes(SUPABASE_ROOT_CA),
  );
  const cert = new X509Certificate(SUPABASE_ROOT_CA);
  assert.equal(cert.ca, true);
  assert.equal(cert.verify(cert.publicKey), true);
  assert.ok(Date.parse(cert.validTo) > Date.now());
  assert.deepEqual(
    connectionOptions('postgres://app:password@other.example.com:5432/postgres')
      .options.ssl,
    { rejectUnauthorized: true },
  );
  assert.deepEqual(
    connectionOptions(
      'postgres://app:password@region.pooler.supabase.com.evil.test:5432/postgres',
    ).options.ssl,
    { rejectUnauthorized: true },
  );
  assert.deepEqual(
    connectionOptions(
      'postgres://app:password@region.pooler.supabase.com:6543/postgres',
      'custom\\ncertificate',
    ).options.ssl,
    { rejectUnauthorized: true, ca: 'custom\ncertificate' },
  );
  assert.equal(
    connectionOptions('postgres://app:password@localhost:5432/postgres').options
      .ssl,
    false,
  );
  assert.throws(() => connectionOptions('https://example.com'));
});

test('Supabase API roles cannot access any private table; application role cannot delete reports or change schema', async () => {
  const { sql } = await database();
  try {
    await assert.rejects(
      () => sql.query('DELETE FROM weekly_report.reports'),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        sql.query('ALTER TABLE weekly_report.reports ADD COLUMN attack text'),
      /must be owner/,
    );
    await sql.query(
      "INSERT INTO weekly_report.users (id,email,name,created_at) VALUES ('rls-user','private@gmail.com','Private',now())",
    );
    await sql.query(
      "INSERT INTO weekly_report.reports (id,author_id,week_start,completed,status,created_at,updated_at,submitted_at) VALUES ('rls-report','rls-user','2026-09-07','private report','submitted',now(),now(),now())",
    );
    assert.equal(
      (await sql.query('SELECT * FROM weekly_report.reports')).rows.length,
      1,
    );
    await sql.exec('RESET ROLE');
    const security = await sql.query<{ relrowsecurity: boolean }>(
      `SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='weekly_report' AND c.relkind='r'`,
    );
    assert.equal(security.rows.length, 5);
    assert.ok(security.rows.every((row) => row.relrowsecurity));
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await sql.exec(`SET ROLE ${role}`);
      for (const table of [
        'users',
        'members',
        'sessions',
        'login_challenges',
        'reports',
      ])
        await assert.rejects(
          () => sql.query(`SELECT * FROM weekly_report.${table}`),
          /permission denied/,
        );
      await sql.exec('RESET ROLE');
    }
    // Even an accidental schema/table grant leaves RLS closed for public users.
    await sql.exec(
      'GRANT USAGE ON SCHEMA weekly_report TO anon; GRANT SELECT ON weekly_report.reports TO anon; SET ROLE anon',
    );
    assert.deepEqual(
      (await sql.query('SELECT * FROM weekly_report.reports')).rows,
      [],
    );
  } finally {
    await sql.close();
  }
});

test('PostgreSQL batch rolls back all statements when one fails', async () => {
  const { db, sql } = await database();
  try {
    await assert.rejects(() =>
      db.batch([
        db
          .prepare(
            'INSERT INTO weekly_report.users (id,email,name,created_at) VALUES ($1,$2,$3,$4)',
          )
          .bind(
            'rollback-user',
            'a@gmail.com',
            'Alice',
            new Date().toISOString(),
          ),
        db
          .prepare(
            'INSERT INTO weekly_report.members (id,email,role,created_at) VALUES ($1,$2,$3,$4)',
          )
          .bind(
            'rollback-member',
            'a@gmail.com',
            'invalid-role',
            new Date().toISOString(),
          ),
      ]),
    );
    assert.equal(
      await db
        .prepare('SELECT id FROM weekly_report.users WHERE id=$1')
        .bind('rollback-user')
        .first(),
      null,
    );
  } finally {
    await sql.close();
  }
});

test('migration runner is repeatable and rejects edited migration history', async () => {
  const { sql } = await database();
  try {
    await sql.exec('RESET ROLE');
    const rerun = () =>
      sql.transaction((transaction) =>
        applyMigrations({
          query: async (query, values) =>
            (await transaction.query<Row>(query, values)).rows,
          exec: async (script) => {
            await transaction.exec(script);
          },
        }),
      );
    assert.deepEqual(await rerun(), []);
    await sql.query(
      "UPDATE weekly_report_migrations.applied SET checksum='changed'",
    );
    await assert.rejects(rerun, /Applied migration changed/);
  } finally {
    await sql.close();
  }
});
