-- ADR-0013: either prompt body may be empty. Null means empty, matching
-- system_prompt; PromptService normalizes blank to null before storing.
ALTER TABLE prompt ALTER COLUMN prompt_text DROP NOT NULL;
