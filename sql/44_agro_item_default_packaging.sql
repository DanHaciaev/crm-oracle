-- Migration: add DEFAULT_PACKAGING_ID to AGRO_ITEMS
-- Safe to run multiple times.
DECLARE
  v_cnt NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_cnt
    FROM USER_TAB_COLUMNS
   WHERE TABLE_NAME = 'AGRO_ITEMS'
     AND COLUMN_NAME = 'DEFAULT_PACKAGING_ID';

  IF v_cnt = 0 THEN
    EXECUTE IMMEDIATE
      'ALTER TABLE AGRO_ITEMS ADD (DEFAULT_PACKAGING_ID NUMBER REFERENCES AGRO_PACKAGING_TYPES(ID))';
  END IF;
END;
/

-- Business default: apples are received in cardboard boxes only.
UPDATE AGRO_ITEMS i
   SET i.DEFAULT_PACKAGING_ID = (
           SELECT p.ID
             FROM AGRO_PACKAGING_TYPES p
            WHERE p.CODE = 'BOX_CARDBOARD'
       ),
       i.DEFAULT_TARE_KG = (
           SELECT p.TARE_WEIGHT_KG
             FROM AGRO_PACKAGING_TYPES p
            WHERE p.CODE = 'BOX_CARDBOARD'
       )
 WHERE i.CODE = 'APPLE'
   AND EXISTS (
       SELECT 1
         FROM AGRO_PACKAGING_TYPES p
        WHERE p.CODE = 'BOX_CARDBOARD'
   );
/
