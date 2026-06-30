-- ============================================================
-- 42_staff_chat_fix.sql  — Drop invalid trigger (ORA-04098 fix)
-- Run once on the DB after 42_staff_chat.sql
--
-- The trigger TRG_STAFF_MSG_ID was compiled with errors because
-- EXECUTE IMMEDIATE misinterprets :NEW as a bind variable.
-- We remove the trigger and use AGRO_STAFF_MSG_SEQ.NEXTVAL
-- explicitly in INSERT statements instead.
-- ============================================================

BEGIN
  EXECUTE IMMEDIATE 'DROP TRIGGER TRG_STAFF_MSG_ID';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
