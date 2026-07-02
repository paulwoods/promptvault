-- Soft-delete support (ADR-0004): NULL means active; a timestamp moves the
-- Prompt to Trash. Existing rows default to NULL (active).
alter table prompt add column deleted_at timestamptz;
