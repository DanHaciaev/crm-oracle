import oracledb from "oracledb";
import path from "path";

const dbConfig = {
  user:           process.env.DB_USER!,
  password:       process.env.DB_PASSWORD!,
  connectString:  process.env.CONNECT_STRING!,
  walletLocation: path.resolve(process.cwd(), process.env.WALLET_DIR!),
  walletPassword: process.env.WALLET_PASSWORD!,
};

export async function getConnection(): Promise<oracledb.Connection> {
  return await oracledb.getConnection(dbConfig);
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  binds: oracledb.BindParameters = []
): Promise<T[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<T>(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return (result.rows ?? []) as T[];
  } finally {
    await conn.close();
  }
}
export async function execute(
  sql: string,
  binds: oracledb.BindParameters = []
): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(sql, binds, { autoCommit: true });
  } finally {
    await conn.close();
  }
}