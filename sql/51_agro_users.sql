-- ============================================================
-- AGRO_USERS — application users (login / role)
-- Roles: admin | manager
-- Password is stored as bcrypt hash (jsbcrypt, cost 10).
-- ============================================================

CREATE SEQUENCE AGRO_USERS_SEQ START WITH 1 INCREMENT BY 1 NOCACHE;
/

CREATE TABLE AGRO_USERS (
  ID             NUMBER          NOT NULL,
  USERNAME       VARCHAR2(100)   NOT NULL,
  PASSWORD_HASH  VARCHAR2(200)   NOT NULL,
  FIRST_NAME     VARCHAR2(100),
  LAST_NAME      VARCHAR2(100),
  ROLE           VARCHAR2(20)    DEFAULT 'manager' NOT NULL,
  ACTIVE         CHAR(1)         DEFAULT 'Y'       NOT NULL,
  CREATED_AT     TIMESTAMP       DEFAULT SYSTIMESTAMP,
  CONSTRAINT PK_AGRO_USERS          PRIMARY KEY (ID),
  CONSTRAINT UQ_AGRO_USERS_USERNAME UNIQUE (USERNAME),
  CONSTRAINT CK_AGRO_USERS_ROLE     CHECK (ROLE IN ('admin','manager')),
  CONSTRAINT CK_AGRO_USERS_ACTIVE   CHECK (ACTIVE IN ('Y','N'))
);
/

CREATE OR REPLACE TRIGGER AGRO_USERS_BI
  BEFORE INSERT ON AGRO_USERS FOR EACH ROW
  WHEN (NEW.ID IS NULL)
BEGIN
  :NEW.ID := AGRO_USERS_SEQ.NEXTVAL;
END;
/

-- Seed initial admin
-- username: admin
-- password: Artgranit2026  (bcrypt hash below)
INSERT INTO AGRO_USERS (USERNAME, PASSWORD_HASH, FIRST_NAME, LAST_NAME, ROLE)
VALUES ('admin', '$2b$10$cWY2POrt42TCoMNDvBir9e..mTDFX98sLvgUOJozZfR1X23RiMXIK', 'Admin', NULL, 'admin');
/

COMMIT;
/
