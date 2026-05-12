// Usage: node scripts/run-sql.mjs sql/51_agro_users.sql
//
// Reads a .sql file, splits on lines that contain only `/` (PL/SQL terminator),
// and executes each chunk against the Oracle DB the app uses
// (DB_USER / DB_PASSWORD / CONNECT_STRING / ORACLE_CLIENT_DIR from .env).
// Uses Thick mode (Instant Client) — required for Oracle 11g.

import fs       from "node:fs";
import path     from "node:path";
import process  from "node:process";
import oracledb from "oracledb";

// --- load .env (no dotenv dep — small parser) ------------------------------
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] !== undefined) continue;
    const val = rawVal.replace(/^["']|["']$/g, "");
    process.env[key] = val;
  }
}

// --- args ------------------------------------------------------------------
const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run-sql.mjs <path-to-sql-file>");
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), file);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// --- split SQL by `/` terminator lines -------------------------------------
function splitStatements(sql) {
  const lines  = sql.split(/\r?\n/);
  const chunks = [];
  let buf      = [];
  for (const line of lines) {
    if (line.trim() === "/") {
      const text = buf.join("\n").trim();
      if (text) chunks.push(text);
      buf = [];
    } else {
      buf.push(line);
    }
  }
  const tail = buf.join("\n").trim();
  if (tail) chunks.push(tail);
  return chunks
    .filter((c) => c.split("\n").some((l) => l.trim() && !l.trim().startsWith("--")))
    .map(prepareStatement);
}

function prepareStatement(chunk) {
  const upper   = chunk.toUpperCase();
  const isPlsql =
    /^\s*(DECLARE|BEGIN)\b/m.test(upper) ||
    /^\s*CREATE\s+(OR\s+REPLACE\s+)?(TRIGGER|PROCEDURE|FUNCTION|PACKAGE|TYPE\s+BODY)\b/m.test(upper);
  if (isPlsql) return chunk;
  return chunk.replace(/;\s*$/, "");
}

// --- init Thick mode -------------------------------------------------------
const libDir = process.env.ORACLE_CLIENT_DIR;
oracledb.initOracleClient(libDir ? { libDir } : undefined);

// --- run -------------------------------------------------------------------
const dbConfig = {
  user:          process.env.DB_USER,
  password:      process.env.DB_PASSWORD,
  connectString: process.env.CONNECT_STRING,
};

const sql        = fs.readFileSync(filePath, "utf8");
const statements = splitStatements(sql);

console.log(`File: ${path.relative(process.cwd(), filePath)}`);
console.log(`Statements: ${statements.length}\n`);

const conn = await oracledb.getConnection(dbConfig);
try {
  let i = 0;
  for (const stmt of statements) {
    i += 1;
    const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
    process.stdout.write(`[${i}/${statements.length}] ${preview}${stmt.length > 80 ? "..." : ""}\n`);
    try {
      await conn.execute(stmt, [], { autoCommit: false });
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      await conn.rollback();
      process.exit(1);
    }
  }
  await conn.commit();
  console.log(`\n✓ Done. Committed ${statements.length} statements.`);
} finally {
  await conn.close();
}
