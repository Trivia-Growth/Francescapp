-- EXPERIMENTO INSEGURO PARA RUNTIME: xmin indica última escrita, não criação.
-- Uma sessão anterior atualizada nesta transação passa o filtro; wraparound,
-- freeze e semântica de subtransação também exigem análise. Nunca integrar.
create role ffcm_cred_owner_fixture nologin nosuperuser nobypassrls noinherit;
create role ffcm_cred_chamador_fixture nologin nosuperuser nobypassrls noinherit;
grant usage on schema identidade to ffcm_cred_owner_fixture,ffcm_cred_chamador_fixture;
grant select(session_id) on identidade.sessao to ffcm_cred_owner_fixture;
grant select(session_id,estado,geracao,envelope),insert(session_id,estado,geracao,envelope) on identidade.credencial_sessao to ffcm_cred_owner_fixture;
alter table identidade.sessao enable row level security;
alter table identidade.credencial_sessao enable row level security;
create policy cred_xmin_sessao on identidade.sessao for select to ffcm_cred_owner_fixture using (xmin::text=pg_current_xact_id()::text);
create policy cred_xmin_sessao_limite on identidade.sessao as restrictive for select to ffcm_cred_owner_fixture using (xmin::text=pg_current_xact_id()::text);
create policy cred_xmin_credencial on identidade.credencial_sessao for all to ffcm_cred_owner_fixture
 using (exists(select 1 from identidade.sessao s where s.session_id=credencial_sessao.session_id))
 with check (exists(select 1 from identidade.sessao s where s.session_id=credencial_sessao.session_id));
create policy cred_xmin_credencial_limite on identidade.credencial_sessao as restrictive for all to ffcm_cred_owner_fixture
 using (exists(select 1 from identidade.sessao s where s.session_id=credencial_sessao.session_id))
 with check (exists(select 1 from identidade.sessao s where s.session_id=credencial_sessao.session_id));
grant create on schema identidade to ffcm_cred_owner_fixture;
set local role ffcm_cred_owner_fixture;
create function identidade.inserir_credencial_xmin_fixture(p_sessao uuid,p_envelope jsonb)
returns void language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare v_linhas bigint;
begin
 insert into identidade.credencial_sessao(session_id,estado,geracao,envelope) values(p_sessao,'disponivel',1,p_envelope);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 or not exists(select 1 from identidade.credencial_sessao where session_id=p_sessao and estado='disponivel' and geracao=1 and envelope=p_envelope) then
  raise exception using errcode='P0002',message='CREDENCIAL_INCONSISTENTE';
 end if;
end $$;
revoke all on function identidade.inserir_credencial_xmin_fixture(uuid,jsonb) from public,anon,authenticated;
grant execute on function identidade.inserir_credencial_xmin_fixture(uuid,jsonb) to ffcm_cred_chamador_fixture;
reset role;
revoke create on schema identidade from ffcm_cred_owner_fixture;
