-- Migration: widen numeric columns of AGRO_STORAGE_CELLS so the admin form
-- does not run into ORA-01438 when a user enters a 4-digit value.
-- TEMP / HUMIDITY: NUMBER(5,2) -> NUMBER(7,2)  (-99999.99 .. 99999.99)
-- Safe to run multiple times: only widens, never narrows.
DECLARE
  v_prec NUMBER;
BEGIN
  FOR rec IN (
      SELECT COLUMN_NAME, DATA_PRECISION, DATA_SCALE
        FROM USER_TAB_COLUMNS
       WHERE TABLE_NAME = 'AGRO_STORAGE_CELLS'
         AND COLUMN_NAME IN ('TEMP_MIN','TEMP_MAX','HUMIDITY_MIN','HUMIDITY_MAX')
  ) LOOP
      IF NVL(rec.DATA_PRECISION, 0) < 7 THEN
          EXECUTE IMMEDIATE
            'ALTER TABLE AGRO_STORAGE_CELLS MODIFY (' || rec.COLUMN_NAME || ' NUMBER(7,2))';
      END IF;
  END LOOP;
END;
/

-- Re-align AGRO_STORAGE_CELLS_SEQ past MAX(ID).
-- Sequence falls behind table data after manual imports / cross-env seeds and
-- the next INSERT then fails with ORA-00001 on PK_AGRO_STORAGE_CELLS.
DECLARE
  v_max  NUMBER;
  v_seq  NUMBER;
  v_loop PLS_INTEGER := 0;
BEGIN
  SELECT NVL(MAX(ID), 0) INTO v_max FROM AGRO_STORAGE_CELLS;
  LOOP
    SELECT AGRO_STORAGE_CELLS_SEQ.NEXTVAL INTO v_seq FROM DUAL;
    EXIT WHEN v_seq > v_max OR v_loop > 1000000;
    v_loop := v_loop + 1;
  END LOOP;
END;
/
