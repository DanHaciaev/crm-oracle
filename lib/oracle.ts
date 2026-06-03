import oracledb from "oracledb";

declare global {
  var _oracledbInited: boolean | undefined;
  var _oraclePool: oracledb.Pool | undefined;
}

if (!globalThis._oracledbInited) {
  const libDir = process.env.ORACLE_CLIENT_DIR;
  oracledb.initOracleClient(libDir ? { libDir } : undefined);
  // CLOB columns come back as plain strings (no streaming needed for short chat bodies).
  oracledb.fetchAsString = [oracledb.CLOB];
  oracledb.fetchAsBuffer = [oracledb.BLOB];
  globalThis._oracledbInited = true;
}

const dbConfig = {
  user:          process.env.DB_USER!,
  password:      process.env.DB_PASSWORD!,
  connectString: process.env.CONNECT_STRING!,
};

async function getPool(): Promise<oracledb.Pool> {
  if (!globalThis._oraclePool) {
    globalThis._oraclePool = await oracledb.createPool({
      ...dbConfig,
      poolMin:       2,
      poolMax:       10,
      poolIncrement: 1,
      poolTimeout:   60,
    });
  }
  return globalThis._oraclePool;
}

export async function getConnection(): Promise<oracledb.Connection> {
  const pool = await getPool();
  return pool.getConnection();
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

export async function executeReturning<T = number>(
  sql: string,
  binds: oracledb.BindParameters
): Promise<T | undefined> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(sql, binds, { autoCommit: true });
    const out = result.outBinds as Record<string, T[]> | undefined;
    if (!out) return undefined;
    const vals = Object.values(out)[0];
    return vals?.[0];
  } finally {
    await conn.close();
  }
}
