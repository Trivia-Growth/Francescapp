\set ON_ERROR_STOP on
\ir pendencia_operacoes_local.sql
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261118200000_diario_versoes_privadas.sql
\ir ../migrations/20261118210000_diario_operacoes_privadas.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261118230000_configuracao_diario.sql
\ir ../migrations/20261120360000_diario_acontecimento_area_em_claro.sql
\ir ../migrations/20261125080000_turno_execucao_privada.sql
\ir ../migrations/20261125130000_turno_consulta_atual.sql
\ir ../migrations/20261125140000_turno_escala_passagem.sql
\ir ../migrations/20261118100000_habilitacao_plano_crise_concessao.sql
\ir ../migrations/20261118110000_plano_crise_versoes_privadas.sql
\ir ../migrations/20261118120000_plano_crise_operacoes_privadas.sql
\ir ../migrations/20261125040000_plano_crise_case_manager_atual.sql
\ir ../migrations/20261126100000_substituicao_case_manager.sql
\ir ../migrations/20261126300000_avisos_no_app.sql
\ir ../migrations/20261126300100_grant_avisos_teste.sql

-- ---------------------------------------------------------------------------
-- Toda chamada cruza o wrapper api.* como `authenticated`: grants e policies do
-- papel dono são exercitados de verdade. Nenhum dado real; só fixtures fictícias.
-- ---------------------------------------------------------------------------
create function public.avisos_fixture(p_ator uuid, p_sessao uuid, p_acao text, p_entrada jsonb)
returns jsonb language plpgsql as $$
declare t jsonb; r jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_ator, 'session_id', p_sessao,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true);
  t := public.assinar_anamnese_fixture(p_entrada || jsonb_build_object('request_id', gen_random_uuid()), p_acao, p_ator, p_sessao);
  execute 'set local role authenticated';
  r := api.avisos_privado(t);
  execute 'reset role';
  return r;
end $$;

