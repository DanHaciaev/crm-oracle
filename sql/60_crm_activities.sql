-- ============================================================
-- AGRO_CRM_ACTIVITIES — manager activity log (calls, meetings, notes)
-- Linked to customer + optionally to a deal.
-- Types:    call | meeting | note | email | other
-- Outcomes: reached | no_answer | voicemail | busy (calls)
--           completed | cancelled            (meetings)
-- ============================================================

CREATE SEQUENCE AGRO_CRM_ACTIVITIES_SEQ START WITH 1 INCREMENT BY 1 NOCACHE;
/

CREATE TABLE AGRO_CRM_ACTIVITIES (
  ID           NUMBER          NOT NULL,
  CUSTOMER_ID  NUMBER          NOT NULL,
  DEAL_ID      NUMBER,
  ACT_TYPE     VARCHAR2(20)    DEFAULT 'note' NOT NULL,
  BODY         VARCHAR2(4000),
  OUTCOME      VARCHAR2(20),
  CREATED_BY   VARCHAR2(100),
  CREATED_AT   TIMESTAMP       DEFAULT SYSTIMESTAMP,
  CONSTRAINT PK_AGRO_CRM_ACTIVITIES   PRIMARY KEY (ID),
  CONSTRAINT FK_AGRO_CA_CUSTOMER      FOREIGN KEY (CUSTOMER_ID) REFERENCES AGRO_CUSTOMERS(ID),
  CONSTRAINT FK_AGRO_CA_DEAL          FOREIGN KEY (DEAL_ID) REFERENCES AGRO_CRM_DEALS(ID) ON DELETE SET NULL,
  CONSTRAINT CK_AGRO_CA_TYPE          CHECK (ACT_TYPE IN ('call','meeting','note','email','other')),
  CONSTRAINT CK_AGRO_CA_OUTCOME       CHECK (OUTCOME IS NULL OR OUTCOME IN (
    'reached','no_answer','voicemail','busy','completed','cancelled'
  ))
);
/

CREATE OR REPLACE TRIGGER AGRO_CRM_ACTIVITIES_BI
  BEFORE INSERT ON AGRO_CRM_ACTIVITIES FOR EACH ROW
  WHEN (NEW.ID IS NULL)
BEGIN
  :NEW.ID := AGRO_CRM_ACTIVITIES_SEQ.NEXTVAL;
END;
/

CREATE INDEX IX_AGRO_CA_CUSTOMER ON AGRO_CRM_ACTIVITIES(CUSTOMER_ID, CREATED_AT);
/
CREATE INDEX IX_AGRO_CA_DEAL     ON AGRO_CRM_ACTIVITIES(DEAL_ID);
/

COMMIT;
/
