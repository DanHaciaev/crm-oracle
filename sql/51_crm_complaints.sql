-- ============================================================
-- Customer complaints / claims (CRM-only)
-- ============================================================
-- DIPP FRUICT has QA checks and HACCP records but no customer claims, so
-- the CRM keeps them here. A claim belongs to a customer and may point to
-- the sales document and the batch it is about. Claims are never deleted —
-- they are closed as resolved / rejected; every change goes to the audit log.
-- Oracle 11g: sequences + BEFORE INSERT triggers. Idempotent.

DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v FROM USER_TABLES WHERE TABLE_NAME = 'AGRO_CRM_COMPLAINTS';
  IF v = 0 THEN
    EXECUTE IMMEDIATE '
      CREATE TABLE AGRO_CRM_COMPLAINTS (
        ID                  NUMBER         NOT NULL,
        COMPLAINT_NUMBER    VARCHAR2(30)   NOT NULL,
        CUSTOMER_ID         NUMBER         NOT NULL,
        SALES_DOC_ID        NUMBER,
        BATCH_ID            NUMBER,
        RECEIVED_DATE       DATE           NOT NULL,
        CATEGORY            VARCHAR2(20)   NOT NULL,
        SEVERITY            VARCHAR2(10)   DEFAULT ''medium'' NOT NULL,
        DESCRIPTION         VARCHAR2(2000) NOT NULL,
        QTY_KG              NUMBER(14,3),
        CLAIM_AMOUNT        NUMBER(14,2),
        CURRENCY_CODE       VARCHAR2(3),
        STATUS              VARCHAR2(15)   DEFAULT ''new'' NOT NULL,
        RESPONSIBLE         VARCHAR2(100),
        DUE_DATE            DATE,
        RESOLUTION          VARCHAR2(20),
        RESOLUTION_NOTES    VARCHAR2(2000),
        COMPENSATION_AMOUNT NUMBER(14,2),
        RESOLVED_BY         VARCHAR2(100),
        RESOLVED_AT         DATE,
        CREATED_BY          VARCHAR2(100),
        CREATED_AT          DATE DEFAULT SYSDATE NOT NULL,
        UPDATED_AT          DATE,
        CONSTRAINT PK_AGRO_CRM_COMPLAINTS PRIMARY KEY (ID),
        CONSTRAINT UQ_AGRO_CRM_CLM_NO UNIQUE (COMPLAINT_NUMBER),
        CONSTRAINT FK_AGRO_CRM_CLM_CUST  FOREIGN KEY (CUSTOMER_ID)  REFERENCES AGRO_CUSTOMERS (ID),
        CONSTRAINT FK_AGRO_CRM_CLM_SALE  FOREIGN KEY (SALES_DOC_ID) REFERENCES AGRO_SALES_DOCS (ID),
        CONSTRAINT FK_AGRO_CRM_CLM_BATCH FOREIGN KEY (BATCH_ID)     REFERENCES AGRO_BATCHES (ID),
        CONSTRAINT CK_AGRO_CRM_CLM_CAT CHECK (CATEGORY IN (''quality'',''quantity'',''packaging'',''delivery'',''documents'',''other'')),
        CONSTRAINT CK_AGRO_CRM_CLM_SEV CHECK (SEVERITY IN (''low'',''medium'',''high'')),
        CONSTRAINT CK_AGRO_CRM_CLM_ST  CHECK (STATUS IN (''new'',''in_progress'',''resolved'',''rejected'')),
        CONSTRAINT CK_AGRO_CRM_CLM_RES CHECK (RESOLUTION IS NULL OR RESOLUTION IN (''refund'',''discount'',''replacement'',''return'',''none''))
      )';
    EXECUTE IMMEDIATE 'CREATE INDEX IX_AGRO_CRM_CLM_CUST ON AGRO_CRM_COMPLAINTS (CUSTOMER_ID, RECEIVED_DATE)';
    EXECUTE IMMEDIATE 'CREATE INDEX IX_AGRO_CRM_CLM_SALE ON AGRO_CRM_COMPLAINTS (SALES_DOC_ID)';
    EXECUTE IMMEDIATE 'CREATE INDEX IX_AGRO_CRM_CLM_BATCH ON AGRO_CRM_COMPLAINTS (BATCH_ID)';
  END IF;
  SELECT COUNT(*) INTO v FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'AGRO_CRM_COMPLAINTS_SEQ';
  IF v = 0 THEN
    EXECUTE IMMEDIATE 'CREATE SEQUENCE AGRO_CRM_COMPLAINTS_SEQ START WITH 1 INCREMENT BY 1 NOCACHE';
  END IF;
END;
/

CREATE OR REPLACE TRIGGER AGRO_CRM_COMPLAINTS_BI
BEFORE INSERT ON AGRO_CRM_COMPLAINTS FOR EACH ROW
BEGIN
  IF :NEW.ID IS NULL THEN
    SELECT AGRO_CRM_COMPLAINTS_SEQ.NEXTVAL INTO :NEW.ID FROM DUAL;
  END IF;
END;
/