create function public.avisos_tipos_fixture(p_resposta jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct i->>'tipo' order by i->>'tipo'), array[]::text[])
  from jsonb_array_elements(p_resposta#>'{dados,itens}') i;
$$;

-- Conteúdo clínico fictício ('CONTEUDO-CLINICO-...') não pode aparecer em aviso nem em auditoria.
do $$
#variable_conflict use_variable
declare
  admin uuid := '10000000-0000-4000-8000-000000000001'; sa uuid := '20000000-0000-4000-8000-000000000001';
  prof uuid := '10000000-0000-4000-8000-000000000002'; sp uuid := '20000000-0000-4000-8000-000000000002';
  p1 uuid := '47000000-0000-4000-8000-000000000001';
  p2 uuid := '40000000-0000-4000-8000-000000000002';
  env jsonb := jsonb_build_object('formato', 1, 'key_id', 'teste', 'nonce', repeat('a', 16),
    'ciphertext', 'Q09OVEVVRE8tQ0xJTklDTy1GSUNUSUNJTy1OQU8tUE9ERS1WQVpBUg', 'tag', repeat('a', 22));
  aud uuid; turno_origem uuid; turno_destino uuid; reg uuid; ver uuid;
begin
  -- Liderança do caso: prof é o titular de P1 e também de P2 (onde NÃO tem acesso).
  foreach aud in array array[p1, p2] loop
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), admin, 'api.editar_paciente', 'paciente', aud, 'permitido', gen_random_uuid());
    insert into cadastro.acompanhamento_caso(id, paciente_id, versao, situacao, responsavel_usuario_id, auditoria_id, ator_usuario_id)
      values(gen_random_uuid(), aud, 1, 'ativo', prof,
        (select e.id from auditoria.evento e where e.objeto_id = aud order by e.instante desc limit 1), admin);
  end loop;
  -- Acordo vencido em P2 também, para provar que audiência vence liderança.
  insert into cadastro.acordo_acompanhamento(id, paciente_id, versao, dias_entre_atualizacoes,
    dias_antecedencia_revisao, dias_retorno_encaminhamento, proxima_revisao_em, ator_usuario_id)
    values(gen_random_uuid(), p2, 1, 30, 7, 30, current_date - 30, admin);

  -- FR-014: relato marcado como atenção, em P1 e em P2.
  foreach aud in array array[p1, p2] loop
    reg := gen_random_uuid(); ver := gen_random_uuid();
    insert into cadastro.diario_registro(id, paciente_id, tipo, autor_usuario_id)
      values(reg, aud, 'evolucao_profissional', prof);
    insert into cadastro.diario_registro_versao(id, diario_registro_id, versao, estado, audiencia,
      atencao, conteudo_cifrado, criado_por_usuario_id)
      values(ver, reg, 1, 'publicado', 'equipe', true, env, prof);
  end loop;

  -- FR-057: passagem publicada em P1 com destinatário `prof` e nenhuma ciência registrada.
  turno_origem := gen_random_uuid(); turno_destino := gen_random_uuid();
  insert into cadastro.turno(id, paciente_id, profissional_usuario_id, aberto_em, encerrado_em, situacao, parametros)
    values(turno_origem, p1, admin, clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour', 'encerrado', '{}'::jsonb);
  insert into cadastro.turno(id, paciente_id, profissional_usuario_id, parametros)
    values(turno_destino, p1, prof, '{}'::jsonb);
  reg := gen_random_uuid(); ver := gen_random_uuid();
  insert into cadastro.diario_registro(id, paciente_id, tipo, autor_usuario_id)
    values(reg, p1, 'evolucao_profissional', admin);
  insert into cadastro.diario_registro_versao(id, diario_registro_id, versao, estado, audiencia,
    atencao, conteudo_cifrado, criado_por_usuario_id)
    values(ver, reg, 1, 'publicado', 'equipe', false, env, admin);
  insert into cadastro.diario_turno_passagem(turno_id, versao_passagem, paciente_id, diario_registro_id,
    registro_id, autor_usuario_id, chave_idempotencia, digest_idempotencia)
    values(turno_origem, 1, p1, reg, ver, admin, 'passagem-fixture', repeat('p', 43));
  insert into cadastro.diario_turno_destinatario(turno_destinatario_id, turno_origem_id,
    versao_passagem_origem, paciente_id, usuario_id)
    values(turno_destino, turno_origem, 1, p1, prof);
end $$;

-- 3.1 — quatro origens distintas, projetadas sem tabela de notificação.
do $$
declare r jsonb; t text[];
begin
  r := public.avisos_fixture('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002',
    'api.listar_avisos', '{}'::jsonb);
  if r->>'ok' is distinct from 'true' then raise exception 'LISTAR_RECUSADO: %', r; end if;
  t := public.avisos_tipos_fixture(r);
  if t <> array['passagem_sem_ciencia', 'pendencia_operacional', 'relato_em_atencao', 'sinal_atencao_operacional']
    then raise exception 'ORIGENS_PROJETADAS_INESPERADAS: %', t; end if;
  -- 3.4 — audiência vence liderança: P2 não tem acesso vigente e não aparece.
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
    where i->>'paciente_id' = '40000000-0000-4000-8000-000000000002')
    then raise exception 'AVISO_DE_CASO_SEM_ACESSO'; end if;
  -- 3.4 — nenhum teor: só referência. Nenhum campo de conteúdo, nenhum texto da origem
  -- além do motivo operacional derivado de datas (FR-027).
  if (r#>'{dados,itens}')::text like '%CONTEUDO-CLINICO%'
    or (r#>'{dados,itens}')::text like '%ciphertext%'
    then raise exception 'AVISO_REVELOU_CONTEUDO'; end if;
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
    where i->>'tipo' in ('passagem_sem_ciencia', 'relato_em_atencao', 'sinal_atencao_operacional')
      and i->>'motivo' is not null)
    then raise exception 'AVISO_COM_TEXTO_PROPRIO'; end if;
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
    where i - array['tipo','paciente_id','chave_origem','instante','destinatario_usuario_id','por_substituicao','lido','motivo'] <> '{}'::jsonb)
    then raise exception 'AVISO_COM_CAMPO_DESCONHECIDO'; end if;
  if (r#>>'{dados,nao_lidos}')::integer <> jsonb_array_length(r#>'{dados,itens}')
    then raise exception 'INDICADOR_INICIAL_INCOERENTE: %', r#>'{dados}'; end if;
end $$;

-- 3.2 — substituição alcança os avisos em aberto, sem conceder acesso.
do $$
declare admin uuid := '10000000-0000-4000-8000-000000000001'; sa uuid := '20000000-0000-4000-8000-000000000001';
  prof uuid := '10000000-0000-4000-8000-000000000002';
  p1 uuid := '47000000-0000-4000-8000-000000000001'; r jsonb; aud uuid := gen_random_uuid();
begin
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(aud, admin, 'api.registrar_substituicao_cm', 'paciente', p1, 'permitido', gen_random_uuid());
  insert into cadastro.substituicao_case_manager(id, paciente_id, versao, responsavel_usuario_id,
    substituto_usuario_id, inicio, fim, auditoria_id, registrada_por_usuario_id)
    values(gen_random_uuid(), p1, 1, prof, admin, clock_timestamp() - interval '1 hour',
      clock_timestamp() + interval '1 day', aud, admin);
  -- Substituir NÃO concede acesso: sem concessão vigente de acesso ao caso, nada aparece.
  r := public.avisos_fixture(admin, sa, 'api.listar_avisos', '{}'::jsonb);
  if r->>'ok' is distinct from 'true' then raise exception 'SUBSTITUTA_LISTAR_RECUSADO: %', r; end if;
  if jsonb_array_length(r#>'{dados,itens}') <> 0 or (r#>>'{dados,nao_lidos}')::integer <> 0
    then raise exception 'SUBSTITUICAO_CONCEDEU_ACESSO: %', r#>'{dados}'; end if;
  -- Com acesso vigente ao caso, a substituta passa a ver os avisos em aberto do titular,
  -- que continua sendo o destinatário.
  insert into cadastro.acesso_paciente(id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
    values(gen_random_uuid(), p1, admin, admin, jsonb_build_object('formato', 1, 'key_id', 'teste',
      'nonce', repeat('b', 16), 'ciphertext', 'YQ', 'tag', repeat('b', 22)));
  r := public.avisos_fixture(admin, sa, 'api.listar_avisos', '{}'::jsonb);
  if public.avisos_tipos_fixture(r) <> array['passagem_sem_ciencia', 'pendencia_operacional',
    'relato_em_atencao', 'sinal_atencao_operacional'] then raise exception 'SUBSTITUICAO_NAO_ALCANCOU: %', r#>'{dados}'; end if;
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
    where i->>'destinatario_usuario_id' is distinct from prof::text or i->>'por_substituicao' <> 'true')
    then raise exception 'DESTINATARIO_ORIGINAL_PERDIDO: %', r#>'{dados,itens}'; end if;
end $$;

-- 3.3 e 3.7 — lido é por pessoa, não é ciência, não encerra pendência, e permanece.
create temp table avisos_chaves as
  select i->>'tipo' tipo, i->>'chave_origem' chave, i->>'paciente_id' paciente
  from jsonb_array_elements(public.avisos_fixture('10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002', 'api.listar_avisos', '{}'::jsonb)#>'{dados,itens}') i;

do $$
declare admin uuid := '10000000-0000-4000-8000-000000000001'; sa uuid := '20000000-0000-4000-8000-000000000001';
  prof uuid := '10000000-0000-4000-8000-000000000002'; sp uuid := '20000000-0000-4000-8000-000000000002';
  r jsonb; chave text; paciente uuid; antes integer; depois integer;
  ciencias integer; tratativas integer; pendencias_abertas integer;
begin
  select a.chave, a.paciente::uuid into chave, paciente from avisos_chaves a where a.tipo = 'passagem_sem_ciencia';
  select count(*) into ciencias from cadastro.diario_ciencia_turno;
  select count(*) into tratativas from cadastro.pendencia_tratativa;
  r := public.avisos_fixture(prof, sp, 'api.listar_avisos', '{}'::jsonb);
  antes := (r#>>'{dados,nao_lidos}')::integer;
  r := public.avisos_fixture(prof, sp, 'api.marcar_aviso_lido', jsonb_build_object(
    'paciente_id', paciente, 'tipo', 'passagem_sem_ciencia', 'chave_origem', chave,
    'chave_idempotencia', 'aviso-lido-1', 'digest_idempotencia', repeat('l', 43)));
  if r->>'ok' is distinct from 'true' then raise exception 'MARCAR_LIDO_RECUSADO: %', r; end if;
  depois := (r#>>'{dados,nao_lidos}')::integer;
  if depois <> antes - 1 then raise exception 'INDICADOR_NAO_RECALCULADO: % -> %', antes, depois; end if;
  -- Permanece na lista, identificado como lido.
  if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
    where i->>'chave_origem' = chave and i->>'lido' = 'true')
    then raise exception 'AVISO_LIDO_SUMIU_DA_LISTA'; end if;
  -- Ler não registra ciência (FR-013/FR-057) e não encerra pendência (FR-027).
  if (select count(*) from cadastro.diario_ciencia_turno) <> ciencias
    then raise exception 'LEITURA_REGISTROU_CIENCIA'; end if;
  if (select count(*) from cadastro.pendencia_tratativa) <> tratativas
    then raise exception 'LEITURA_TRATOU_PENDENCIA'; end if;
  select count(*) into pendencias_abertas from jsonb_array_elements(
    cadastro.sinal_operacional_caso('47000000-0000-4000-8000-000000000001')->'pendencias') p
    where p->>'estado' is distinct from 'resolvida';
  if pendencias_abertas = 0 then raise exception 'PENDENCIA_ENCERRADA_PELA_LEITURA'; end if;
  -- Lido é por pessoa: a substituta continua com o seu aviso não lido.
  r := public.avisos_fixture(admin, sa, 'api.listar_avisos', '{}'::jsonb);
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
    where i->>'chave_origem' = chave and i->>'lido' = 'true')
    then raise exception 'LIDO_VAZOU_PARA_OUTRA_PESSOA'; end if;
  -- Repetição da mesma chave de idempotência não duplica marca nem muda o indicador.
  r := public.avisos_fixture(prof, sp, 'api.marcar_aviso_lido', jsonb_build_object(
    'paciente_id', paciente, 'tipo', 'passagem_sem_ciencia', 'chave_origem', chave,
    'chave_idempotencia', 'aviso-lido-1', 'digest_idempotencia', repeat('l', 43)));
  if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
    or (r#>>'{dados,nao_lidos}')::integer <> depois then raise exception 'REPLAY_LIDO_INESPERADO: %', r; end if;
  if (select count(*) from cadastro.aviso_leitura) <> 1 then raise exception 'MARCA_DUPLICADA'; end if;
end $$;

-- 3.7 — o aviso sai da lista quando a origem é resolvida; nada sai por decurso de prazo.
do $$
declare prof uuid := '10000000-0000-4000-8000-000000000002'; sp uuid := '20000000-0000-4000-8000-000000000002';
  r jsonb; chave text; destino uuid;
begin
  select a.chave into chave from avisos_chaves a where a.tipo = 'passagem_sem_ciencia';
  destino := replace(chave, 'passagem:', '')::uuid;
  insert into cadastro.diario_ciencia_turno(turno_destinatario_id, usuario_id, chave_idempotencia, digest_idempotencia)
    values(destino, prof, 'ciencia-fixture', repeat('c', 43));
  r := public.avisos_fixture(prof, sp, 'api.listar_avisos', '{}'::jsonb);
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'chave_origem' = chave)
    then raise exception 'ORIGEM_RESOLVIDA_CONTINUOU_NA_LISTA'; end if;
  if 'passagem_sem_ciencia' = any(public.avisos_tipos_fixture(r))
    then raise exception 'PASSAGEM_RESOLVIDA_AINDA_PROJETADA'; end if;
  -- A marca de leitura permanece gravada, mas não ressuscita o aviso.
  if (select count(*) from cadastro.aviso_leitura) <> 1 then raise exception 'MARCA_APAGADA'; end if;
end $$;

-- 3.2 — fim da substituição retira os avisos do substituto e recalcula o indicador.
do $$
declare admin uuid := '10000000-0000-4000-8000-000000000001'; sa uuid := '20000000-0000-4000-8000-000000000001';
  prof uuid := '10000000-0000-4000-8000-000000000002'; sp uuid := '20000000-0000-4000-8000-000000000002';
  r jsonb; aud uuid := gen_random_uuid(); antes integer;
begin
  r := public.avisos_fixture(admin, sa, 'api.listar_avisos', '{}'::jsonb);
  antes := (r#>>'{dados,nao_lidos}')::integer;
  if antes = 0 then raise exception 'SUBSTITUTA_SEM_AVISOS_ANTES_DO_FIM'; end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(aud, admin, 'api.encerrar_substituicao_cm', 'paciente', '47000000-0000-4000-8000-000000000001', 'permitido', gen_random_uuid());
  update cadastro.substituicao_case_manager
    set encerrada_em = clock_timestamp(), encerrada_por_usuario_id = admin, encerramento_auditoria_id = aud
    where paciente_id = '47000000-0000-4000-8000-000000000001' and encerrada_em is null;
  r := public.avisos_fixture(admin, sa, 'api.listar_avisos', '{}'::jsonb);
  if jsonb_array_length(r#>'{dados,itens}') <> 0 or (r#>>'{dados,nao_lidos}')::integer <> 0
    then raise exception 'FIM_DA_SUBSTITUICAO_NAO_RETIROU: %', r#>'{dados}'; end if;
  -- O destinatário original continua vendo os seus.
  r := public.avisos_fixture(prof, sp, 'api.listar_avisos', '{}'::jsonb);
  if jsonb_array_length(r#>'{dados,itens}') = 0 then raise exception 'TITULAR_PERDEU_OS_PROPRIOS_AVISOS'; end if;
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'por_substituicao' <> 'false')
    then raise exception 'TITULAR_MARCADO_COMO_SUBSTITUICAO'; end if;
end $$;

-- 3.8 — a consulta da lista é auditada (FR-039) sem conteúdo clínico no registro.
do $$
declare permitidos integer; negados integer;
begin
  select count(*) into permitidos from auditoria.evento
    where acao = 'api.listar_avisos' and tipo_objeto = 'aviso' and resultado = 'permitido';
  if permitidos = 0 then raise exception 'CONSULTA_NAO_AUDITADA'; end if;
  if exists(select 1 from auditoria.evento where acao in ('api.listar_avisos', 'api.marcar_aviso_lido')
    and (acao like '%CONTEUDO-CLINICO%' or tipo_objeto like '%CONTEUDO-CLINICO%'))
    then raise exception 'AUDITORIA_COM_CONTEUDO_CLINICO'; end if;
  -- A listagem não tem objeto único: objeto_id fica nulo, nunca um identificador de caso
  -- que a auditoria não precisa para reconstituir quem consultou e quando.
  if exists(select 1 from auditoria.evento where acao = 'api.listar_avisos' and objeto_id is not null)
    then raise exception 'AUDITORIA_LISTAGEM_COM_OBJETO'; end if;
  select count(*) into negados from auditoria.evento
    where acao = 'api.marcar_aviso_lido' and resultado = 'permitido';
  if negados = 0 then raise exception 'MARCACAO_NAO_AUDITADA'; end if;
end $$;

-- 3.9 — nada sai do aplicativo e nenhum token de dispositivo é registrado.
do $$
declare corpo text;
begin
  if exists(select 1 from pg_extension where extname in ('http', 'pg_net', 'pgsql-http'))
    then raise exception 'EXTENSAO_DE_SAIDA_INSTALADA'; end if;
  for corpo in select p.prosrc from pg_proc p where p.oid in (
    'cadastro.avisos_pessoa(uuid)'::regprocedure,
    'operacao.avisos_privada(jsonb)'::regprocedure,
    'api.avisos_privado(jsonb)'::regprocedure) loop
    if corpo ~* '(http|net\.|pg_net|smtp|webhook|push|whatsapp|sms|device_token|token de dispositivo)'
      then raise exception 'CHAMADA_EXTERNA_NA_FATIA'; end if;
  end loop;
  -- Nenhuma coluna desta fatia guarda endereço, dispositivo ou canal externo.
  if exists(select 1 from information_schema.columns
    where table_schema = 'cadastro' and table_name = 'aviso_leitura'
      and column_name not in ('usuario_id', 'tipo', 'chave_origem', 'paciente_id', 'lido_em'))
    then raise exception 'COLUNA_INESPERADA_EM_AVISO_LEITURA'; end if;
end $$;

-- ACL exata, no molde de supabase/tests/turno_grant_local.sql.
do $$
declare assinatura text := 'api.avisos_privado(jsonb)';
begin
  if not has_function_privilege('authenticated', to_regprocedure(assinatura), 'EXECUTE')
    or has_function_privilege('anon', to_regprocedure(assinatura), 'EXECUTE')
    or has_function_privilege('service_role', to_regprocedure(assinatura), 'EXECUTE')
    or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure(assinatura)
        and (a.grantee not in (p.proowner, 'authenticated'::regrole) or a.privilege_type <> 'EXECUTE' or a.is_grantable))
    then raise exception 'ACL_GRANT_INEXATA'; end if;
  if has_table_privilege('authenticated', 'cadastro.aviso_leitura', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon', 'cadastro.aviso_leitura', 'SELECT,INSERT,UPDATE,DELETE')
    or has_function_privilege('authenticated', 'cadastro.avisos_pessoa(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'operacao.avisos_privada(jsonb)', 'EXECUTE')
    or pg_has_role('authenticated', 'ffcmapp_avisos_owner', 'MEMBER')
    then raise exception 'GRANT_AVISOS_AMPLO'; end if;
end $$;
set role authenticated;
do $$ begin
  begin perform 1 from cadastro.aviso_leitura; raise exception 'TABELA_EXPOSTA';
  exception when insufficient_privilege then null; end;
  begin perform cadastro.avisos_pessoa('10000000-0000-4000-8000-000000000002'); raise exception 'PROJECAO_EXPOSTA';
  exception when insufficient_privilege then null; end;
  begin perform operacao.avisos_privada('{}'::jsonb); raise exception 'OPERACAO_EXPOSTA';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform api.avisos_privado('{}'::jsonb); raise exception 'ANON_EXECUTE_ACEITO';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 3.5 — revogação retira os avisos imediatamente, inclusive por acesso direto.
do $$
declare admin uuid := '10000000-0000-4000-8000-000000000001';
  prof uuid := '10000000-0000-4000-8000-000000000002'; sp uuid := '20000000-0000-4000-8000-000000000002';
  p1 uuid := '47000000-0000-4000-8000-000000000001'; r jsonb; chave text; paciente uuid;
begin
  select a.chave, a.paciente::uuid into chave, paciente from avisos_chaves a where a.tipo = 'relato_em_atencao';
  r := public.avisos_fixture(prof, sp, 'api.listar_avisos', '{}'::jsonb);
  if (r#>>'{dados,nao_lidos}')::integer = 0 then raise exception 'SEM_AVISOS_ANTES_DA_REVOGACAO'; end if;
  update cadastro.acesso_paciente set revogada_em = clock_timestamp(), revogado_por_usuario_id = admin,
    motivo_revogacao_cifrado = motivo_concessao_cifrado
    where paciente_id = p1 and usuario_id = prof and revogada_em is null;
  r := public.avisos_fixture(prof, sp, 'api.listar_avisos', '{}'::jsonb);
  if jsonb_array_length(r#>'{dados,itens}') <> 0 or (r#>>'{dados,nao_lidos}')::integer <> 0
    then raise exception 'REVOGACAO_NAO_RETIROU_AVISOS: %', r#>'{dados}'; end if;
  -- Marcar como lido depois da revogação é recusado: o aviso já não é dela.
  r := public.avisos_fixture(prof, sp, 'api.marcar_aviso_lido', jsonb_build_object(
    'paciente_id', paciente, 'tipo', 'relato_em_atencao', 'chave_origem', chave,
    'chave_idempotencia', 'aviso-lido-revogado', 'digest_idempotencia', repeat('r', 43)));
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao'
    then raise exception 'MARCACAO_APOS_REVOGACAO_ACEITA: %', r; end if;
  if exists(select 1 from auditoria.evento where acao = 'api.marcar_aviso_lido' and resultado = 'negado') is not true
    then raise exception 'NEGACAO_NAO_AUDITADA'; end if;
end $$;
