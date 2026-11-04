-- ============================================================
-- AGRO_CRM_ROLE_PERMISSIONS — per-role access to each CRM section
-- ============================================================
-- Roles are the ones AGRO_USERS.ROLE already allows (admin, manager,
-- operator, viewer — the table is shared with Artgranit, so no new roles).
-- "admin" is a hardcoded superuser and never stored here. Rows only hold
-- what the admin changed in Users > Roles; anything missing falls back to
-- the defaults in lib/permissions.ts, so no seed data is needed.
-- MODULE is free text (one key per sidebar section) so new sections need
-- no migration. Idempotent.

DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_ROLE_PERMISSIONS';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_ROLE_PERMISSIONS (
        ROLE         VARCHAR2(20)  NOT NULL,
        MODULE       VARCHAR2(40)  NOT NULL,
        ACCESS_LEVEL VARCHAR2(10)  NOT NULL,
        UPDATED_BY   VARCHAR2(100),
        UPDATED_AT   DATE DEFAULT SYSDATE,
        CONSTRAINT PK_AGRO_CRM_ROLE_PERMS PRIMARY KEY (ROLE, MODULE),
        CONSTRAINT CK_AGRO_CRM_ROLE_PERMS_ROLE  CHECK (ROLE IN (''manager'',''operator'',''viewer'')),
        CONSTRAINT CK_AGRO_CRM_ROLE_PERMS_LEVEL CHECK (ACCESS_LEVEL IN (''none'',''view'',''edit''))
      )';
  END IF;
END;
/
