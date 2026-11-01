-- FIXTURE DESCARTÁVEL: policies amplas apenas para testar a composição.
-- Não concede acesso ao runtime, não prova privilégios mínimos nem S-02.
create role ffcm_admissao_owner_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ffcm_admissao_executor_fixture nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema identidade,public,auditoria to ffcm_admissao_owner_fixture;
grant usage on schema identidade to ffcm_admissao_executor_fixture;
grant select(id,usuario_id,estado,versao),update(id) on identidade.concessao_equipe to ffcm_admissao_owner_fixture;
grant select(id,perfil,ativo,versao),update(id) on public.usuario to ffcm_admissao_owner_fixture;
grant select(usuario_id,concessao_id),update(usuario_id) on identidade.excecao_tecnica to ffcm_admissao_owner_fixture;
grant select(session_id,usuario_id,revogada_em),insert(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) on identidade.sessao to ffcm_admissao_owner_fixture;
grant insert(session_id,usuario_id,geracao,verificador) on identidade.prova_saida_fixture to ffcm_admissao_owner_fixture;
-- A comparação de integridade exige SELECT do envelope em todas as linhas da
-- fixture: isto NÃO isola sessões alheias e bloqueia promoção até novo desenho.
grant select(session_id,estado,geracao,envelope),insert(session_id,estado,geracao,envelope) on identidade.credencial_sessao to ffcm_admissao_owner_fixture;
grant select(id),insert(id,ator_usuario_id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcm_admissao_owner_fixture;
do $$ declare t regclass; begin
 foreach t in array array['identidade.concessao_equipe'::regclass,'public.usuario'::regclass,
  'identidade.excecao_tecnica'::regclass,'identidade.sessao'::regclass,
  'identidade.credencial_sessao'::regclass,'identidade.prova_saida_fixture'::regclass,
  'auditoria.evento'::regclass] loop
  execute format('alter table %s enable row level security',t);
  execute format('create policy admissao_owner_fixture on %s to ffcm_admissao_owner_fixture using (true) with check (true)',t);
 end loop;
end $$;
-- UPDATE nas colunas de identidade existe apenas para FOR UPDATE; nenhuma
-- alteração deve passar pela RLS. A credencial não concede UPDATE ao owner.
do $$ declare t regclass; begin
 foreach t in array array['identidade.concessao_equipe'::regclass,'public.usuario'::regclass,'identidade.excecao_tecnica'::regclass] loop
  execute format('create policy admissao_lock_sem_escrita on %s as restrictive for update to ffcm_admissao_owner_fixture using (true) with check (false)',t);
 end loop;
end $$;
grant create on schema identidade to ffcm_admissao_owner_fixture;
alter function identidade.admitir_sessao_tecnica(jsonb) owner to ffcm_admissao_owner_fixture;
alter function identidade.admitir_tecnica_com_prova(jsonb,bytea) owner to ffcm_admissao_owner_fixture;
revoke create on schema identidade from ffcm_admissao_owner_fixture;
alter function identidade.admitir_tecnica_com_prova(jsonb,bytea) security definer;
alter function identidade.admitir_tecnica_com_prova(jsonb,bytea) set row_security=on;
grant execute on function identidade.admitir_tecnica_com_prova(jsonb,bytea) to ffcm_admissao_executor_fixture;
