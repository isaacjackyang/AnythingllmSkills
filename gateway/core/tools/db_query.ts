const READ_ONLY_SQL = /^\s*select\s+/i;

export interface DbQueryInput {
  sql: string;
}

export async function runDbQuery(input: DbQueryInput): Promise<{ rows: unknown[] }> {
  if (!READ_ONLY_SQL.test(input.sql)) {
    throw new Error("only read-only SELECT queries are permitted");
  }

  return { rows: [] };
}
