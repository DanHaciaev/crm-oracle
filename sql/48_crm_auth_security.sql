-- ============================================================
-- CRM sign-in security: login history + two-factor auth (TOTP)
-- ============================================================
-- Both are CRM-only (Artgranit has its own login and doesn't read them),
-- so they live in their own tables instead of new AGRO_USERS columns.
-- Idempotent.

-- Every CRM sign-in attempt, successful or not. Also drives the brute-force
-- lock (too many recent failures for one username).
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_LOGIN_LOG';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_LOGIN_LOG (
        ID          NUMBER         NOT NULL,
        USER_ID     NUMBER,
        USERNAME    VARCHAR2(100),
        SUCCESS     CHAR(1)        NOT NULL,
        REASON      VARCHAR2(50),
        IP          VARCHAR2(64),
        USER_AGENT  VARCHAR2(400),
        CREATED_AT  DATE DEFAULT SYSDATE NOT NULL,
        CONSTRAINT PK_AGRO_CRM_LOGIN_LOG PRIMARY KEY (ID),
        CONSTRAINT CK_AGRO_CRM_LOGIN_LOG_OK CHECK (SUCCESS IN (''Y'',''N''))
      )';
    EXECUTE IMMEDIATE 'CREATE INDEX IX_AGRO_CRM_LOGIN_LOG_USER ON AGRO_CRM_LOGIN_LOG (USERNAME, CREATED_AT)';
  END IF;
  -- Oracle 11g: no IDENTITY columns — sequence + trigger like the other AGRO tables.
  SELECT COUNT(*) INTO v FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'AGRO_CRM_LOGIN_LOG_SEQ';
  IF v = 0 THEN
    EXECUTE IMMEDIATE 'CREATE SEQUENCE AGRO_CRM_LOGIN_LOG_SEQ START WITH 1 INCREMENT BY 1 NOCACHE';
  END IF;
END;
/

CREATE OR REPLACE TRIGGER AGRO_CRM_LOGIN_LOG_BI
BEFORE INSERT ON AGRO_CRM_LOGIN_LOG FOR EACH ROW
BEGIN
  IF :NEW.ID IS NULL THEN
    SELECT AGRO_CRM_LOGIN_LOG_SEQ.NEXTVAL INTO :NEW.ID FROM DUAL;
  END IF;
END;
/

-- TOTP seed per user, AES-256-GCM encrypted (lib/crypto.ts). PENDING_* holds
-- a seed during setup until the user confirms it with a valid code.
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_USER_2FA';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_USER_2FA (
        USER_ID             NUMBER        NOT NULL,
        SECRET_ENC          VARCHAR2(400),
        PENDING_SECRET_ENC  VARCHAR2(400),
        ENABLED             CHAR(1) DEFAULT ''N'' NOT NULL,
        UPDATED_AT          DATE DEFAULT SYSDATE,
        CONSTRAINT PK_AGRO_CRM_USER_2FA PRIMARY KEY (USER_ID),
        CONSTRAINT CK_AGRO_CRM_USER_2FA_EN CHECK (ENABLED IN (''Y'',''N''))
      )';
  END IF;
END;
/
