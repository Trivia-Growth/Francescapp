\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Matriz FR-014 usa apenas banco descartável/dados fictícios.
\ir conversao_diario_tarefa_fixture_local.sql
\ir conversao_diario_tarefa_migrador_local.sql
\ir ../migrations/20261125120000_conversao_diario_tarefa_atomica.sql
create function public.falha_conversao_fixture() returns trigger language plpgsql as $$ begin
 if tg_table_schema='cadastro' and tg_table_name='diario_registro_versao' and current_setting('fixture.conversao_falha_diario',true)='sim' then raise exception 'FALHA_SEGUNDA_ESCRITA_FIXTURE'; end if;
 if tg_table_schema='operacao' and current_setting('fixture.conversao_falha_ledger',true)='sim' then raise unique_violation using message='COLISAO_LEDGER_FIXTURE'; end if;
 if tg_table_schema='auditoria' and new.acao in ('api.converter_diario_tarefa','api.consultar_conversao_diario_tarefa') and current_setting('fixture.conversao_suprimir_auditoria',true)='sim' then return null; end if;
 return new; end $$;
create trigger conversao_falha_diario_fixture before insert on cadastro.diario_registro_versao for each row execute function public.falha_conversao_fixture();
create trigger conversao_falha_ledger_fixture before insert on operacao.conversao_diario_tarefa for each row execute function public.falha_conversao_fixture();
create trigger conversao_auditoria_fixture before insert on auditoria.evento for each row execute function public.falha_conversao_fixture();
-- ACL exata: apenas duas novas wrappers para authenticated, nenhuma função interna,
-- tabela clínica/ledger, Vault ou membership de owner oferecida à aplicação.
do $$ declare assinatura text; papel text; begin
 foreach assinatura in array array['api.conversao_diario_tarefa_privada(jsonb)','api.registrar_negacao_conversao_diario_tarefa(uuid,text,uuid,uuid)'] loop
  if not has_function_privilege('authenticated',to_regprocedure(assinatura),'EXECUTE') or has_function_privilege('anon',to_regprocedure(assinatura),'EXECUTE') or has_function_privilege('service_role',to_regprocedure(assinatura),'EXECUTE') then raise exception 'ACL_WRAPPER_CONVERSAO_INCORRETA'; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(assinatura) and (a.grantee not in (p.proowner,'authenticated'::regrole) or a.is_grantable)) then raise exception 'ACL_WRAPPER_CONVERSAO_EXTRA'; end if;
 end loop;
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(papel,'operacao.conversao_diario_tarefa','SELECT,INSERT,UPDATE,DELETE') or has_function_privilege(papel,'operacao.conversao_diario_tarefa_operacao_privada(jsonb)','EXECUTE') or pg_has_role(papel,'ffcmapp_conversao_diario_tarefa_owner','MEMBER') then raise exception 'GRANT_CONVERSAO_AMPLO'; end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='ffcmapp_conversao_diario_tarefa_owner' and (rolsuper or rolbypassrls or rolcanlogin or rolinherit or rolcreaterole or rolcreatedb))
  or has_column_privilege('ffcmapp_conversao_diario_tarefa_owner','cadastro.diario_registro_versao','conteudo_cifrado','SELECT')
  or has_column_privilege('ffcmapp_conversao_diario_tarefa_owner','cadastro.tarefa_cuidado_versao','conteudo_cifrado','SELECT')
  or has_column_privilege('ffcmapp_conversao_diario_tarefa_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_schema_privilege('ffcmapp_conversao_diario_tarefa_owner','vault','USAGE') then raise exception 'OWNER_CONVERSAO_LE_CLINICA_OU_VAULT'; end if;
end $$;
-- Positiva no executor real da aplicação, sem SUPERUSER/BYPASSRLS.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; origem uuid; tarefa uuid:=gen_random_uuid(); evolucao uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); geracao bigint; t jsonb; r jsonb; recibo jsonb; consulta jsonb; chave text:=gen_random_uuid()::text;
begin
 origem:=public.origem_conversao_fixture(paciente); geracao:=public.reserva_conversao_fixture(ator,paciente,tarefa,reserva);
 consulta:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('c',43),true);
 r:=api.conversao_diario_tarefa_privada(consulta);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FLAG_INICIAL_DESLIGADA_IGNORADA'; end if;
 update identidade.configuracao_sistema set valor='true' where chave='ffcm.diario.conversao_tarefa_ativa';
 r:=api.conversao_diario_tarefa_privada(consulta);
 if r->>'ok' is distinct from 'true' or r->'dados' is distinct from 'null'::jsonb then raise exception 'CONSULTA_VAZIA_DESONESTA'; end if;
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('c',43));
 execute 'set local role authenticated';
 if (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) then raise exception 'EXECUTOR_PRIVILEGIADO'; end if;
 r:=api.conversao_diario_tarefa_privada(t); execute 'reset role';
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'false' or r#>>'{dados,tarefa_id}' is distinct from tarefa::text or r#>>'{dados,evolucao_id}' is distinct from evolucao::text then raise exception 'CONVERSAO_ATOMICA_FALHOU'; end if;
 recibo:=r->'dados';
 if not exists(select 1 from cadastro.tarefa_cuidado where id=tarefa and paciente_id=paciente)
  or not exists(select 1 from cadastro.diario_registro_versao v join cadastro.diario_registro d on d.id=v.diario_registro_id where d.id=evolucao and d.autor_usuario_id=ator and v.estado='publicado' and v.audiencia='equipe' and v.atencao and v.tarefa_id=tarefa and v.responde_registro_id is null)
  or (select count(*) from cadastro.diario_registro_versao where diario_registro_id=origem)<>1
  or (select estado from operacao.reserva_tarefa_cuidado where id=reserva)<>'confirmada' then raise exception 'INTEGRIDADE_ATOMICIDADE_OU_ORIGEM_FALHOU'; end if;
 -- Novo request/IDs/cifra podem variar; digest lógico preservado devolve mesmo recibo.
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,gen_random_uuid()::text,repeat('c',43));
 r:=api.conversao_diario_tarefa_privada(t);
 if r->>'repeticao' is distinct from 'true' or r->'dados' is distinct from recibo then raise exception 'REPLAY_DUPLICOU_OU_REATRIBUIU'; end if;
 r:=api.conversao_diario_tarefa_privada(public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('d',43)));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'DIGEST_DIVERGENTE_ACEITO'; end if;
 -- Outro Profissional vinculado consulta recibo sem se tornar autor da conversão.
 ator:='10000000-0000-4000-8000-000000000003'; perform public.claims_diario_fixture(ator,'20000000-0000-4000-8000-000000000003','oauth');
 r:=api.conversao_diario_tarefa_privada(public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('c',43),true));
 if r->'dados' is distinct from recibo or r#>>'{dados,ator_usuario_id}'<>'10000000-0000-4000-8000-000000000002' then raise exception 'CONSULTA_REATRIBUIU_AUTORIA'; end if;
