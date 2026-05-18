-- 62_drop_crm_deals.sql
-- Pipeline feature removed. Drops AGRO_CRM_DEALS and its sequence.
-- CASCADE CONSTRAINTS removes FK references in AGRO_CRM_ACTIVITIES and AGRO_CRM_TASKS.

DROP TABLE AGRO_CRM_DEALS CASCADE CONSTRAINTS;
DROP SEQUENCE AGRO_CRM_DEALS_SEQ;
