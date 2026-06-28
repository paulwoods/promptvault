alter table users add column name text;
update users set name = email;
alter table users alter column name set not null;
