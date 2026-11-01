create schema auth;
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id));
create table auth.identities (id uuid primary key, user_id uuid references auth.users(id));
alter table auth.identities disable trigger all;
\ir ../migrations/20261106180000_bloqueios_auth.sql
