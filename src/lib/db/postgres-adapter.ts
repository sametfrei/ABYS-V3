import type { PGlite, Results, Transaction } from "@electric-sql/pglite";
import type { Pool as PgPool, PoolClient, QueryResult } from "pg";

interface PgQueryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T> | QueryResult<T>[]>;
}

function normalizeResult<T>(result: QueryResult): Results<T> {
  return {
    rows: result.rows as T[],
    affectedRows: result.rowCount ?? 0,
    fields: result.fields as unknown as Results<T>["fields"],
  };
}

function connectionFor(queryable: PgQueryable): Transaction {
  return {
    query: async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      const result = await queryable.query<T>(sql, params);
      if (Array.isArray(result)) return result.map((item) => normalizeResult<T>(item)) as unknown as Results<T>;
      return normalizeResult<T>(result);
    },
    exec: async (sql: string) => {
      const result = await queryable.query(sql);
      return (Array.isArray(result) ? result : [result]).map((item) => normalizeResult(item));
    },
  } as unknown as Transaction;
}

/** PostgreSQL Pool adapter preserving the PGlite query/transaction surface used by repositories. */
export class PostgresDatabaseAdapter {
  private readonly connection: Transaction;

  constructor(private readonly pool: PgPool) {
    this.connection = connectionFor(pool);
  }

  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Results<T>> {
    return this.connection.query<T>(sql, params);
  }

  exec(sql: string): Promise<Results[]> {
    return this.connection.exec(sql);
  }

  async transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect() as PoolClient;
    try {
      await client.query("BEGIN");
      const result = await callback(connectionFor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async withMigrationLock<T>(callback: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect() as PoolClient;
    try {
      await client.query("SELECT pg_advisory_lock(194827361, 42)");
      return await callback();
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock(194827361, 42)");
      } finally {
        client.release();
      }
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export type CompatibleDatabase = PGlite | PostgresDatabaseAdapter;
