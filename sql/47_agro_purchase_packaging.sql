-- Migration: link AGRO_PURCHASE_LINES to AGRO_PACKAGING_TYPES
-- Each purchase line records WHICH packaging is used (Lazi / Cutie carton / etc.)
-- Safe to run multiple times.
DECLARE
  v_cnt NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_cnt
    FROM USER_TAB_COLUMNS
   WHERE TABLE_NAME = 'AGRO_PURCHASE_LINES'
     AND COLUMN_NAME = 'PACKAGING_TYPE_ID';

  IF v_cnt = 0 THEN
    EXECUTE IMMEDIATE
      'ALTER TABLE AGRO_PURCHASE_LINES ADD (PACKAGING_TYPE_ID NUMBER REFERENCES AGRO_PACKAGING_TYPES(ID))';
  END IF;
END;
/

-- Backfill PACKAGING_TYPE_ID from item default for existing lines that have no value yet.
UPDATE AGRO_PURCHASE_LINES pl
   SET pl.PACKAGING_TYPE_ID = (
           SELECT i.DEFAULT_PACKAGING_ID
             FROM AGRO_ITEMS i
            WHERE i.ID = pl.ITEM_ID
       )
 WHERE pl.PACKAGING_TYPE_ID IS NULL
   AND EXISTS (
       SELECT 1
         FROM AGRO_ITEMS i
        WHERE i.ID = pl.ITEM_ID
          AND i.DEFAULT_PACKAGING_ID IS NOT NULL
   );
/

-- Re-align AGRO_PURCHASE_DOCS_SEQ past MAX(ID).
-- Manual inserts / cross-environment imports can leave the sequence behind
-- the actual data, which then surfaces as ORA-00001 on the next create_purchase.
DECLARE
  v_max  NUMBER;
  v_seq  NUMBER;
  v_loop PLS_INTEGER := 0;
BEGIN
  SELECT NVL(MAX(ID), 0) INTO v_max FROM AGRO_PURCHASE_DOCS;
  LOOP
    SELECT AGRO_PURCHASE_DOCS_SEQ.NEXTVAL INTO v_seq FROM DUAL;
    EXIT WHEN v_seq > v_max OR v_loop > 1000000;
    v_loop := v_loop + 1;
  END LOOP;
END;
/

-- Same realignment for AGRO_PURCHASE_LINES_SEQ.
DECLARE
  v_max  NUMBER;
  v_seq  NUMBER;
  v_loop PLS_INTEGER := 0;
BEGIN
  SELECT NVL(MAX(ID), 0) INTO v_max FROM AGRO_PURCHASE_LINES;
  LOOP
    SELECT AGRO_PURCHASE_LINES_SEQ.NEXTVAL INTO v_seq FROM DUAL;
    EXIT WHEN v_seq > v_max OR v_loop > 1000000;
    v_loop := v_loop + 1;
  END LOOP;
END;
/
