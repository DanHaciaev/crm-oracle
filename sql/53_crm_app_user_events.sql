-- ============================================================
-- CRM_APP_USER_EVENTS — аудит-лог событий по AGRO_CRM_APP_USERS:
--   start, start_with_token, linked, blocked, unblocked, unlinked
--   Помогает дебажить флоу и видеть историю взаимодействия
--   c каждым бот-юзером.
-- ============================================================

CREATE SEQUENCE CRM_APP_USER_EVENTS_SEQ START WITH 1 INCREMENT BY 1 NOCACHE;
/

CREATE TABLE CRM_APP_USER_EVENTS (
  ID           NUMBER          NOT NULL,
  APP_USER_ID  NUMBER          NOT NULL,
  EVENT_TYPE   VARCHAR2(30)    NOT NULL,
  PAYLOAD      VARCHAR2(2000),
  ACTOR_USER   NUMBER,
  CREATED_AT   TIMESTAMP       DEFAULT SYSTIMESTAMP,
  CONSTRAINT PK_CRM_APP_USER_EVENTS  PRIMARY KEY (ID),
  CONSTRAINT FK_CRM_AUE_USER         FOREIGN KEY (APP_USER_ID) REFERENCES AGRO_CRM_APP_USERS(ID),
  CONSTRAINT FK_CRM_AUE_ACTOR        FOREIGN KEY (ACTOR_USER)  REFERENCES AGRO_USERS(ID),
  CONSTRAINT CK_CRM_AUE_TYPE         CHECK (EVENT_TYPE IN (
    'start','start_with_token','linked','unlinked','blocked','unblocked','message_in'
  ))
);
/

CREATE OR REPLACE TRIGGER CRM_APP_USER_EVENTS_BI
  BEFORE INSERT ON CRM_APP_USER_EVENTS FOR EACH ROW
  WHEN (NEW.ID IS NULL)
BEGIN
  :NEW.ID := CRM_APP_USER_EVENTS_SEQ.NEXTVAL;
END;
/

CREATE INDEX IX_CRM_AUE_USER     ON CRM_APP_USER_EVENTS(APP_USER_ID);
/
CREATE INDEX IX_CRM_AUE_CREATED  ON CRM_APP_USER_EVENTS(CREATED_AT);
/

COMMIT;
/
