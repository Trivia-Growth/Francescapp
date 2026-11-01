-- FIXTURE descartável: não é migração, identidade runtime ou integração Auth.
create role ffcm_desafio_owner_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcm_desafio_executor_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema identidade to ffcm_desafio_owner_fixture,ffcm_desafio_executor_fixture;
grant select(id,nonce_hash,expira_em,consumido_em,criado_em),
 insert(id,nonce_hash,expira_em),update(consumido_em) on identidade.desafio_login to ffcm_desafio_owner_fixture;
alter table identidade.desafio_login enable row level security;
create policy desafio_fixture_select on identidade.desafio_login for select to ffcm_desafio_owner_fixture using (true);
create policy desafio_fixture_insert on identidade.desafio_login for insert to ffcm_desafio_owner_fixture with check (true);
create policy desafio_fixture_update on identidade.desafio_login for update to ffcm_desafio_owner_fixture using (consumido_em is null) with check (consumido_em is not null);
create policy desafio_fixture_irreversivel on identidade.desafio_login as restrictive for update to ffcm_desafio_owner_fixture using (consumido_em is null) with check (consumido_em is not null);
grant create on schema identidade to ffcm_desafio_owner_fixture;
alter function identidade.registrar_desafio_google(uuid,text,timestamptz) owner to ffcm_desafio_owner_fixture;
alter function identidade.consumir_desafio_google(uuid,text) owner to ffcm_desafio_owner_fixture;
alter function identidade.registrar_desafio_google(uuid,text,timestamptz) security definer;
alter function identidade.consumir_desafio_google(uuid,text) security definer;
alter function identidade.registrar_desafio_google(uuid,text,timestamptz) set row_security=on;
alter function identidade.consumir_desafio_google(uuid,text) set row_security=on;
revoke create on schema identidade from ffcm_desafio_owner_fixture;
grant execute on function identidade.registrar_desafio_google(uuid,text,timestamptz),identidade.consumir_desafio_google(uuid,text) to ffcm_desafio_executor_fixture;
