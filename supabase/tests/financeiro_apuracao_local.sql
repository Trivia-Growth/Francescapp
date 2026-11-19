\set ON_ERROR_STOP on
-- FR-070: apuração de repasse como consulta derivada, com pendências identificadas,
-- instante da consulta e nenhum conteúdo de saúde no retorno.
\ir financeiro_base_local.sql

do $$ declare r jsonb; begin
 r:=public.financeiro_chamar_fixture('api.financeiro_concessao_privado','api.gravar_concessao_financeira',
  jsonb_build_object('concessao_id','30000000-0000-4000-8000-000000000003','habilitado',true,'versao_esperada',0,
   'chave_idempotencia','marca-apuracao','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
 if r->>'ok' is distinct from 'true' then raise exception 'MARCA_FALHOU: %',r; end if;
 -- V1 [2026-11-03, 2026-11-16) = 240,00; V2 [2026-11-16, aberta) = 300,00.
 r:=public.financeiro_valor_fixture('api.registrar_valor_acordado',jsonb_build_object(
   'valor_id','60000000-0000-4000-8000-000000000001','profissional_usuario_id','10000000-0000-4000-8000-000000000002',
   'valor_turno_centavos',24000,'vigencia_inicio','2026-11-03','vigencia_fim',null,
   'motivo_cifrado',public.financeiro_envelope_fixture(),'chave_idempotencia','v1','digest_idempotencia',repeat('d',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' then raise exception 'V1: %',r; end if;
 r:=public.financeiro_valor_fixture('api.alterar_valor_acordado',jsonb_build_object(
   'valor_id','60000000-0000-4000-8000-000000000002','profissional_usuario_id','10000000-0000-4000-8000-000000000002',
   'valor_turno_centavos',30000,'vigencia_anterior_id','60000000-0000-4000-8000-000000000001','vigente_a_partir_de','2026-11-16',
   'motivo_cifrado',public.financeiro_envelope_fixture(),'chave_idempotencia','v2','digest_idempotencia',repeat('e',43),'auditoria_id',gen_random_uuid()),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' then raise exception 'V2: %',r; end if;
end $$;

-- Turnos fictícios. Semeados direto na fixture: a apuração é consulta, nunca abre turno.
insert into cadastro.turno(id,paciente_id,profissional_usuario_id,aberto_em,encerrado_em,situacao,versao,parametros) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-11-05 08:00+00','2026-11-05 20:00+00','encerrado',2,'{"duracao_padrao_minutos":720}'),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-11-20 08:00+00','2026-11-20 20:00+00','encerrado',2,'{"duracao_padrao_minutos":720}'),
 ('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-11-02 08:00+00','2026-11-02 20:00+00','encerrado',2,'{"duracao_padrao_minutos":720}'),
 ('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-11-10 08:00+00',null,'aberto',1,'{"duracao_padrao_minutos":720}');

create temp table turno_antes as select * from cadastro.turno;

-- 3.1/3.2/3.3/3.5 — apuração do período, com as duas pendências e o instante da consulta.
do $$ declare r jsonb; d jsonb; begin
 r:=public.financeiro_apuracao_fixture('api.executar_apuracao_repasse',jsonb_build_object(
   'profissional_usuario_id','10000000-0000-4000-8000-000000000002','periodo_inicio','2026-11-01','periodo_fim','2026-11-30'),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' then raise exception 'APURACAO_FALHOU: %',r; end if;
 d:=r->'dados';
 if d->>'origem' is distinct from 'consulta_aberta' then raise exception 'ORIGEM_INESPERADA: %',d; end if;
 if d->>'consultado_em' is null then raise exception 'INSTANTE_AUSENTE: %',d; end if;
 if jsonb_array_length(d->'linhas')<>4 then raise exception 'LINHAS_INESPERADAS: %',d; end if;
 -- Valor alterado no meio do período: cada turno pelo valor vigente na sua data.
 if (select l->>'valor_centavos' from jsonb_array_elements(d->'linhas') l where l->>'turno_id'='50000000-0000-4000-8000-000000000001') is distinct from '24000' then raise exception 'VALOR_ANTERIOR_NAO_APLICADO: %',d; end if;
 if (select l->>'valor_centavos' from jsonb_array_elements(d->'linhas') l where l->>'turno_id'='50000000-0000-4000-8000-000000000002') is distinct from '30000' then raise exception 'VALOR_NOVO_NAO_APLICADO: %',d; end if;
 if (select l->>'vigencia_id' from jsonb_array_elements(d->'linhas') l where l->>'turno_id'='50000000-0000-4000-8000-000000000001') is distinct from '60000000-0000-4000-8000-000000000001' then raise exception 'VIGENCIA_NAO_REFERENCIADA: %',d; end if;
 -- Turno sem vigência aplicável: pendente de valor, sem valor presumido.
 if (select l->>'situacao' from jsonb_array_elements(d->'linhas') l where l->>'turno_id'='50000000-0000-4000-8000-000000000003') is distinct from 'pendente_valor'
  or (select l->'valor_centavos' from jsonb_array_elements(d->'linhas') l where l->>'turno_id'='50000000-0000-4000-8000-000000000003') is distinct from 'null'::jsonb then raise exception 'PENDENTE_VALOR_ERRADO: %',d; end if;
 -- Turno aberto e nunca encerrado: pendente de resolução, identificado, sem valor, sem ser omitido.
 if (select l->>'situacao' from jsonb_array_elements(d->'linhas') l where l->>'turno_id'='50000000-0000-4000-8000-000000000004') is distinct from 'pendente_resolucao'
  or (select l->'data' from jsonb_array_elements(d->'linhas') l where l->>'turno_id'='50000000-0000-4000-8000-000000000004') is distinct from 'null'::jsonb then raise exception 'PENDENTE_RESOLUCAO_ERRADO: %',d; end if;
 if d->>'total_centavos' is distinct from '54000' or d->>'pendentes' is distinct from '2' then raise exception 'TOTAL_OU_PENDENTES: %',d; end if;
 -- 3.6 — nenhum conteúdo de saúde no retorno.
 if exists(select 1 from jsonb_array_elements(d->'linhas') l, jsonb_object_keys(l) k
   where k not in ('situacao','turno_id','profissional_usuario_id','data','valor_centavos','vigencia_id')) then raise exception 'CAMPO_ALHEIO_NA_LINHA: %',d; end if;
 if d::text ~ 'paciente_id|parametros|passagem|afericao|medicacao|rotina|ocorrencia|prescricao' then raise exception 'CONTEUDO_CLINICO_NO_RETORNO: %',d; end if;
end $$;

-- 3.6 — a restrição é de privilégio, não de redação da consulta.
do $$ declare c text; begin
 foreach c in array array['paciente_id','parametros'] loop
  if has_column_privilege('ffcmapp_financeiro_apuracao_owner','cadastro.turno',c,'SELECT') then raise exception 'COLUNA_CLINICA_CONCEDIDA: %',c; end if;
 end loop;
 foreach c in array array['id','profissional_usuario_id','aberto_em','encerrado_em','situacao','versao'] loop
  if not has_column_privilege('ffcmapp_financeiro_apuracao_owner','cadastro.turno',c,'SELECT') then raise exception 'COLUNA_NECESSARIA_AUSENTE: %',c; end if;
 end loop;
 -- 3.4 — a apuração não pode criar, alterar nem encerrar turno: o privilégio não existe.
 if has_table_privilege('ffcmapp_financeiro_apuracao_owner','cadastro.turno','INSERT,UPDATE,DELETE') then raise exception 'APURACAO_PODE_ESCREVER_TURNO'; end if;
 if has_table_privilege('ffcmapp_financeiro_apuracao_owner','cadastro.acesso_paciente','SELECT')
  or has_table_privilege('ffcmapp_financeiro_apuracao_owner','financeiro.despesa_lancamento','SELECT') then raise exception 'APURACAO_ALCANCA_ALHEIO'; end if;
end $$;

-- 3.4 — nenhum turno foi criado, alterado ou encerrado pela apuração.
do $$ begin
 if exists(select * from turno_antes except select * from cadastro.turno)
  or exists(select * from cadastro.turno except select * from turno_antes) then raise exception 'APURACAO_ALTEROU_TURNO'; end if;
end $$;

-- 3.5 — retificação de turno reflete na apuração seguinte, e os instantes diferem.
do $$ declare antes jsonb; depois jsonb; begin
 antes:=(public.financeiro_apuracao_fixture('api.consultar_apuracao_repasse',jsonb_build_object(
   'profissional_usuario_id','10000000-0000-4000-8000-000000000002','periodo_inicio','2026-11-01','periodo_fim','2026-11-30'),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003'))->'dados';
 update cadastro.turno set encerrado_em='2026-11-18 20:00+00',versao=versao+1 where id='50000000-0000-4000-8000-000000000001';
 depois:=(public.financeiro_apuracao_fixture('api.consultar_apuracao_repasse',jsonb_build_object(
   'profissional_usuario_id','10000000-0000-4000-8000-000000000002','periodo_inicio','2026-11-01','periodo_fim','2026-11-30'),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003'))->'dados';
 if depois->>'total_centavos' is distinct from '60000' then raise exception 'RETIFICACAO_NAO_REFLETIU: %',depois; end if;
 if antes->>'consultado_em' = depois->>'consultado_em' then raise exception 'INSTANTES_IGUAIS'; end if;
 if antes->>'total_centavos' = depois->>'total_centavos' then raise exception 'CONSULTAS_INDISTINGUIVEIS'; end if;
end $$;

-- 3.9 — período sem turno encerrado: estado vazio honesto, consulta bem-sucedida.
do $$ declare r jsonb; begin
 r:=public.financeiro_apuracao_fixture('api.consultar_apuracao_repasse',jsonb_build_object(
   'profissional_usuario_id','10000000-0000-4000-8000-000000000002','periodo_inicio','2025-01-01','periodo_fim','2025-01-31'),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,linhas}')<>0
  or r#>>'{dados,total_centavos}' is distinct from '0' or r#>>'{dados,consultado_em}' is null then raise exception 'VAZIO_DESONESTO: %',r; end if;
end $$;

-- 3.8 — execução, consulta e exportação auditadas.
do $$ declare r jsonb; a text; begin
 r:=public.financeiro_apuracao_fixture('api.exportar_apuracao_repasse',jsonb_build_object(
   'profissional_usuario_id','10000000-0000-4000-8000-000000000002','periodo_inicio','2026-11-01','periodo_fim','2026-11-30'),
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003');
 if r->>'ok' is distinct from 'true' then raise exception 'EXPORTACAO_FALHOU: %',r; end if;
 foreach a in array array['api.executar_apuracao_repasse','api.consultar_apuracao_repasse','api.exportar_apuracao_repasse'] loop
  if not exists(select 1 from auditoria.evento where acao=a and resultado='permitido' and tipo_objeto='apuracao_repasse' and objeto_id='10000000-0000-4000-8000-000000000002') then raise exception 'AUDITORIA_AUSENTE: %',a; end if;
 end loop;
end $$;

-- 3.7 — negativa de audiência, inclusive para o próprio profissional apurado e para familiar.
do $$ declare r jsonb; begin
 r:=public.financeiro_apuracao_fixture('api.consultar_apuracao_repasse',jsonb_build_object(
   'profissional_usuario_id','10000000-0000-4000-8000-000000000002','periodo_inicio','2026-11-01','periodo_fim','2026-11-30'),
  '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'PROPRIO_APURADO_ACEITO: %',r; end if;
 if r::text ~ '24000|30000|54000' then raise exception 'VALOR_VAZOU_NA_NEGATIVA: %',r; end if;
 r:=public.financeiro_apuracao_fixture('api.consultar_apuracao_repasse',jsonb_build_object(
   'profissional_usuario_id','10000000-0000-4000-8000-000000000002','periodo_inicio','2026-11-01','periodo_fim','2026-11-30'),
  '10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004');
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'FAMILIAR_ACEITO: %',r; end if;
 if not exists(select 1 from auditoria.evento where acao='api.consultar_apuracao_repasse' and resultado='negado' and ator_usuario_id='10000000-0000-4000-8000-000000000002') then raise exception 'AUDITORIA_NEGACAO_AUSENTE'; end if;
end $$;
-- 3.7 — por acesso direto ao banco.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"oauth"}]}',false);
set role authenticated;
do $$ begin
 begin perform 1 from financeiro.valor_acordado_turno; raise exception 'AUTHENTICATED_LE_VALOR';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'FINANCEIRO APURACAO OK'
