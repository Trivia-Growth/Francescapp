-- SOMENTE FIXTURE. Não é migração nem habilita runtime; JWT e canal não provados.
-- Proprietário separado, sem login nem BYPASSRLS, apenas para validação de prova.
create role ffcm_prova_owner_local nologin nosuperuser nobypassrls;
grant usage on schema auth, identidade, public, saida_fixture to ffcm_prova_owner_local;
grant execute on function identidade.travar_renovacao_prova_fixture(uuid,uuid) to ffcm_prova_owner_local;
grant select(id,usuario_id,estado), update(id) on identidade.concessao_equipe to ffcm_prova_owner_local;
grant select(id,ativo), update(id) on public.usuario to ffcm_prova_owner_local;
grant select(session_id,usuario_id,concessao_id,revogada_em), update(session_id) on identidade.sessao to ffcm_prova_owner_local;
grant select(session_id,estado,geracao), update(session_id) on identidade.credencial_sessao to ffcm_prova_owner_local;
grant select(session_id,usuario_id,geracao,verificador), update(session_id) on identidade.prova_saida_fixture to ffcm_prova_owner_local;
alter table identidade.concessao_equipe enable row level security;
alter table public.usuario enable row level security;
alter table identidade.sessao enable row level security;
alter table identidade.credencial_sessao enable row level security;
alter table identidade.prova_saida_fixture enable row level security;
do $$
declare t regclass;
begin
 foreach t in array array['identidade.concessao_equipe'::regclass,'public.usuario'::regclass,
   'identidade.sessao'::regclass,'identidade.credencial_sessao'::regclass,'identidade.prova_saida_fixture'::regclass] loop
  execute format('create policy prova_leitura_local on %s for select to ffcm_prova_owner_local using (true)',t);
  execute format('create policy prova_lock_local on %s for update to ffcm_prova_owner_local using (true) with check (true)',t);
  execute format('create policy prova_sem_alteracao_local on %s as restrictive for update to ffcm_prova_owner_local using (true) with check (false)',t);
 end loop;
end $$;
grant create on schema saida_fixture to ffcm_prova_owner_local;
alter function saida_fixture.autorizar_prova(bigint,bytea) owner to ffcm_prova_owner_local;
revoke create on schema saida_fixture from ffcm_prova_owner_local;
