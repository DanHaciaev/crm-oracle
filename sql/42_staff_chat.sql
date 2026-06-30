-- ============================================================
-- 42_staff_chat.sql  — Internal staff chat tables
-- DB: Oracle 11g (una.md:4024/cloudbd.world, user: dippfruct)
--
-- Tables:
--   AGRO_CRM_STAFF_MESSAGES  — messages in channels / DMs
--   AGRO_CRM_STAFF_READS     — last-read timestamps per user per room
--
-- Room naming convention:
--   Channels : 'general'  |  'sales'  |  'ops'
--   DMs      : 'dm:X:Y'  where X < Y  (both are AGRO_USERS.ID values)
-- ============================================================

-- ── Sequence for AGRO_CRM_STAFF_MESSAGES ─────────────────────
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'AGRO_STAFF_MSG_SEQ';
  IF v = 0 THEN
    EXECUTE IMMEDIATE 'CREATE SEQUENCE AGRO_STAFF_MSG_SEQ START WITH 1 INCREMENT BY 1 NOCACHE';
  END IF;
END;
/

-- ── Messages table ────────────────────────────────────────────
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_STAFF_MESSAGES';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_STAFF_MESSAGES (
        ID         NUMBER        NOT NULL,
        SENDER_ID  NUMBER        NOT NULL,
        ROOM       VARCHAR2(100) NOT NULL,
        BODY       CLOB          NOT NULL,
        CREATED_AT TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT PK_STAFF_MSG PRIMARY KEY (ID)
      )';
  END IF;
END;
/

-- Note: No trigger. INSERT uses AGRO_STAFF_MSG_SEQ.NEXTVAL explicitly.
-- EXECUTE IMMEDIATE with :NEW in trigger body causes ORA-04098 in Oracle 11g.
-- Run 42_staff_chat_fix.sql on the DB to drop the invalid trigger if it exists.

-- ── Index: fast room lookups ──────────────────────────────────
BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX IDX_STAFF_MSG_ROOM ON AGRO_CRM_STAFF_MESSAGES(ROOM, CREATED_AT)';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- ── Last-read tracking (for unread badge counts) ──────────────
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_STAFF_READS';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_STAFF_READS (
        USER_ID      NUMBER        NOT NULL,
        ROOM         VARCHAR2(100) NOT NULL,
        LAST_READ_AT TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT PK_STAFF_READS PRIMARY KEY (USER_ID, ROOM)
      )';
  END IF;
END;
/
