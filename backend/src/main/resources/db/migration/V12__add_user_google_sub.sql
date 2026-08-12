-- Google becomes a second Login Method (ADR-0011). A User is matched to a
-- Google account by Google's permanent subject identifier, never by email:
-- the email can change at Google and is only a label.
alter table users add column google_sub text;

-- Google's subject is globally unique, so one Google account maps to at most
-- one User. NULL is not unique in Postgres, so password-only Users are unaffected.
create unique index ux_users_google_sub on users (google_sub);

-- A Google-only User has no password.
alter table users alter column password_hash drop not null;

-- "Every User holds at least one Login Method" as a database invariant, not a
-- service-layer convention.
alter table users
    add constraint ck_users_has_credential
    check (password_hash is not null or google_sub is not null);
