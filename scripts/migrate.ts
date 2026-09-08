import { connectDatabase } from '../db/postgres';
import { applyMigrations } from './migrations';
import type postgres from 'postgres';

const url = process.env.DIRECT_URL?.trim();
if (!url) {
  console.error(
    'Set DIRECT_URL to the Supabase direct connection or session pooler URL before running migrations.',
  );
  process.exitCode = 1;
} else {
  let sql: postgres.Sql | undefined;
  try {
    if (new URL(url).port === '6543') {
      console.error(
        'Use the direct connection or session pooler (port 5432) for DIRECT_URL.',
      );
      process.exitCode = 1;
    } else {
      sql = connectDatabase(url, process.env.DATABASE_CA_CERT).sql;
      const applied = await sql.begin(async (transaction) =>
        applyMigrations({
          query: async (query, values) =>
            Array.from(
              await transaction.unsafe(
                query,
                values as postgres.ParameterOrJSON<never>[],
              ),
            ),
          exec: async (script) => {
            await transaction.unsafe(script).simple();
          },
        }),
      );
      console.log(
        applied.length
          ? 'Applied: ' + applied.join(', ')
          : 'Database migrations are up to date.',
      );
    }
  } catch (error) {
    // Do not print the connection URL or database query parameters.
    console.error(
      'Migration failed. Check the database connection, certificate and migration permissions.',
      error instanceof Error && 'code' in error ? String(error.code) : '',
    );
    process.exitCode = 1;
  } finally {
    await sql?.end({ timeout: 5 });
  }
}
