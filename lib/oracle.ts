import oracledb from "oracledb";

// Oracle 11g requires Thick mode via Instant Client.
// initOracleClient must be called exactly once per Node process.
// In Next.js dev, modules can re-execute on HMR — guard via globalThis.
declare global {
  var _oracledbInited: boolean | undefined;
}
if (!globalThis._oracledbInited) {
  const libDir = process.env.ORACLE_CLIENT_DIR;
  oracledb.initOracleClient(libDir ? { libDir } : undefined);
  globalThis._oracledbInited = true;
}

const dbConfig = {
  user:          process.env.DB_USER!,
  password:      process.env.DB_PASSWORD!,
  connectString: process.env.CONNECT_STRING!,
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
