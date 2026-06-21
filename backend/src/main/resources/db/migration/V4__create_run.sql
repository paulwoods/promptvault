-- A Run is one one-shot generation of a Version. user_id is denormalized (owner)
-- so the uniform owner filter needs no join through version -> prompt -> user.
create table run (
    id              uuid        primary key,
    user_id         uuid        not null references users (id),
    version_id      uuid        not null references version (id),
    variable_values jsonb       not null default '{}'::jsonb,
    rendered_prompt text        not null,
    response        text,
    model           text        not null,
    input_tokens    integer,
    output_tokens   integer,
    status          text        not null,
    error_category  text,
    error_message   text,
    created_at      timestamptz not null default now(),
    constraint ck_run_status check (status in ('in_progress', 'completed', 'failed'))
);
