-- ADR-0009: Variables are removed from Prompts. The declaration list stops
-- existing and the prompt text is sent to Claude verbatim — no {{...}}
-- substitution. This migration drops the variables column only; it does not
-- touch prompt_text, so any leftover {{...}} literals stay as ordinary text
-- (the user can edit them away with a normal save).

alter table prompt
    drop column variables;