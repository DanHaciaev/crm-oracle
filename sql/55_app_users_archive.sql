-- ============================================================
-- 55_AGRO_CRM_APP_USERS_archive.sql
-- Soft-delete для AGRO_CRM_APP_USERS:
--   - ARCHIVED флаг (Y/N), по умолчанию N
--   - расширение CRM_APP_USER_EVENTS check-constraint для новых
--     типов событий 'archived'/'unarchived'.
-- ============================================================

ALTER TABLE AGRO_CRM_APP_USERS ADD (
  ARCHIVED CHAR(1) DEFAULT 'N' NOT NULL
);
/

ALTER TABLE AGRO_CRM_APP_USERS ADD CONSTRAINT CK_AGRO_CRM_APP_USERS_ARCHIVED CHECK (ARCHIVED IN ('Y','N'));
/

ALTER TABLE CRM_APP_USER_EVENTS DROP CONSTRAINT CK_CRM_AUE_TYPE;
/

ALTER TABLE CRM_APP_USER_EVENTS ADD CONSTRAINT CK_CRM_AUE_TYPE CHECK (EVENT_TYPE IN (
  'start','start_with_token','linked','unlinked','blocked','unblocked',
  'message_in','archived','unarchived'
));
/

COMMIT;
/
