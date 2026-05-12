-- Migration: extend AGRO_STORAGE_CELLS.CELL_TYPE check constraint to match the
-- admin UI options ('shelf' / 'pallet' alongside the existing 'chamber'/'zone').
-- The original constraint allowed only ('chamber','section','zone'), which made
-- the admin form silently fail when the user picked Полка/Паллет.
-- Safe to run multiple times.
DECLARE
  v_cnt NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_cnt
    FROM USER_CONSTRAINTS
   WHERE TABLE_NAME = 'AGRO_STORAGE_CELLS'
     AND CONSTRAINT_NAME = 'CK_AGRO_SC_TYPE';

  IF v_cnt > 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE AGRO_STORAGE_CELLS DROP CONSTRAINT CK_AGRO_SC_TYPE';
  END IF;

  EXECUTE IMMEDIATE
    'ALTER TABLE AGRO_STORAGE_CELLS ADD CONSTRAINT CK_AGRO_SC_TYPE ' ||
    'CHECK (CELL_TYPE IN (''chamber'',''section'',''zone'',''shelf'',''pallet''))';
END;
/
