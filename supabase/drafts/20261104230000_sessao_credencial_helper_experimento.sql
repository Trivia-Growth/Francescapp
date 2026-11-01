-- EXPERIMENTO sem runtime. Não autentica identidade nem autoriza concessão.
-- O helper insere a sessão nova ele mesmo; não usa xmin nem contexto mutável.
-- Seu owner separado ainda pode ler envelopes: isolamento desse owner exige S-02.
create role ffcm_sesscred_owner_fixture nologin nosuperuser nobypassrls noinherit;
create role ffcm_sesscred_caller_fixture nologin nosuperuser nobypassrls noinherit;
grant usage on schema identidade,auditoria to ffcm_sesscred_owner_fixture;
grant usage on schema identidade to ffcm_sesscred_caller_fixture;
grant select(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo,revogada_em),
 insert(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) on identidade.sessao to ffcm_sesscred_owner_fixture;
grant select(session_id,estado,geracao,envelope),insert(session_id,estado,geracao,envelope) on identidade.credencial_sessao to ffcm_sesscred_owner_fixture;
grant select(session_id,usuario_id,geracao,verificador),insert(session_id,usuario_id,geracao,verificador) on identidade.prova_saida_fixture to ffcm_sesscred_owner_fixture;
grant insert(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcm_sesscred_owner_fixture;
do $$ declare t regclass; begin
 foreach t in array array['identidade.sessao'::regclass,'identidade.credencial_sessao'::regclass,'identidade.prova_saida_fixture'::regclass,'auditoria.evento'::regclass] loop
  execute format('alter table %s enable row level security',t);
  execute format('create policy sesscred_fixture on %s to ffcm_sesscred_owner_fixture using (true) with check (true)',t);
 end loop;
end $$;
grant create on schema identidade to ffcm_sesscred_owner_fixture;
set local role ffcm_sesscred_owner_fixture;
create function identidade.criar_sesscred_fixture(p_sessao uuid,p_usuario uuid,p_concessao uuid,p_versao integer,p_metodo text,p_envelope jsonb,p_prova bytea,p_request uuid)
returns void language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare v_linhas bigint;
begin
 if p_sessao is null or p_usuario is null or p_concessao is null or p_versao is null or p_request is null
  or p_prova is null or octet_length(p_prova)<>32 or jsonb_typeof(p_envelope) is distinct from 'object' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values(p_sessao,p_usuario,p_concessao,p_versao,p_metodo);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='SESSAO_NAO_REGISTRADA'; end if;
 insert into identidade.credencial_sessao(session_id,estado,geracao,envelope) values(p_sessao,'disponivel',1,p_envelope);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='CREDENCIAL_NAO_REGISTRADA'; end if;
 insert into identidade.prova_saida_fixture(session_id,usuario_id,geracao,verificador) values(p_sessao,p_usuario,1,p_prova);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='PROVA_NAO_REGISTRADA'; end if;
 if not exists(select 1 from identidade.sessao s join identidade.credencial_sessao c using(session_id)
  join identidade.prova_saida_fixture p using(session_id) where s.session_id=p_sessao and s.usuario_id=p_usuario
  and s.concessao_id=p_concessao and s.concessao_versao_admissao=p_versao and s.metodo=p_metodo and s.revogada_em is null
  and c.estado='disponivel' and c.geracao=1 and c.envelope=p_envelope and p.usuario_id=p_usuario and p.geracao=1 and p.verificador=p_prova) then
  raise exception using errcode='P0002',message='ADMISSAO_INCONSISTENTE'; end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),p_usuario,'fixture.sesscred.admitir','sessao',p_sessao,'permitido',p_request);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_REGISTRADA'; end if;
end $$;
revoke all on function identidade.criar_sesscred_fixture(uuid,uuid,uuid,integer,text,jsonb,bytea,uuid) from public,anon,authenticated;
grant execute on function identidade.criar_sesscred_fixture(uuid,uuid,uuid,integer,text,jsonb,bytea,uuid) to ffcm_sesscred_caller_fixture;
reset role;
revoke create on schema identidade from ffcm_sesscred_owner_fixture;
