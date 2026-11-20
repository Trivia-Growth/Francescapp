\set ON_ERROR_STOP on
\ir financeiro_base_local.sql

-- 1.3 — concessão financeira AUSENTE: 003 ainda não tem a marca.
do $$ declare r jsonb; begin
 r:=public.financeiro_valor_fixture('api.consultar_valor_acordado',jsonb_build_object('profissional_usuario_id','10000000-0000-4000-8000-000000000002'),'10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'CONCESSAO_AUSENTE_ACEITA: %',r; end if;
 if not exists(select 1 from auditoria.evento where acao='api.consultar_valor_acordado' and resultado='negado' and ator_usuario_id='10000000-0000-4000-8000-000000000003') then raise exception 'AUDITORIA_NEGACAO_AUSENTE'; end if;
end $$;

-- 1.3 — a marca é conferida por RPC administrativa; nem o próprio interessado a concede.
do $$ declare r jsonb; begin
 r:=public.financeiro_chamar_fixture('api.financeiro_concessao_privado','api.gravar_concessao_financeira',
  jsonb_build_object('concessao_id','30000000-0000-4000-8000-000000000003','habilitado',true,'versao_esperada',0,
   'chave_idempotencia','marca-auto','digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AUTOCONCESSAO_ACEITA: %',r; end if;
 r:=public.financeiro_chamar_fixture('api.financeiro_concessao_privado','api.gravar_concessao_financeira',
  jsonb_build_object('concessao_id','30000000-0000-4000-8000-000000000003','habilitado',true,'versao_esperada',0,
   'chave_idempotencia','marca-admin','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,habilitado}' is distinct from 'true' then raise exception 'CONCESSAO_ADMIN_FALHOU: %',r; end if;
end $$;

-- A marca não cabe em concessão de administrador: CHECK próprio, nome próprio.
do $$ begin
 begin
  update identidade.concessao_equipe set habilitado_financeiro=true where id='30000000-0000-4000-8000-000000000001';
  raise exception 'CHECK_PERFIL_NAO_APLICADO';
 exception when check_violation then null; end;
end $$;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='concessao_habilitacao_financeira_perfil_chk' and conrelid='identidade.concessao_equipe'::regclass) then raise exception 'CHECK_PROPRIO_AUSENTE'; end if;
 -- A marca de crise continua com o CHECK dela, intocado.
 if not exists(select 1 from pg_constraint where conname='concessao_habilitacao_perfil_chk' and conrelid='identidade.concessao_equipe'::regclass) then raise exception 'CHECK_CRISE_PERDIDO'; end if;
end $$;

-- 1.3/1.5 — concessão VIGENTE: registra, audita e devolve.
do $$ declare r jsonb; aud uuid:=gen_random_uuid(); begin
 r:=public.financeiro_valor_fixture('api.registrar_valor_acordado',jsonb_build_object(
   'valor_id','60000000-0000-4000-8000-000000000001','profissional_usuario_id','10000000-0000-4000-8000-000000000002',
   'valor_turno_centavos',24000,'vigencia_inicio','2026-11-01','vigencia_fim',null,
   'motivo_cifrado',public.financeiro_envelope_fixture(),'chave_idempotencia','valor-1','digest_idempotencia',repeat('d',43),'auditoria_id',aud),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,valor_turno_centavos}' is distinct from '24000' then raise exception 'REGISTRO_FALHOU: %',r; end if;
 if not exists(select 1 from auditoria.evento where id=aud and acao='api.registrar_valor_acordado' and resultado='permitido') then raise exception 'AUDITORIA_REGISTRO_AUSENTE'; end if;
end $$;

-- 1.4 — vigência sobreposta recusada pelo banco, e nada é criado.
do $$ declare r jsonb; antes bigint; begin
 select count(*) into antes from financeiro.valor_acordado_turno;
 r:=public.financeiro_valor_fixture('api.registrar_valor_acordado',jsonb_build_object(
   'valor_id','60000000-0000-4000-8000-000000000002','profissional_usuario_id','10000000-0000-4000-8000-000000000002',
   'valor_turno_centavos',30000,'vigencia_inicio','2026-11-15','vigencia_fim','2026-12-01',
   'motivo_cifrado',public.financeiro_envelope_fixture(),'chave_idempotencia','valor-2','digest_idempotencia',repeat('e',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'SOBREPOSICAO_ACEITA: %',r; end if;
 if (select count(*) from financeiro.valor_acordado_turno)<>antes then raise exception 'SOBREPOSICAO_CRIOU_LINHA'; end if;
 if not exists(select 1 from pg_constraint where conname='valor_acordado_sem_sobreposicao' and contype='x') then raise exception 'EXCLUSION_AUSENTE'; end if;
end $$;

-- 1.5 — alteração cria nova vigência; a anterior permanece consultável.
do $$ declare r jsonb; begin
 r:=public.financeiro_valor_fixture('api.alterar_valor_acordado',jsonb_build_object(
   'valor_id','60000000-0000-4000-8000-000000000003','profissional_usuario_id','10000000-0000-4000-8000-000000000002',
   'valor_turno_centavos',30000,'vigencia_anterior_id','60000000-0000-4000-8000-000000000001','vigente_a_partir_de','2026-11-16',
   'motivo_cifrado',public.financeiro_envelope_fixture(),'chave_idempotencia','valor-3','digest_idempotencia',repeat('f',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' then raise exception 'ALTERACAO_FALHOU: %',r; end if;
 if not exists(select 1 from financeiro.valor_acordado_turno where id='60000000-0000-4000-8000-000000000001' and valor_turno_centavos=24000 and upper(vigencia)='2026-11-16'::date and encerrada_em is not null) then raise exception 'VIGENCIA_ANTERIOR_PERDIDA'; end if;
 r:=public.financeiro_valor_fixture('api.consultar_valor_acordado',jsonb_build_object('profissional_usuario_id','10000000-0000-4000-8000-000000000002'),'10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if jsonb_array_length(r->'dados')<>2 then raise exception 'HISTORICO_INCOMPLETO: %',r; end if;
end $$;

-- Nada é apagado e nada é reescrito: o gatilho recusa DELETE e UPDATE fora do fechamento.
do $$ begin
 begin delete from financeiro.valor_acordado_turno; raise exception 'DELETE_ACEITO';
 exception when feature_not_supported then null; end;
 begin update financeiro.valor_acordado_turno set valor_turno_centavos=1 where id='60000000-0000-4000-8000-000000000001'; raise exception 'UPDATE_ACEITO';
 exception when feature_not_supported then null; end;
end $$;

-- 1.6 — profissional apurado não consulta o próprio valor, nem o de ninguém.
do $$ declare r jsonb; begin
 r:=public.financeiro_valor_fixture('api.consultar_valor_acordado',jsonb_build_object('profissional_usuario_id','10000000-0000-4000-8000-000000000002'),'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'PROPRIO_VALOR_EXPOSTO: %',r; end if;
 -- A negativa não revela se existe registro: a resposta é idêntica para profissional sem registro.
 r:=public.financeiro_valor_fixture('api.consultar_valor_acordado',jsonb_build_object('profissional_usuario_id','10000000-0000-4000-8000-000000000004'),'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'NEGATIVA_DIVERGENTE: %',r; end if;
end $$;

-- 1.6 — familiar com fundamento de autorização no caso não acessa valores.
do $$ declare r jsonb; begin
 r:=public.financeiro_valor_fixture('api.consultar_valor_acordado',jsonb_build_object('profissional_usuario_id','10000000-0000-4000-8000-000000000002'),'10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FAMILIAR_COM_FUNDAMENTO_ACEITO: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=motivo_concessao_cifrado where id='91000000-0000-4000-8000-000000000004';
 r:=public.financeiro_valor_fixture('api.consultar_valor_acordado',jsonb_build_object('profissional_usuario_id','10000000-0000-4000-8000-000000000002'),'10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIAR_SEM_FUNDAMENTO_ACEITO: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where id='91000000-0000-4000-8000-000000000004';
end $$;

-- 1.7 — separação na direção "audiência de cuidado não alcança financeiro", por acesso direto.
set role ffcmapp_tarefa_owner;
do $$ begin
 begin perform 1 from financeiro.valor_acordado_turno; raise exception 'OWNER_DE_CUIDADO_LE_FINANCEIRO';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- 1.7 — direção inversa: o papel da audiência financeira não alcança conteúdo clínico.
do $$ declare t text; begin
 foreach t in array array['cadastro.acesso_paciente','cadastro.paciente','cadastro.tarefa_cuidado','cadastro.turno','cadastro.anamnese_versao'] loop
  if has_table_privilege('ffcmapp_financeiro_owner',t,'SELECT,INSERT,UPDATE,DELETE')
   or has_table_privilege('ffcmapp_financeiro_audiencia_owner',t,'SELECT,INSERT,UPDATE,DELETE') then
   raise exception 'AUDIENCIA_FINANCEIRA_ALCANCA_CLINICO: %',t; end if;
 end loop;
 if pg_has_role('ffcmapp_financeiro_owner','ffcmapp_tarefa_owner','MEMBER')
  or pg_has_role('ffcmapp_tarefa_owner','ffcmapp_financeiro_owner','MEMBER') then raise exception 'MEMBERSHIP_CRUZADA'; end if;
end $$;

-- ACL exata das tabelas financeiras novas: nenhum privilégio direto para os papéis da aplicação.
do $$ declare papel text; begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(papel,'financeiro.valor_acordado_turno','SELECT,INSERT,UPDATE,DELETE')
   or has_schema_privilege(papel,'financeiro','USAGE')
   or has_function_privilege(papel,'api.financeiro_valor_privado(jsonb)','EXECUTE')
   or has_function_privilege(papel,'operacao.financeiro_audiencia_privada(uuid,uuid)','EXECUTE')
   or has_function_privilege(papel,'operacao.financeiro_atestado_privada(jsonb,text[])','EXECUTE')
   or pg_has_role(papel,'ffcmapp_financeiro_owner','MEMBER')
   or pg_has_role(papel,'ffcmapp_financeiro_audiencia_owner','MEMBER') then raise exception 'ACL_AMPLA: %',papel; end if;
 end loop;
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='api.financeiro_valor_privado(jsonb)'::regprocedure and r.rolname='ffcmapp_financeiro_owner' and p.prosecdef and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin) then raise exception 'OWNER_INSEGURO'; end if;
end $$;
\echo 'FINANCEIRO VALOR ACORDADO OK'
