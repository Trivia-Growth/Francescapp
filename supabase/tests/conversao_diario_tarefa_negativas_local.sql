-- PREPARADO, NÃO EXECUTADO. Negativas não podem revelar recibo ou deixar domínio parcial.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; origem uuid; tarefa uuid:=gen_random_uuid(); evolucao uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); geracao bigint; t jsonb; e jsonb; filha jsonb; r jsonb; chave text:=gen_random_uuid()::text; flag text; outro uuid;
begin
 origem:=public.origem_conversao_fixture(paciente); geracao:=public.reserva_conversao_fixture(ator,paciente,tarefa,reserva);
 foreach flag in array array['ffcm.diario.conversao_tarefa_ativa','ffcm.diario.ativo','ffcm.tarefas.ativas','ffcm.tarefas.escrita_ativa','ffcm.tarefas.barreira_ativa'] loop
  update identidade.configuracao_sistema set valor='false' where chave=flag;
  t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43));
  r:=api.conversao_diario_tarefa_privada(t);
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FLAG_CONVERSAO_IGNORADA: %',flag; end if;
  update identidade.configuracao_sistema set valor='true' where chave=flag;
 end loop;
 foreach outro in array array['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000004'::uuid] loop
  perform public.claims_diario_fixture(outro,replace(outro::text,'10000000-','20000000-')::uuid,case when outro='10000000-0000-4000-8000-000000000004' then 'password' else 'oauth' end);
  t:=public.transporte_conversao_fixture(outro,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43));
  r:=api.conversao_diario_tarefa_privada(t);
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'PERFIL_SEM_PERMISSAO_CONVERTEU'; end if;
 end loop;
 perform public.claims_diario_fixture(ator,sessao,'oauth');
 t:=public.transporte_conversao_fixture(ator,'40000000-0000-4000-8000-000000000002',origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43));
 r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'OUTRO_CASO_CONVERTEU'; end if;
 t:=public.transporte_conversao_fixture(ator,paciente,public.origem_conversao_fixture(paciente,'rascunho'),1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43));
 r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'RASCUNHO_CONVERTIDO'; end if;
 t:=public.transporte_conversao_fixture(ator,paciente,origem,2,tarefa,evolucao,reserva,geracao,chave,repeat('f',43));
 r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'VERSAO_DESATUALIZADA_CONVERTEU'; end if;
 -- Alterar a origem sem renovar HMAC agregado não pode reaproveitar atestados filhos.
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43));
 t:=jsonb_set(t,'{entrada,origem_id}',to_jsonb(gen_random_uuid())); r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ORIGEM_FORJADA_ACEITA'; end if;
 -- Mesmo agregado assinado não dispensa correspondência do request da filha.
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43)); e:=t->'entrada'-'atestado';
 filha:=e#>'{tarefa,entrada}'-'atestado'; filha:=filha||jsonb_build_object('request_id',gen_random_uuid());
 e:=jsonb_set(e,'{tarefa}',public.assinar_diario_fixture(filha,'api.gravar_tarefa_cuidado',ator,sessao));
 r:=api.conversao_diario_tarefa_privada(public.assinar_diario_fixture(e,'api.converter_diario_tarefa',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REQUEST_FILHA_DIVERGENTE_ACEITO'; end if;
 -- Audiência e resposta FR-013 não podem ser ampliadas pelo agregado.
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43)); e:=t->'entrada'-'atestado';
 filha:=e#>'{diario,entrada}'-'atestado'; filha:=filha||jsonb_build_object('audiencia','equipe_e_familia','responde_registro_id',origem);
 e:=jsonb_set(e,'{diario}',public.assinar_diario_fixture(filha,'api.gravar_diario',ator,sessao));
 r:=api.conversao_diario_tarefa_privada(public.assinar_diario_fixture(e,'api.converter_diario_tarefa',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'RETORNO_FAMILIAR_IMPLICITO_ACEITO'; end if;
 -- Área fora do catálogo é negada, mesmo que ambas assinaturas sejam válidas.
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43)); e:=t->'entrada'-'atestado';
 filha:=e#>'{diario,entrada}'-'atestado'; filha:=filha||jsonb_build_object('area','Área não configurada');
 e:=jsonb_set(e,'{diario}',public.assinar_diario_fixture(filha,'api.gravar_diario',ator,sessao));
 r:=api.conversao_diario_tarefa_privada(public.assinar_diario_fixture(e,'api.converter_diario_tarefa',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AREA_NAO_CONFIGURADA_ACEITA'; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43)); r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'VINCULO_REVOGADO_CONVERTEU'; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=paciente and usuario_id=ator;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43)); r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA_CONVERTEU'; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43)); r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_REVOGADA_CONVERTEU'; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 if exists(select 1 from cadastro.tarefa_cuidado where id=tarefa) or exists(select 1 from cadastro.diario_registro where id=evolucao) or exists(select 1 from operacao.conversao_diario_tarefa where origem_id=origem) then raise exception 'NEGATIVA_GRAVOU_DOMINIO'; end if;
 -- Negativa após acesso revogado não revela nem recibo que já existe.
 select origem_id into origem from operacao.conversao_diario_tarefa limit 1;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_concessao_cifrado where paciente_id=paciente and usuario_id=ator;
 t:=public.transporte_conversao_fixture(ator,paciente,origem,1,tarefa,evolucao,reserva,geracao,chave,repeat('f',43),true); r:=api.conversao_diario_tarefa_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'RECIBO_REVELOU_APOS_REVOGACAO'; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=paciente and usuario_id=ator;