end $$;
-- Relato familiar também é origem elegível: conversão continua evolução interna,
-- sem alterar autor/audiência da origem e sem se tornar resposta FR-013.
do $$
declare paciente uuid:='40000000-0000-4000-8000-000000000001'; origem uuid; tarefa uuid:=gen_random_uuid(); evolucao uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); geracao bigint; r jsonb;
begin
 origem:=public.origem_conversao_fixture(paciente,'publicado','relato_familiar','10000000-0000-4000-8000-000000000004');
 geracao:=public.reserva_conversao_fixture('10000000-0000-4000-8000-000000000002',paciente,tarefa,reserva);
 r:=api.conversao_diario_tarefa_privada(public.transporte_conversao_fixture('10000000-0000-4000-8000-000000000002',paciente,origem,1,tarefa,evolucao,reserva,geracao,gen_random_uuid()::text,repeat('i',43)));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.diario_registro where id=origem and autor_usuario_id='10000000-0000-4000-8000-000000000004' and tipo='relato_familiar')
  or not exists(select 1 from cadastro.diario_registro_versao where diario_registro_id=evolucao and audiencia='equipe' and responde_registro_id is null) then raise exception 'CONVERSAO_RELATO_AMPLIOU_AUDIENCIA_OU_AUTORIA'; end if;
