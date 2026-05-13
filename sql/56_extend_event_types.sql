-- ============================================================
-- Добавляем типы событий для outbound-флоу:
--   'act_sent'    — отправили акт взвешивания клиенту в Telegram
--   'message_out' — менеджер ответил клиенту через CRM
--
-- Идемпотентно: если на этапе rename констрейнт ещё называется
-- CK_CRM_AUE_TYPE (старое имя), тоже подхватим.
-- ============================================================

DECLARE
BEGIN
  FOR c IN (
    SELECT CONSTRAINT_NAME
      FROM USER_CONSTRAINTS
     WHERE TABLE_NAME = 'AGRO_CRM_APP_USER_EVENTS'
       AND CONSTRAINT_NAME IN ('CK_CRM_AUE_TYPE','CK_AGRO_CRM_AUE_TYPE')
  ) LOOP
    EXECUTE IMMEDIATE
      'ALTER TABLE AGRO_CRM_APP_USER_EVENTS DROP CONSTRAINT ' || c.CONSTRAINT_NAME;
  END LOOP;
END;
/

ALTER TABLE AGRO_CRM_APP_USER_EVENTS
  ADD CONSTRAINT CK_AGRO_CRM_AUE_TYPE CHECK (EVENT_TYPE IN (
    'start','start_with_token','linked','unlinked','blocked','unblocked',
    'message_in','message_out','archived','unarchived','act_sent'
  ));
/

COMMIT;
/
