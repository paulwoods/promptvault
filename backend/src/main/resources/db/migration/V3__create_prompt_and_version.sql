-- A Prompt is pure identity (owner + id); all content lives on its Versions.
create table prompt (
    id         uuid        primary key,
    user_id    uuid        not null references users (id),
    created_at timestamptz not null default now()
);

-- A Version is an immutable, append-only snapshot. The (prompt_id, number)
-- sequence starts at 1 and increments per save.
create table version (
    id            uuid        primary key,
    prompt_id     uuid        not null references prompt (id),
    number        integer     not null,
    name          text        not null,
    description   text,
    prompt_text   text        not null,
    model         text        not null,
    system_prompt text,
    max_tokens    integer     not null,
    effort        text        not null,
    thinking      text        not null,
    variables     jsonb       not null default '[]'::jsonb,
    created_at    timestamptz not null default now(),
    constraint uq_version_prompt_number unique (prompt_id, number),
    constraint ck_version_effort check (effort in ('low', 'medium', 'high')),
    constraint ck_version_thinking check (thinking in ('off', 'adaptive')),
    constraint ck_version_max_tokens check (max_tokens >= 1)
);
