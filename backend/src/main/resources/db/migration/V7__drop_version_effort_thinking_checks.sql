-- RunSettingsValidator is now the single seam that decides whether a Version's
-- effort/thinking/model combination is legal; these CHECK constraints duplicated
-- that decision at the schema level.
alter table version drop constraint ck_version_effort;
alter table version drop constraint ck_version_thinking;
