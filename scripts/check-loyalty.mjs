// node scripts/check-loyalty.mjs
import fs from "node:fs";
import path from "node:path";
import oracledb from "oracledb";

const envPath = path.resolve(process.cwd(), ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
  if (!m) continue;
  const [, key, val] = m;
  if (process.env[key] === undefined) process.env[key] = val.replace(/^["']|["']$/g, "");
}

const libDir = process.env.ORACLE_CLIENT_DIR;
oracledb.initOracleClient(libDir ? { libDir } : undefined);

const conn = await oracledb.getConnection({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.CONNECT_STRING,
});

const needed = [
  "AGRO_CRM_LOYALTY_TIERS",
  "AGRO_CRM_LOYALTY_MEMBERS",
  "AGRO_CRM_LOYALTY_TX",
  "AGRO_CRM_EMAILS",
  "AGRO_CRM_PIPELINES",
];

console.log("\nСтатус таблиц:\n");
for (const t of needed) {
  const r = await conn.execute(
    `SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :1`,
    [t], { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const exists = Number(r.rows[0].CNT) > 0;
  console.log(`  ${exists ? "✓" : "✗"} ${t}`);
}

// check PIPELINE_ID column
const col = await conn.execute(
  `SELECT COUNT(*) AS CNT FROM USER_TAB_COLUMNS WHERE TABLE_NAME='AGRO_CRM_LEADS' AND COLUMN_NAME='PIPELINE_ID'`,
  [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
);
const hasCol = Number(col.rows[0].CNT) > 0;
console.log(`  ${hasCol ? "✓" : "✗"} AGRO_CRM_LEADS.PIPELINE_ID (колонка)\n`);

await conn.close();
