-- ============================================================
-- 44_staff_channels_table.sql  — Dynamic channel registry
-- DB: Oracle 11g (una.md:4024/cloudbd.world, user: dippfruct)
--
-- Replaces the hardcoded channel list ('general','sales','ops')
-- with a DB table so admins can create new channels from the UI.
-- ============================================================

-- ── Sequence for auto room IDs ────────────────────────────────
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'AGRO_STAFF_CH_SEQ';
  IF v = 0 THEN
    EXECUTE IMMEDIATE 'CREATE SEQUENCE AGRO_STAFF_CH_SEQ START WITH 10 INCREMENT BY 1 NOCACHE';
  END IF;
END;
/

-- ── Channels table ────────────────────────────────────────────
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_STAFF_CHANNELS';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_STAFF_CHANNELS (
        ROOM        VARCHAR2(100)  NOT NULL,
        LABEL       VARCHAR2(100)  NOT NULL,
        CREATED_BY  NUMBER,
        CREATED_AT  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        ACTIVE      CHAR(1)   DEFAULT ''Y'' NOT NULL,
        CONSTRAINT PK_STAFF_CHANNELS PRIMARY KEY (ROOM),
        CONSTRAINT CK_STAFF_CH_ACTIVE CHECK (ACTIVE IN (''Y'',''N''))
      )';
  END IF;
END;
/

-- ── Seed: migrate 3 hardcoded channels ───────────────────────
BEGIN
  BEGIN
    INSERT INTO AGRO_CRM_STAFF_CHANNELS (room, label) VALUES ('general', 'Общий');
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
  END;
  BEGIN
    INSERT INTO AGRO_CRM_STAFF_CHANNELS (room, label) VALUES ('sales', 'Продажи');
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
  END;
  BEGIN
    INSERT INTO AGRO_CRM_STAFF_CHANNELS (room, label) VALUES ('ops', 'Операции');
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
  END;
  COMMIT;
END;
/
