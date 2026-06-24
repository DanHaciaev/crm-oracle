import oracledb from "oracledb";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

const libDir = process.env.ORACLE_CLIENT_DIR;
if (libDir) oracledb.initOracleClient({ libDir });

const conn = await oracledb.getConnection({
  user:          process.env.DB_USER,
  password:      process.env.DB_PASSWORD,
  connectString: process.env.CONNECT_STRING,
});

async function run(sql, label) {
  try {
    await conn.execute(sql);
    await conn.commit();
    console.log(`✓ ${label}`);
  } catch (err) {
    if (err.errorNum === 955 || err.errorNum === 2955) {
      console.log(`— ${label} (уже существует, пропускаем)`);
    } else {
      throw err;
    }
  }
}

try {
  await run(
    `CREATE TABLE AGRO_CRM_NPS (
      ID          NUMBER PRIMARY KEY,
      CUSTOMER_ID NUMBER NOT NULL,
      SCORE       NUMBER(2) NOT NULL,
      NOTES       VARCHAR2(1000),
      CREATED_BY  VARCHAR2(200),
      CREATED_AT  TIMESTAMP DEFAULT SYSTIMESTAMP
    )`,
    "Таблица AGRO_CRM_NPS"
  );

  await run(
    `CREATE SEQUENCE AGRO_CRM_NPS_SEQ START WITH 1 INCREMENT BY 1 NOCACHE`,
    "Sequence AGRO_CRM_NPS_SEQ"
  );

  await run(
    `CREATE OR REPLACE TRIGGER AGRO_CRM_NPS_BIR
     BEFORE INSERT ON AGRO_CRM_NPS
     FOR EACH ROW
     BEGIN
       IF :NEW.ID IS NULL THEN
         SELECT AGRO_CRM_NPS_SEQ.NEXTVAL INTO :NEW.ID FROM DUAL;
       END IF;
     END;`,
    "Trigger AGRO_CRM_NPS_BIR"
  );

  console.log("\n✓ Готово — NPS таблица создана");
} catch (err) {
  console.error("✗ Ошибка:", err.message);
  process.exit(1);
} finally {
  await conn.close();
}
