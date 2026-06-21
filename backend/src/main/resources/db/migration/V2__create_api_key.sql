create table api_key (
    id              uuid        primary key,
    user_id         uuid        not null unique references users (id),
    iv              bytea       not null,
    ciphertext      bytea       not null,
    auth_tag        bytea       not null,
    enc_key_version integer     not null default 1,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
