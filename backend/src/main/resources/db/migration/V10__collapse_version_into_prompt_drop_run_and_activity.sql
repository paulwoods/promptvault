-- ADR-0007: a Prompt becomes one mutable row carrying all of its own content,
-- Runs stop being persisted, and the Activity feed is removed. This migration
-- is irreversible: it destroys every historical Version and every stored Claude
-- response. Take a pg_dump immediately before deploying it.

-- 1. Version's content columns move onto prompt, plus a new updated_at (backfilled
--    in step 2 from the current Version's created_at to preserve list ordering).
--    Nullable first so the backfill can populate them; tightened in step 3.
alter table prompt
    add column name          text,
    add column description   text,
    add column prompt_text   text,
    add column model         text,
    add column system_prompt text,
    add column max_tokens    integer,
    add column effort        text,
    add column thinking      text,
    add column variables     jsonb,
    add column updated_at    timestamptz;

-- 2. Backfill each prompt from its current (max-number) Version. updated_at
--    takes that Version's created_at, so list ordering (previously "current
--    version's created_at desc") is unchanged by this migration. prompt.created_at
--    already existed (V3) and is left alone.
update prompt
set name          = current_version.name,
    description   = current_version.description,
    prompt_text   = current_version.prompt_text,
    model         = current_version.model,
    system_prompt = current_version.system_prompt,
    max_tokens    = current_version.max_tokens,
    effort        = current_version.effort,
    thinking      = current_version.thinking,
    variables     = current_version.variables,
    updated_at    = current_version.created_at
from (
    select distinct on (prompt_id)
           prompt_id, name, description, prompt_text, model, system_prompt,
           max_tokens, effort, thinking, variables, created_at
    from version
    order by prompt_id, number desc
) current_version
where prompt.id = current_version.prompt_id;

-- 3. Every prompt has at least one Version (creation writes prompt + version 1 in
--    one transaction), so the backfill leaves no NULLs. A failure here means an
--    orphaned prompt row and should stop the deploy rather than be papered over.
alter table prompt
    alter column name        set not null,
    alter column prompt_text set not null,
    alter column model       set not null,
    alter column max_tokens  set not null,
    alter column effort      set not null,
    alter column thinking    set not null,
    alter column variables   set not null,
    alter column updated_at  set not null;

alter table prompt alter column variables set default '[]'::jsonb;

-- V7 deliberately dropped version's effort/thinking CHECKs (the model->capabilities
-- map in the app is the authority, and it changes without a migration). Only the
-- max_tokens CHECK is carried over.
alter table prompt add constraint ck_prompt_max_tokens check (max_tokens >= 1);

-- 4. Token totals were previously derived by summing the run table (ADR-0005).
--    With runs unpersisted they need a home of their own: a running total per
--    (user, model), incremented when a run completes. Not a run log — there is
--    one row per model a user has ever used, and it only ever grows.
create table token_usage (
    user_id       uuid   not null references users (id),
    model         text   not null,
    input_tokens  bigint not null default 0,
    output_tokens bigint not null default 0,
    primary key (user_id, model)
);

-- 5. Seed from the runs about to be dropped, so all-time totals survive the
--    refactor instead of silently resetting to zero. Only completed runs ever
--    had token counts written.
insert into token_usage (user_id, model, input_tokens, output_tokens)
select user_id,
       model,
       sum(coalesce(input_tokens, 0)),
       sum(coalesce(output_tokens, 0))
from run
where status = 'completed'
group by user_id, model;

-- 6. Drop in FK-safe order: activity_event references run and prompt; run
--    references version; version references prompt.
drop table activity_event;
drop table run;
drop table version;
