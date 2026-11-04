-- ============================================================
-- AGRO_CRM_COMPANY_LOGO — company logo printed on documents
-- ============================================================
-- Text requisites (name, address, IDNO, IBAN…) live in AGRO_MODULE_CONFIG
-- under COMPANY_* keys (COMPANY_NAME is shared with DIPP FRUICT); the logo
-- doesn't fit CONFIG_VALUE (VARCHAR2(1000)) and S3 isn't configured, so it
-- is a single-row BLOB table. Idempotent.

DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_COMPANY_LOGO';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_COMPANY_LOGO (
        ID          NUMBER        DEFAULT 1 NOT NULL,
        MIME_TYPE   VARCHAR2(50)  NOT NULL,
        DATA        BLOB          NOT NULL,
        UPDATED_BY  VARCHAR2(100),
        UPDATED_AT  DATE DEFAULT SYSDATE,
        CONSTRAINT PK_AGRO_CRM_COMPANY_LOGO PRIMARY KEY (ID),
        CONSTRAINT CK_AGRO_CRM_COMPANY_LOGO_ONE CHECK (ID = 1)
      )';
  END IF;
END;
/