end $$;
-- Segunda escrita, ledger e auditoria falham depois da tarefa: nenhum efeito parcial.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; origem uuid; tarefa uuid; evolucao uuid; reserva uuid; geracao bigint; t jsonb; r jsonb; modo text; chave text; req uuid;
begin
 foreach modo in array array['diario','diario_recusa','ledger','auditoria'] loop
  perform set_config('fixture.conversao_falha_diario','nao',true); perform set_config('fixture.conversao_falha_ledger','nao',true); perform set_config('fixture.conversao_suprimir_auditoria','nao',true);
  origem:=public.origem_conversao_fixture(paciente); tarefa:=gen_random_uuid(); evolucao:=gen_random_uuid(); reserva:=gen_random_uuid(); chave:=gen_random_uuid()::text; geracao:=public.reserva_conversao_fixture(ator,paciente,tarefa,reserva);
  if modo='diario_recusa' then evolucao:=public.origem_conversao_fixture(paciente); end if;
  t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('e',43)); req:=(t#>>'{entrada,request_id}')::uuid;
  perform set_config('fixture.conversao_falha_diario',case when modo='diario' then 'sim' else 'nao' end,true);
  perform set_config('fixture.conversao_falha_ledger',case when modo='ledger' then 'sim' else 'nao' end,true);
  perform set_config('fixture.conversao_suprimir_auditoria',case when modo='auditoria' then 'sim' else 'nao' end,true);
  if modo='auditoria' then
   begin perform api.conversao_diario_tarefa_privada(t); raise exception 'AUDITORIA_SUPRIMIDA_ACEITA'; exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
  else
   r:=api.conversao_diario_tarefa_privada(t);
   if r#>>'{erro,codigo}' is distinct from (case when modo='diario' then 'servico_indisponivel' else 'conflito' end) then raise exception 'ERRO_SEGUNDA_GRAVACAO_MASCARADO'; end if;
   if not exists(select 1 from auditoria.evento where request_id=req and acao='api.converter_diario_tarefa' and resultado='negado') then raise exception 'NEGATIVA_EXTERNA_AUSENTE'; end if;
  end if;
  if exists(select 1 from cadastro.tarefa_cuidado where id=tarefa) or (modo<>'diario_recusa' and exists(select 1 from cadastro.diario_registro where id=evolucao)) or (modo='diario_recusa' and (select count(*) from cadastro.diario_registro_versao where diario_registro_id=evolucao)<>1) or exists(select 1 from operacao.conversao_diario_tarefa where origem_id=origem)
   or exists(select 1 from operacao.requisicao where chave_idempotencia=chave) or (select estado from operacao.reserva_tarefa_cuidado where id=reserva)<>'aberta'
   or exists(select 1 from auditoria.evento where request_id=req and acao in ('api.gravar_tarefa_cuidado','api.gravar_diario')) then raise exception 'EFEITO_PARCIAL_APOS_FALHA'; end if;
 end loop;
 perform set_config('fixture.conversao_falha_diario','nao',true); perform set_config('fixture.conversao_falha_ledger','nao',true); perform set_config('fixture.conversao_suprimir_auditoria','nao',true);
end $$;
\ir conversao_diario_tarefa_negativas_local.sql
\ir conversao_diario_tarefa_concorrencia_local.sql
-- Nenhuma execução futura desta matriz liga produção ou deixa fixture ligada.
update identidade.configuracao_sistema set valor='false' where chave='ffcm.diario.conversao_tarefa_ativa';
