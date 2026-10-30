DROP INDEX IF EXISTS uq_morders_transref;
ALTER TABLE membership_orders DROP COLUMN IF EXISTS verify_status, DROP COLUMN IF EXISTS verify_note,
  DROP COLUMN IF EXISTS verify_provider, DROP COLUMN IF EXISTS trans_ref, DROP COLUMN IF EXISTS verified_at;
