-- ============================================================
-- 43_staff_chat_members.sql  — Channel membership control
-- DB: Oracle 11g (una.md:4024/cloudbd.world, user: dippfruct)
--
-- Table:
--   AGRO_CRM_STAFF_CHANNEL_MEMBERS — who can access which channel
--
-- Seed: on first run adds ALL active users to ALL channels
--       (so existing setup doesn't break)
-- ============================================================

-- ── Membership table ──────────────────────────────────────────
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_STAFF_CHANNEL_MEMBERS';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_STAFF_CHANNEL_MEMBERS (
        CHANNEL   VARCHAR2(50) NOT NULL,
        USER_ID   NUMBER       NOT NULL,
        ADDED_BY  NUMBER,
        ADDED_AT  TIMESTAMP    DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT PK_STAFF_CH_MBR PRIMARY KEY (CHANNEL, USER_ID)
      )';
  END IF;
END;
/

-- ── Seed: add all active users to all 3 channels ─────────────
BEGIN
  FOR u IN (SELECT id FROM AGRO_USERS WHERE active = 'Y') LOOP
    FOR ch IN (
      SELECT 'general' AS c FROM DUAL
      UNION ALL SELECT 'sales' FROM DUAL
      UNION ALL SELECT 'ops'   FROM DUAL
    ) LOOP
      BEGIN
        INSERT INTO AGRO_CRM_STAFF_CHANNEL_MEMBERS (channel, user_id)
        VALUES (ch.c, u.id);
      EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
      END;
    END LOOP;
  END LOOP;
  COMMIT;
END;
/
