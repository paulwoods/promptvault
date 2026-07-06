-- An Activity event (ADR-0006) is an append-only, per-user history row: every
-- mutation plus login writes one of these in the same transaction. label is a
-- denormalized display string (e.g. a Version's name at event time) so the
-- feed never joins through prompt/version and survives Trash.
create table activity_event (
    id             uuid        primary key,
    user_id        uuid        not null references users (id),
    type           text        not null,
    occurred_at    timestamptz not null default now(),
    prompt_id      uuid        references prompt (id),
    version_number integer,
    run_id         uuid        references run (id),
    label          text        not null,
    constraint ck_activity_event_type check (type in (
        'registered', 'logged_in', 'api_key_set', 'name_changed',
        'prompt_created', 'version_saved', 'prompt_deleted', 'prompt_restored', 'run_started'
    ))
);
create index ix_activity_event_user_occurred on activity_event (user_id, occurred_at desc, id desc);

-- Backfill true historical events (ADR-0006): each row below is a real past
-- action with its real timestamp. Not reconstructible, accepted gap: past
-- logins, restores, name changes, and key-set history before the latest.

-- One registered event per existing user.
insert into activity_event (id, user_id, type, occurred_at, label)
select gen_random_uuid(), id, 'registered', created_at, 'Registered'
from users;

-- One prompt_created/version_saved event per existing version (number 1 is
-- the prompt's creation; later numbers are subsequent saves).
insert into activity_event (id, user_id, type, occurred_at, prompt_id, version_number, label)
select gen_random_uuid(),
       prompt.user_id,
       case when version.number = 1 then 'prompt_created' else 'version_saved' end,
       version.created_at,
       version.prompt_id,
       version.number,
       version.name
from version
join prompt on prompt.id = version.prompt_id;

-- One run_started event per existing run, labeled with the Version it ran.
insert into activity_event (id, user_id, type, occurred_at, prompt_id, version_number, run_id, label)
select gen_random_uuid(),
       run.user_id,
       'run_started',
       run.created_at,
       version.prompt_id,
       version.number,
       run.id,
       version.name
from run
join version on version.id = run.version_id;

-- One prompt_deleted event per currently-Trashed prompt, labeled with its
-- current (max-number) Version.
insert into activity_event (id, user_id, type, occurred_at, prompt_id, label)
select gen_random_uuid(),
       prompt.user_id,
       'prompt_deleted',
       prompt.deleted_at,
       prompt.id,
       current_version.name
from prompt
join lateral (
    select version.name
    from version
    where version.prompt_id = prompt.id
    order by version.number desc
    limit 1
) current_version on true
where prompt.deleted_at is not null;

-- One api_key_set event per stored key (one row per user already), labeled
-- generically since the key itself carries no display name.
insert into activity_event (id, user_id, type, occurred_at, label)
select gen_random_uuid(), user_id, 'api_key_set', updated_at, 'API key saved'
from api_key;
