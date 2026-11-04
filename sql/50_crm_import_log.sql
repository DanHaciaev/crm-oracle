-- ============================================================
-- Excel / CSV import journal (CRM-only)
-- ============================================================
-- One row per committed import. CREATED_IDS keeps the IDs of the rows the
-- import inserted (JSON array) so a payments import can be undone — the
-- payments are cancelled, never deleted. Oracle 11g: sequence + trigger.
-- Idempotent.

DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_IMPORT_LOG';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_IMPORT_LOG (
        ID             NUMBER         NOT NULL,
        ENTITY_TYPE    VARCHAR2(20)   NOT NULL,
        FILENAME       VARCHAR2(255),
        TOTAL_ROWS     NUMBER         DEFAULT 0 NOT NULL,
        CREATED_COUNT  NUMBER         DEFAULT 0 NOT NULL,
        SKIPPED_COUNT  NUMBER         DEFAULT 0 NOT NULL,
        ERROR_COUNT    NUMBER         DEFAULT 0 NOT NULL,
        CREATED_IDS    CLOB,
        CREATED_BY     VARCHAR2(100),
        CREATED_AT     DATE DEFAULT SYSDATE NOT NULL,
        UNDONE_BY      VARCHAR2(100),
        UNDONE_AT      DATE,
        CONSTRAINT PK_AGRO_CRM_IMPORT_LOG PRIMARY KEY (ID),
        CONSTRAINT CK_AGRO_CRM_IMPORT_ENTITY CHECK (ENTITY_TYPE IN (''customers'',''leads'',''payments''))
      )';
  END IF;
  SELECT COUNT(*) INTO v FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'AGRO_CRM_IMPORT_LOG_SEQ';
  IF v = 0 THEN
    EXECUTE IMMEDIATE 'CREATE SEQUENCE AGRO_CRM_IMPORT_LOG_SEQ START WITH 1 INCREMENT BY 1 NOCACHE';
  END IF;
END;
/

CREATE OR REPLACE TRIGGER AGRO_CRM_IMPORT_LOG_BI
BEFORE INSERT ON AGRO_CRM_IMPORT_LOG FOR EACH ROW
BEGIN
  IF :NEW.ID IS NULL THEN
    SELECT AGRO_CRM_IMPORT_LOG_SEQ.NEXTVAL INTO :NEW.ID FROM DUAL;
  END IF;
END;
/
