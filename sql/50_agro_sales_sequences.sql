-- Migration: re-align AGRO_SALES_DOCS_SEQ and AGRO_SALES_LINES_SEQ past
-- MAX(ID). Sequence falls behind table data after manual imports /
-- cross-environment seeds and the next INSERT then fails with ORA-00001.
-- Safe to run multiple times.
DECLARE
  v_max  NUMBER;
  v_seq  NUMBER;
  v_loop PLS_INTEGER := 0;
BEGIN
  SELECT NVL(MAX(ID), 0) INTO v_max FROM AGRO_SALES_DOCS;
  LOOP
    SELECT AGRO_SALES_DOCS_SEQ.NEXTVAL INTO v_seq FROM DUAL;
    EXIT WHEN v_seq > v_max OR v_loop > 1000000;
    v_loop := v_loop + 1;
  END LOOP;
END;
/

DECLARE
  v_max  NUMBER;
  v_seq  NUMBER;
  v_loop PLS_INTEGER := 0;
BEGIN
  SELECT NVL(MAX(ID), 0) INTO v_max FROM AGRO_SALES_LINES;
  LOOP
    SELECT AGRO_SALES_LINES_SEQ.NEXTVAL INTO v_seq FROM DUAL;
    EXIT WHEN v_seq > v_max OR v_loop > 1000000;
    v_loop := v_loop + 1;
  END LOOP;
END;
/
