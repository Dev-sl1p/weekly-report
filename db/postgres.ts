import postgres from 'postgres';
import { Database, type QueryRunner, type Row } from './database';

export function connectionOptions(databaseUrl: string, ca?: string) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // URL parser errors can contain the password. Never propagate raw input.
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username
  )
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Reject URL options that could override certificate verification.
  for (const option of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert'])
    url.searchParams.delete(option);
  return {
    url: url.toString(),
    options: {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 5,
      ssl: local
        ? false
        : {
            rejectUnauthorized: true,
            ...(ca ? { ca: ca.replace(/\\n/g, '\n') } : {}),
          },
      connection: {
        application_name: 'weekly-report',
        statement_timeout: 15000,
      },
    } satisfies postgres.Options<Record<string, postgres.PostgresType>>,
  };
}

export function connectDatabase(databaseUrl: string, ca?: string) {
  const { url, options } = connectionOptions(databaseUrl, ca);
  const sql = postgres(url, options);
  const queryFor =
    (connection: postgres.Sql | postgres.TransactionSql): QueryRunner =>
    async (query, values) => {
      const rows = await connection.unsafe<Row[]>(
        query,
        values as postgres.ParameterOrJSON<never>[],
      );
      return Array.from(rows);
    };
  const db = new Database(
    queryFor(sql),
    async (work) =>
      // begin() pins every statement to the same transaction-pooler connection.
      await sql
        .begin(async (transaction) => ({
          value: await work(queryFor(transaction)),
        }))
        .then((result) => result.value),
  );
  return { db, sql };
}
