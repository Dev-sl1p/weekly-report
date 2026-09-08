export type Row = Record<string, unknown>;
export type QueryRunner = (query: string, values: unknown[]) => Promise<Row[]>;
export type TransactionRunner = <T>(
  work: (query: QueryRunner) => Promise<T>,
) => Promise<T>;

// SQL text is application-owned. Values always travel separately to PostgreSQL.
// The small adapter keeps the same service usable with Postgres.js and PGlite.
export class Statement {
  constructor(
    private execute: QueryRunner,
    readonly query: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new Statement(this.execute, this.query, values);
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = await this.execute(this.query, this.values);
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: (await this.execute(this.query, this.values)) as T[] };
  }

  async run() {
    await this.execute(this.query, this.values);
  }
}

export class Database {
  constructor(
    private execute: QueryRunner,
    private transaction: TransactionRunner,
  ) {}

  prepare(query: string) {
    return new Statement(this.execute, query);
  }

  async batch(statements: Statement[]) {
    return this.transaction(async (execute) => {
      for (const statement of statements) {
        await execute(statement.query, statement.values);
      }
    });
  }
}
