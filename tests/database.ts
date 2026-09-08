import { PGlite } from '@electric-sql/pglite';
import { Database, type QueryRunner, type Row } from '../db/database';
import { applyMigrations } from '../scripts/migrations';

export async function database(path?: string, migrate = true) {
  const sql = new PGlite(path);
  await sql.waitReady;
  if (migrate) {
    // These platform roles exist on Supabase. No Supabase service runs in tests.
    await sql.exec(
      'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
    );
    await sql.transaction(async (transaction) =>
      applyMigrations({
        query: async (query, values) =>
          (await transaction.query<Row>(query, values)).rows,
        exec: async (script) => {
          await transaction.exec(script);
        },
      }),
    );
  }
  // Run the real API SQL as the restricted application role, not a superuser.
  await sql.exec('SET ROLE weekly_report_app');
  const execute: QueryRunner = async (query, values) =>
    (await sql.query<Row>(query, values)).rows;
  const db = new Database(execute, async (work) =>
    sql.transaction(async (transaction) =>
      work(
        async (query, values) =>
          (await transaction.query<Row>(query, values)).rows,
      ),
    ),
  );
  return { db, sql };
}
