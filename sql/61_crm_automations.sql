-- ============================================================
-- AGRO_CRM_AUTOMATION_RULES  — правила автоматизации
-- AGRO_CRM_AUTOMATION_LOG    — лог срабатываний
--
-- Trigger types:
--   no_order_days — клиент не покупал N дней
--
-- Action types:
--   tg_message    — отправить сообщение клиенту в Telegram
--   manager_task  — создать задачу менеджеру
--
-- Segments (фильтр клиентов):
--   all | vip | active | sleeping | churned
-- ============================================================

CREATE SEQUENCE AGRO_CRM_AUTO_RULES_SEQ START WITH 1 INCREMENT BY 1 NOCACHE;
/
CREATE SEQUENCE AGRO_CRM_AUTO_LOG_SEQ   START WITH 1 INCREMENT BY 1 NOCACHE;
/

-- ── Правила ──────────────────────────────────────────────────
CREATE TABLE AGRO_CRM_AUTOMATION_RULES (
  ID               NUMBER          NOT NULL,
  NAME             VARCHAR2(300)   NOT NULL,
  TRIGGER_TYPE     VARCHAR2(30)    DEFAULT 'no_order_days' NOT NULL,
  CONDITION_DAYS   NUMBER          DEFAULT 30             NOT NULL,
  ACTION_TYPE      VARCHAR2(20)    DEFAULT 'tg_message'   NOT NULL,
  MESSAGE_TEMPLATE VARCHAR2(2000),
  TASK_TITLE       VARCHAR2(500),
  COOLDOWN_DAYS    NUMBER          DEFAULT 7              NOT NULL,
  SEGMENT          VARCHAR2(20)    DEFAULT 'all'          NOT NULL,
  ACTIVE           CHAR(1)         DEFAULT 'Y'            NOT NULL,
  CREATED_AT       TIMESTAMP       DEFAULT SYSTIMESTAMP,
  CONSTRAINT PK_AGRO_CRM_AUTO_RULES   PRIMARY KEY (ID),
  CONSTRAINT CK_AGRO_CAR_TRIGGER      CHECK (TRIGGER_TYPE IN ('no_order_days')),
  CONSTRAINT CK_AGRO_CAR_ACTION       CHECK (ACTION_TYPE  IN ('tg_message','manager_task')),
  CONSTRAINT CK_AGRO_CAR_SEGMENT      CHECK (SEGMENT      IN ('all','vip','active','sleeping','churned')),
  CONSTRAINT CK_AGRO_CAR_ACTIVE       CHECK (ACTIVE       IN ('Y','N'))
);
/

CREATE OR REPLACE TRIGGER AGRO_CRM_AUTO_RULES_BI
  BEFORE INSERT ON AGRO_CRM_AUTOMATION_RULES FOR EACH ROW
  WHEN (NEW.ID IS NULL)
BEGIN
  :NEW.ID := AGRO_CRM_AUTO_RULES_SEQ.NEXTVAL;
END;
/

-- ── Лог срабатываний ─────────────────────────────────────────
CREATE TABLE AGRO_CRM_AUTOMATION_LOG (
  ID          NUMBER          NOT NULL,
  RULE_ID     NUMBER          NOT NULL,
  CUSTOMER_ID NUMBER          NOT NULL,
  ACTION_TYPE VARCHAR2(20),
  RESULT      VARCHAR2(10)    DEFAULT 'success' NOT NULL,
  DETAILS     VARCHAR2(2000),
  FIRED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP,
  CONSTRAINT PK_AGRO_CRM_AUTO_LOG     PRIMARY KEY (ID),
  CONSTRAINT FK_AGRO_CAL_RULE         FOREIGN KEY (RULE_ID)     REFERENCES AGRO_CRM_AUTOMATION_RULES(ID),
  CONSTRAINT FK_AGRO_CAL_CUSTOMER     FOREIGN KEY (CUSTOMER_ID) REFERENCES AGRO_CUSTOMERS(ID),
  CONSTRAINT CK_AGRO_CAL_RESULT       CHECK (RESULT IN ('success','error','skipped'))
);
/

CREATE OR REPLACE TRIGGER AGRO_CRM_AUTO_LOG_BI
  BEFORE INSERT ON AGRO_CRM_AUTOMATION_LOG FOR EACH ROW
  WHEN (NEW.ID IS NULL)
BEGIN
  :NEW.ID := AGRO_CRM_AUTO_LOG_SEQ.NEXTVAL;
END;
/

CREATE INDEX IX_AGRO_CAL_RULE    ON AGRO_CRM_AUTOMATION_LOG(RULE_ID, FIRED_AT);
/
CREATE INDEX IX_AGRO_CAL_CUST    ON AGRO_CRM_AUTOMATION_LOG(CUSTOMER_ID, FIRED_AT);
/

-- ── Два стартовых правила ─────────────────────────────────────
INSERT INTO AGRO_CRM_AUTOMATION_RULES
  (NAME, TRIGGER_TYPE, CONDITION_DAYS, ACTION_TYPE, MESSAGE_TEMPLATE, COOLDOWN_DAYS, SEGMENT)
VALUES (
  'Нет заказов 30 дней → напомнить клиенту',
  'no_order_days', 30, 'tg_message',
  'Здравствуйте, {{customer_name}}! Давно не видели вас среди наших покупателей. Если нужна свежая продукция — мы готовы помочь. Напишите нам!',
  14, 'all'
);
/

INSERT INTO AGRO_CRM_AUTOMATION_RULES
  (NAME, TRIGGER_TYPE, CONDITION_DAYS, ACTION_TYPE, TASK_TITLE, COOLDOWN_DAYS, SEGMENT)
VALUES (
  'VIP не покупал 14 дней → задача менеджеру',
  'no_order_days', 14, 'manager_task',
  'Позвонить VIP-клиенту {{customer_name}}: нет заказов {{days_since}} дней',
  7, 'vip'
);
/

COMMIT;
/
