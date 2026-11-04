-- CRM's sales pipeline uses status 'delivered' (черновик → подтверждён →
-- отгружен → доставлен → закрыт), but the Artgranit warehouse app's
-- migration 68 (2026-09-01) dropped and recreated CK_AGRO_SD_STATUS to add
-- 'returned' without knowing about 'delivered', silently removing it from
-- the shared live constraint. Both apps write to the same AGRO_SALES_DOCS
-- table, so this restores 'delivered' alongside 'returned'.
BEGIN
  BEGIN EXECUTE IMMEDIATE 'ALTER TABLE AGRO_SALES_DOCS DROP CONSTRAINT CK_AGRO_SD_STATUS'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE IMMEDIATE q'[ALTER TABLE AGRO_SALES_DOCS ADD CONSTRAINT CK_AGRO_SD_STATUS CHECK (STATUS IN ('draft','confirmed','shipped','delivered','closed','cancelled','returned'))]'; EXCEPTION WHEN OTHERS THEN NULL; END;
END;
/
