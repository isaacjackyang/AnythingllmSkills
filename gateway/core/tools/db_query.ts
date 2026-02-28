const READ_ONLY_SQL = /^\s*select\s+/i;

export interface DbQueryInput {
  sql: string;
}

export async function runDbQuery(_input: DbQueryInput): Promise<never> {
  throw new Error("db_query tool is not yet implemented. Configure a database connection to enable this tool.");
}
