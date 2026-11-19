\set ON_ERROR_STOP on
-- FR-069: despesa do cuidado, comprovante no repositório privado e separação de audiência.
\ir financeiro_base_local.sql

do $$ declare r jsonb; begin
 r:=public.financeiro_chamar_fixture('api.financeiro_concessao_privado','api.gravar_concessao_financeira',
  jsonb_build_object('concessao_id','30000000-0000-4000-8000-000000000003','habilitado',true,'versao_esperada',0,
   'chave_idempotencia','marca-despesa','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if r->>'ok' is distinct from 'true' then raise exception 'MARCA_FALHOU: %',r; end if;
end $$;

create function public.financeiro_despesa_entrada_fixture(p_despesa uuid,p_chave text,p_digest text,p_valor bigint,p_objeto text) returns jsonb
 language sql as $$ select jsonb_build_object(
  'despesa_id',p_despesa,'paciente_id','40000000-0000-4000-8000-000000000001',
  'descricao_cifrada',public.financeiro_envelope_fixture(),'valor_centavos',p_valor,
  'data','2026-11-10','responsavel_usuario_id','10000000-0000-4000-8000-000000000002',
  'autorizacao_cifrada',public.financeiro_envelope_fixture(),
  'comprovante',jsonb_build_object('objeto_nome',p_objeto,'mime_type','application/pdf','tamanho_bytes',2048,'digest','sha256-ficticio'),
  'chave_idempotencia',p_chave,'digest_idempotencia',p_digest,'auditoria_id',gen_random_uuid()); $$;

-- 2.1/2.2 — registro válido, com auditoria na mesma transação.
do $$ declare r jsonb; begin
 r:=public.financeiro_despesa_fixture('api.registrar_despesa',
  public.financeiro_despesa_entrada_fixture('70000000-0000-4000-8000-000000000001','despesa-1',repeat('a',43),15000,'comprovantes/ficticio-1.pdf'),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' then raise exception 'REGISTRO_FALHOU: %',r; end if;
 if not exists(select 1 from auditoria.evento where acao='api.registrar_despesa' and resultado='permitido' and objeto_id='70000000-0000-4000-8000-000000000001') then raise exception 'AUDITORIA_AUSENTE'; end if;
end $$;

-- 2.1 — despesa sem autorização aplicável e despesa sem caso vinculado são recusadas.
do $$ declare e jsonb; antes bigint; begin
 select count(*) into antes from financeiro.despesa_lancamento;
 e:=public.financeiro_despesa_entrada_fixture('70000000-0000-4000-8000-000000000002','despesa-2',repeat('b',43),15000,'comprovantes/ficticio-2.pdf');
 begin
  perform public.financeiro_despesa_fixture('api.registrar_despesa',e-'autorizacao_cifrada','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
  raise exception 'SEM_AUTORIZACAO_ACEITA';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.financeiro_despesa_fixture('api.registrar_despesa',e-'paciente_id','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
  raise exception 'SEM_CASO_ACEITA';
 exception when invalid_parameter_value then null; end;
 if (select count(*) from financeiro.despesa_lancamento)<>antes then raise exception 'RECUSA_PERSISTIU_LINHA'; end if;
 -- A recusa é do banco, não só da RPC: as colunas são NOT NULL com chave estrangeira.
 if exists(select 1 from information_schema.columns where table_schema='financeiro' and table_name='despesa_lancamento' and column_name in ('paciente_id','autorizacao_cifrada') and is_nullable='YES') then raise exception 'COLUNA_OPCIONAL'; end if;
end $$;

-- 2.1 — valor elevado entra sem etapa de aprovação e sem ficar pendente.
do $$ declare r jsonb; begin
 r:=public.financeiro_despesa_fixture('api.registrar_despesa',
  public.financeiro_despesa_entrada_fixture('70000000-0000-4000-8000-000000000003','despesa-alta',repeat('h',43),1000000000,'comprovantes/ficticio-alto.pdf'),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,valor_centavos}' is distinct from '1000000000' then raise exception 'VALOR_ALTO_RECUSADO: %',r; end if;
 if exists(select 1 from information_schema.columns where table_schema='financeiro' and table_name='despesa_lancamento' and (column_name like '%aprov%' or column_name like '%pendent%' or column_name like '%teto%')) then raise exception 'COLUNA_DE_APROVACAO_EXISTE'; end if;
end $$;

-- 2.6 — retificação preserva o lançamento original; nada é apagado.
do $$ declare r jsonb; begin
 r:=public.financeiro_despesa_fixture('api.retificar_despesa',jsonb_build_object(
   'despesa_id','70000000-0000-4000-8000-000000000001','retificacao_id','70000000-0000-4000-8000-00000000000a',
   'descricao_cifrada',public.financeiro_envelope_fixture(),'valor_centavos',12000,
   'data','2026-11-10','responsavel_usuario_id','10000000-0000-4000-8000-000000000002',
   'autorizacao_cifrada',public.financeiro_envelope_fixture(),
   'motivo_retificacao_cifrado',public.financeiro_envelope_fixture(),
   'chave_idempotencia','retifica-1','digest_idempotencia',repeat('r',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '2' then raise exception 'RETIFICACAO_FALHOU: %',r; end if;
 if not exists(select 1 from financeiro.despesa_lancamento where despesa_id='70000000-0000-4000-8000-000000000001' and versao=1 and valor_centavos=15000 and autor_usuario_id='10000000-0000-4000-8000-000000000003') then raise exception 'ORIGINAL_APAGADO'; end if;
 begin delete from financeiro.despesa_lancamento; raise exception 'DELETE_ACEITO'; exception when feature_not_supported then null; end;
 begin update financeiro.despesa_lancamento set valor_centavos=1; raise exception 'UPDATE_ACEITO'; exception when feature_not_supported then null; end;
end $$;

-- 2.5 — audiência de cuidado não alcança despesa, nem pelo profissional com vínculo ativo,
-- nem pelo familiar com fundamento de autorização vigente.
do $$ declare r jsonb; begin
 if not exists(select 1 from cadastro.acesso_paciente where usuario_id='10000000-0000-4000-8000-000000000002' and paciente_id='40000000-0000-4000-8000-000000000001' and revogada_em is null) then raise exception 'FIXTURE_SEM_VINCULO'; end if;
 r:=public.financeiro_despesa_fixture('api.consultar_despesas',jsonb_build_object('paciente_id','40000000-0000-4000-8000-000000000001'),'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'PROFISSIONAL_COM_VINCULO_ACEITO: %',r; end if;
 if not exists(select 1 from cadastro.acesso_paciente where usuario_id='10000000-0000-4000-8000-000000000004' and revogada_em is null) then raise exception 'FIXTURE_SEM_FUNDAMENTO'; end if;
 r:=public.financeiro_despesa_fixture('api.consultar_despesas',jsonb_build_object('paciente_id','40000000-0000-4000-8000-000000000001'),'10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FAMILIAR_COM_FUNDAMENTO_ACEITO: %',r; end if;
end $$;
-- 2.5 — por acesso direto ao banco, inclusive pelo papel dono da trilha de cuidado.
set role ffcmapp_tarefa_owner;
do $$ begin
 begin perform 1 from financeiro.despesa_lancamento; raise exception 'OWNER_DE_CUIDADO_LE_DESPESA';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ begin
 begin perform 1 from financeiro.despesa_lancamento; raise exception 'AUTHENTICATED_LE_DESPESA';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 2.3/2.4 — comprovante no repositório privado, com política ligada à concessão financeira.
do $$ begin
 if exists(select 1 from storage.buckets where id='financeiro-comprovantes' and public) then raise exception 'BALDE_PUBLICO'; end if;
end $$;
-- Quem lançou envia os bytes.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}',false);
set role authenticated;
insert into storage.objects(bucket_id,name,metadata) values('financeiro-comprovantes','comprovantes/ficticio-1.pdf',jsonb_build_object('mimetype','application/pdf','size',2048));
do $$ begin
 if not exists(select 1 from storage.objects where bucket_id='financeiro-comprovantes' and name='comprovantes/ficticio-1.pdf') then raise exception 'LEITURA_AUTORIZADA_FALHOU'; end if;
 -- Objeto sem despesa correspondente não entra, nem com audiência financeira.
 begin
  insert into storage.objects(bucket_id,name,metadata) values('financeiro-comprovantes','comprovantes/avulso.pdf',jsonb_build_object('mimetype','application/pdf','size',10));
  raise exception 'OBJETO_AVULSO_ACEITO';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Profissional com vínculo no caso e familiar com fundamento não leem o comprovante.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='financeiro-comprovantes') then raise exception 'CUIDADO_LE_COMPROVANTE'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","session_id":"20000000-0000-4000-8000-000000000004","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='financeiro-comprovantes') then raise exception 'FAMILIAR_LE_COMPROVANTE'; end if;
end $$;
reset role;
-- Sem sessão nenhuma: anon não alcança o balde.
set role anon;
do $$ begin
 begin
  if exists(select 1 from storage.objects where bucket_id='financeiro-comprovantes') then raise exception 'ANON_LE_COMPROVANTE'; end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 2.4 — revogar a concessão financeira nega a leitura SEGUINTE, sem invalidar nada emitido.
do $$ declare r jsonb; begin
 r:=public.financeiro_chamar_fixture('api.financeiro_concessao_privado','api.gravar_concessao_financeira',
  jsonb_build_object('concessao_id','30000000-0000-4000-8000-000000000003','habilitado',false,'versao_esperada',1,
   'chave_idempotencia','marca-revoga','digest_idempotencia',repeat('z',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if r->>'ok' is distinct from 'true' or r#>>'{dados,habilitado}' is distinct from 'false' then raise exception 'REVOGACAO_FALHOU: %',r; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='financeiro-comprovantes') then raise exception 'REVOGACAO_NAO_NEGOU_LEITURA'; end if;
end $$;
reset role;
do $$ declare r jsonb; begin
 r:=public.financeiro_despesa_fixture('api.consultar_despesas',jsonb_build_object('paciente_id','40000000-0000-4000-8000-000000000001'),'10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO_NAO_NEGOU_RPC: %',r; end if;
 -- Toda tentativa sobre o comprovante é auditada, permitida ou negada.
 if not exists(select 1 from auditoria.evento where acao='storage.consultar_comprovante_despesa' and resultado='negado')
  or not exists(select 1 from auditoria.evento where acao='storage.enviar_comprovante_despesa' and resultado='permitido') then raise exception 'AUDITORIA_COMPROVANTE_INCOMPLETA'; end if;
end $$;
\echo 'FINANCEIRO DESPESA OK'