end $$;
-- Auditoria anterior ao cofre: só a própria negativa, sem domínio/recibo/HMAC.
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000004'; sessao uuid:='20000000-0000-4000-8000-000000000004'; req uuid:=gen_random_uuid(); antes bigint; acao text;
begin
 perform public.claims_diario_fixture(ator,sessao,'password'); select count(*) into antes from operacao.conversao_diario_tarefa;
 execute 'set local role authenticated';
 foreach acao in array array['api.consultar_conversao_diario_tarefa','api.converter_diario_tarefa'] loop
  if api.registrar_negacao_conversao_diario_tarefa(req,acao,gen_random_uuid(),gen_random_uuid()) is distinct from true then raise exception 'NEGATIVA_PRE_COFRE_FALHOU'; end if;
 end loop;
 begin perform api.registrar_negacao_conversao_diario_tarefa(req,'api.gravar_diario',null,null); raise exception 'ACAO_LIVRE_NO_AUDITADOR'; exception when insufficient_privilege then null; end;
 begin perform api.registrar_negacao_conversao_diario_tarefa(req,'api.converter_diario_tarefa',null,null,gen_random_uuid()); raise exception 'ATOR_EXTRA_NO_AUDITADOR'; exception when undefined_function then null; end;
 begin perform 1 from operacao.conversao_diario_tarefa; raise exception 'LEDGER_DIRETO_EXPOSTO'; exception when insufficient_privilege then null; end;
 begin perform operacao.conversao_diario_tarefa_operacao_privada('{}'); raise exception 'FUNCAO_INTERNA_EXPOSTA'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 if (select count(*) from operacao.conversao_diario_tarefa)<>antes or not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=ator and resultado='negado') then raise exception 'NEGATIVA_PRE_COFRE_MUTOU_OU_NAO_AUDITOU'; end if;
 perform public.claims_diario_fixture('10000000-0000-4000-8000-000000000002',sessao,'oauth');
 begin perform api.registrar_negacao_conversao_diario_tarefa(req,'api.converter_diario_tarefa',null,null); raise exception 'ATOR_SESSAO_FORJADOS'; exception when insufficient_privilege then null; end;
 perform public.claims_diario_fixture(ator,sessao,'password'); perform set_config('fixture.conversao_suprimir_auditoria','sim',true);
 begin perform api.registrar_negacao_conversao_diario_tarefa(gen_random_uuid(),'api.converter_diario_tarefa',null,null); raise exception 'NEGATIVA_PRE_COFRE_SEM_AUDITORIA'; exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 perform set_config('fixture.conversao_suprimir_auditoria','nao',true);
end $$;
-- Conta Auth ainda não admitida também registra sua própria negativa, sem criar perfil.
insert into auth.users values('10000000-0000-4000-8000-000000000099');
insert into auth.sessions values('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099',null);
do $$ declare req uuid:=gen_random_uuid(); begin
 perform public.claims_diario_fixture('10000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000099','password');
 execute 'set local role authenticated';
 if api.registrar_negacao_conversao_diario_tarefa(req,'api.converter_diario_tarefa',null,null) is distinct from true then raise exception 'AUDITORIA_AUTH_NAO_ADMITIDO_FALHOU'; end if;
 execute 'reset role';
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id='10000000-0000-4000-8000-000000000099' and ator_usuario_id is null and resultado='negado') or exists(select 1 from public.usuario where id='10000000-0000-4000-8000-000000000099') then raise exception 'AUTH_NAO_ADMITIDO_INVENTOU_PERFIL'; end if;
 update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='20000000-0000-4000-8000-000000000099';
 begin perform api.registrar_negacao_conversao_diario_tarefa(gen_random_uuid(),'api.converter_diario_tarefa',null,null); raise exception 'AUTH_EXPIRADO_AUDITOU'; exception when insufficient_privilege then null; end;
 update auth.sessions set not_after=null where id='20000000-0000-4000-8000-000000000099';
end $$;
set role anon;
do $$ begin
 begin perform api.conversao_diario_tarefa_privada('{}'); raise exception 'ANONIMO_WRAPPER_CONVERSAO'; exception when insufficient_privilege then null; end;
 begin perform api.registrar_negacao_conversao_diario_tarefa(gen_random_uuid(),'api.converter_diario_tarefa',null,null); raise exception 'ANONIMO_AUDITADOR_CONVERSAO'; exception when insufficient_privilege then null; end;
end $$;
reset role;
