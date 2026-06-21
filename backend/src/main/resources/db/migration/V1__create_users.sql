create table users (
    id            uuid        primary key,
    email         text        not null,
    password_hash text        not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- Case-insensitive email uniqueness: email is stored as entered but matched
-- lowercased, so case-variant duplicates are rejected.
create unique index ux_users_lower_email on users (lower(email));
