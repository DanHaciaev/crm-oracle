-- 68_automation_email_action.sql
-- Adds email_send as a valid automation action type.
-- TASK_TITLE  → email subject
-- MESSAGE_TEMPLATE → email body (plain text, supports {{customer_name}} {{days_since}})

ALTER TABLE AGRO_CRM_AUTOMATION_RULES
  DROP CONSTRAINT CK_AGRO_CAR_ACTION;
/

ALTER TABLE AGRO_CRM_AUTOMATION_RULES
  ADD CONSTRAINT CK_AGRO_CAR_ACTION
  CHECK (ACTION_TYPE IN ('tg_message','manager_task','email_send'));
/

COMMIT;
/
