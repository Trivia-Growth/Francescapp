-- FR-037/DF-024: substituição temporária da case manager. Apenas fixtures fictícias em
-- PostgreSQL descartável. Auth, Vault e assinatura são simulados e NÃO comprovam serviço
-- real. Toda ação passa pelos wrappers api.* como `authenticated`, então grants e políticas
-- do papel dono são exercitados de verdade.
\set ON_ERROR_STOP on
\ir acompanhamento_caso_local.sql
\ir ../migrations/20261118100000_habilitacao_plano_crise_concessao.sql
\ir ../migrations/20261118110000_plano_crise_versoes_privadas.sql
\ir ../migrations/20261118120000_plano_crise_operacoes_privadas.sql
\ir ../migrations/20261118130000_grant_plano_crise_teste.sql
\ir ../migrations/20261125040000_plano_crise_case_manager_atual.sql
\ir ../migrations/20261126100000_substituicao_case_manager.sql
\ir ../migrations/20261126100100_grant_substituicao_cm_teste.sql

-- Envelope fictício no formato que a tabela e a RPC conferem. O texto claro nunca entra no
-- banco: a cifra e a decifra ficam no servidor, provadas em `cifra-substituicao-cm.test.ts`.
create function public.envelope_fixture() returns jsonb language sql immutable as $$
  select jsonb_build_object('formato', 1, 'key_id', 'teste', 'nonce', repeat('a', 16),
    'ciphertext', 'YQ', 'tag', repeat('a', 22))
$$;

create function public.substituicao_fixture(p_ator uuid, p_sessao uuid, p_acao text, p_entrada jsonb)
returns jsonb language plpgsql as $$
declare t jsonb; r jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_ator, 'session_id', p_sessao,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true);
  t := public.assinar_anamnese_fixture(p_entrada || jsonb_build_object('request_id', gen_random_uuid()), p_acao, p_ator, p_sessao);
  execute 'set local role authenticated';
  r := api.substituicao_case_manager_privado(t);
  execute 'reset role';
  return r;
end $$;

-- Nova versão do plano para permitir aprovações distintas; é apenas preparação de fixture.
create function public.nova_versao_crise_fixture(p_paciente uuid, p_autor uuid) returns uuid
language plpgsql as $$
declare novo uuid := gen_random_uuid();
begin
  insert into cadastro.plano_crise_versao(id, paciente_id, versao, versao_esperada, conteudo_cifrado, criado_por_usuario_id)
  select novo, p_paciente, coalesce(max(v.versao), 0) + 1, nullif(coalesce(max(v.versao), 0), 0),
    jsonb_build_object('formato', 1, 'key_id', 'teste', 'nonce', repeat('a', 16), 'ciphertext', 'YQ', 'tag', repeat('a', 22)),
    p_autor
  from cadastro.plano_crise_versao v where v.paciente_id = p_paciente;
  return novo;
end $$;

create function public.aprovar_crise_fixture(p_ator uuid, p_sessao uuid, p_paciente uuid, p_chave text)
returns jsonb language plpgsql as $$
declare t jsonb; r jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_ator, 'session_id', p_sessao,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true);
  select public.assinar_anamnese_fixture(jsonb_build_object('request_id', gen_random_uuid(),
    'paciente_id', p_paciente, 'registro_id', v.id, 'versao', v.versao, 'chave_idempotencia', p_chave,
    'digest_idempotencia', repeat('c', 43)), 'api.aprovar_plano_crise', p_ator, p_sessao)
  into t from cadastro.plano_crise_versao v where v.paciente_id = p_paciente order by v.versao desc limit 1;
  execute 'set local role authenticated';
  r := api.plano_crise_operacao_privada(t);
  execute 'reset role';
  return r;
end $$;

do $$
#variable_conflict use_variable
declare
  admin uuid := '10000000-0000-4000-8000-000000000001'; sa uuid := '20000000-0000-4000-8000-000000000001';
  prof uuid := '10000000-0000-4000-8000-000000000002'; sp uuid := '20000000-0000-4000-8000-000000000002';
  caso uuid := '40000000-0000-4000-8000-000000000001'; outro uuid := '40000000-0000-4000-8000-000000000002';
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid(); s4 uuid := gen_random_uuid();
  r jsonb; n integer;
begin
  -- Preparação: habilitação clínica de ambos (DF-021) e titular Administrador nos dois casos.
  update identidade.concessao_equipe set habilitado_plano_crise = true, habilitacao_versao = 1,
    habilitacao_por_usuario_id = admin, habilitacao_em = clock_timestamp() where usuario_id in (admin, prof);
  r := public.editar_fixture(admin, sa, caso, 'sub-resp-admin', jsonb_build_object('responsavel_id', admin));
  if r->>'ok' is distinct from 'true' then raise exception 'TITULAR_CASO: %', r; end if;
  r := public.editar_fixture(admin, sa, outro, 'sub-resp-outro', jsonb_build_object('responsavel_id', admin));
  if r->>'ok' is distinct from 'true' then raise exception 'TITULAR_OUTRO: %', r; end if;
  perform public.nova_versao_crise_fixture(caso, admin);
  perform public.nova_versao_crise_fixture(outro, admin);

  -- 1. Só Administrador registra: Profissional é negado no banco, mesmo com sessão válida.
  r := public.substituicao_fixture(prof, sp, 'api.registrar_substituicao_cm', jsonb_build_object(
    'paciente_id', caso, 'substituicao_id', gen_random_uuid(), 'substituto_usuario_id', prof,
    'inicio', clock_timestamp(), 'fim', clock_timestamp() + interval '1 hour',
    'chave_idempotencia', 'prof-registra', 'digest_idempotencia', repeat('d', 43),
    'motivo_cifrado', public.envelope_fixture()));
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROF_REGISTROU: %', r; end if;
  if not exists(select 1 from auditoria.evento where acao = 'api.registrar_substituicao_cm'
    and resultado = 'negado' and ator_usuario_id = prof) then raise exception 'AUDITORIA_NEGADA_AUSENTE'; end if;

  -- 2. Administrador registra substituição vigente no caso, e só nele.
  r := public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm', jsonb_build_object(
    'paciente_id', caso, 'substituicao_id', s1, 'substituto_usuario_id', prof,
    'inicio', clock_timestamp() - interval '1 hour', 'fim', clock_timestamp() + interval '1 hour',
    'chave_idempotencia', 'sub-1', 'digest_idempotencia', repeat('d', 43),
    'motivo_cifrado', public.envelope_fixture()));
  if r->>'ok' is distinct from 'true' or r#>>'{dados,vigente,id}' is distinct from s1::text
    or r#>>'{dados,case_manager_atual_id}' is distinct from prof::text
    or r#>>'{dados,titular_usuario_id}' is distinct from admin::text then raise exception 'REGISTRO: %', r; end if;
  if (select count(*) from cadastro.case_manager_atual(caso)) <> 2
    or not exists(select 1 from cadastro.case_manager_atual(caso) c where c.usuario_id = prof and c.papel = 'substituto')
    or not exists(select 1 from cadastro.case_manager_atual(caso) c where c.usuario_id = admin and c.papel = 'titular')
    or exists(select 1 from cadastro.case_manager_atual(outro) c where c.usuario_id = prof) then
    raise exception 'CASE_MANAGER_ATUAL_INCORRETO';
  end if;

  -- 3. Substituta aprova plano de crise dentro do período, no caso substituído.
  perform public.nova_versao_crise_fixture(caso, admin);
  r := public.aprovar_crise_fixture(prof, sp, caso, 'sub-aprova-dentro');
  if r->>'ok' is distinct from 'true' then raise exception 'SUBSTITUTA_NEGADA_DENTRO: %', r; end if;

  -- 4. Titular continua podendo agir durante a substituição (suposição conservadora da fatia).
  perform public.nova_versao_crise_fixture(caso, admin);
  r := public.aprovar_crise_fixture(admin, sa, caso, 'titular-aprova-durante');
  if r->>'ok' is distinct from 'true' then raise exception 'TITULAR_NEGADO_DURANTE: %', r; end if;

  -- 5. Substituta é negada em outro caso, pelo wrapper e por acesso direto ao banco.
  r := public.aprovar_crise_fixture(prof, sp, outro, 'sub-outro-caso');
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SUBSTITUTA_OUTRO_CASO: %', r; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', prof, 'session_id', sp,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true);
  begin
    execute 'set local role ffcmapp_plano_crise_owner';
    insert into cadastro.plano_crise_aprovacao(id, registro_id, paciente_id, aprovador_usuario_id, concessao_id)
    select gen_random_uuid(), v.id, outro, prof, '30000000-0000-4000-8000-000000000002'
    from cadastro.plano_crise_versao v where v.paciente_id = outro order by v.versao desc limit 1;
    raise exception 'RLS_CONTORNADA_OUTRO_CASO';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- 6. Substituir NÃO concede acesso ao conteúdo do caso.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', prof, 'session_id', sp,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true);
  if cadastro.possui_acesso_paciente(caso) is not false then raise exception 'SUBSTITUICAO_CONCEDEU_ACESSO'; end if;
  if has_table_privilege('ffcmapp_substituicao_cm_owner', 'cadastro.acesso_paciente', 'select')
    or has_table_privilege('ffcmapp_substituicao_cm_owner', 'cadastro.acesso_paciente', 'insert') then
    raise exception 'OWNER_ALCANCA_ACESSO_PACIENTE';
  end if;

  -- 7. Período sobreposto é recusado; a mesma janela não pode ser aberta duas vezes.
  r := public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm', jsonb_build_object(
    'paciente_id', caso, 'substituicao_id', gen_random_uuid(), 'substituto_usuario_id', prof,
    'inicio', clock_timestamp(), 'fim', clock_timestamp() + interval '30 minutes',
    'chave_idempotencia', 'sub-sobreposta', 'digest_idempotencia', repeat('d', 43),
    'motivo_cifrado', public.envelope_fixture()));
  if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'SOBREPOSICAO_ACEITA: %', r; end if;
  if (select count(*) from cadastro.substituicao_case_manager where paciente_id = caso) <> 1
    or exists(select 1 from operacao.requisicao where chave_idempotencia = 'sub-sobreposta') then
    raise exception 'SOBREPOSICAO_DEIXOU_RASTRO';
  end if;

  -- 8. Encerramento antecipado devolve o poder ao titular imediatamente.
  r := public.substituicao_fixture(admin, sa, 'api.encerrar_substituicao_cm', jsonb_build_object(
    'paciente_id', caso, 'substituicao_id', s1,
    'chave_idempotencia', 'sub-encerra-1', 'digest_idempotencia', repeat('e', 43),
    'motivo_encerramento_cifrado', public.envelope_fixture()));
  if r->>'ok' is distinct from 'true' or r->'dados'->'vigente' <> 'null'::jsonb
    or r#>>'{dados,case_manager_atual_id}' is distinct from admin::text then raise exception 'ENCERRAMENTO: %', r; end if;
  perform public.nova_versao_crise_fixture(caso, admin);
  r := public.aprovar_crise_fixture(prof, sp, caso, 'sub-apos-encerramento');
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ENCERRADA_APROVOU: %', r; end if;
  r := public.aprovar_crise_fixture(admin, sa, caso, 'titular-apos-encerramento');
  if r->>'ok' is distinct from 'true' then raise exception 'TITULAR_APOS_ENCERRAMENTO: %', r; end if;
  -- Registro encerrado não reabre e nada mais muda: append-only com uma transição nomeada.
  begin
    update cadastro.substituicao_case_manager set encerrada_em = null, encerrada_por_usuario_id = null,
      encerramento_auditoria_id = null where id = s1;
    raise exception 'REABERTURA_ACEITA';
  exception when insufficient_privilege then
    if sqlerrm <> 'REGISTRO_IMUTAVEL' then raise; end if;
  end;
  begin
    delete from cadastro.substituicao_case_manager where id = s1;
    raise exception 'EXCLUSAO_ACEITA';
  exception when insufficient_privilege then
    if sqlerrm <> 'REGISTRO_IMUTAVEL' then raise; end if;
  end;

  -- 9. Substituta é negada ANTES do início do período.
  r := public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm', jsonb_build_object(
    'paciente_id', caso, 'substituicao_id', s2, 'substituto_usuario_id', prof,
    'inicio', clock_timestamp() + interval '1 day', 'fim', clock_timestamp() + interval '2 days',
    'chave_idempotencia', 'sub-futura', 'digest_idempotencia', repeat('d', 43),
    'motivo_cifrado', public.envelope_fixture()));
  if r->>'ok' is distinct from 'true' or r->'dados'->'vigente' <> 'null'::jsonb then raise exception 'REGISTRO_FUTURO: %', r; end if;
  perform public.nova_versao_crise_fixture(caso, admin);
  r := public.aprovar_crise_fixture(prof, sp, caso, 'sub-antes-do-inicio');
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ANTES_DO_INICIO_APROVOU: %', r; end if;

  -- 10. Substituta é negada DEPOIS do fim, sem ação manual de ninguém.
  r := public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm', jsonb_build_object(
    'paciente_id', caso, 'substituicao_id', s3, 'substituto_usuario_id', prof,
    'inicio', clock_timestamp(), 'fim', clock_timestamp() + interval '2 seconds',
    'chave_idempotencia', 'sub-curta', 'digest_idempotencia', repeat('d', 43),
    'motivo_cifrado', public.envelope_fixture()));
  if r->>'ok' is distinct from 'true' or r#>>'{dados,vigente,id}' is distinct from s3::text then raise exception 'REGISTRO_CURTO: %', r; end if;
  perform public.nova_versao_crise_fixture(caso, admin);
  r := public.aprovar_crise_fixture(prof, sp, caso, 'sub-janela-curta');
  if r->>'ok' is distinct from 'true' then raise exception 'JANELA_CURTA_NEGOU: %', r; end if;
  perform pg_sleep(3);
  perform public.nova_versao_crise_fixture(caso, admin);
  r := public.aprovar_crise_fixture(prof, sp, caso, 'sub-depois-do-fim');
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'DEPOIS_DO_FIM_APROVOU: %', r; end if;
  if exists(select 1 from cadastro.case_manager_atual(caso) c where c.usuario_id = prof) then
    raise exception 'SUBSTITUTA_AINDA_ATUAL_APOS_FIM';
  end if;

  -- 11. Entradas recusadas: substituta igual ao titular, período invertido e período já vencido.
  foreach r in array array[
    jsonb_build_object('substituto_usuario_id', admin, 'inicio', clock_timestamp() + interval '10 days', 'fim', clock_timestamp() + interval '11 days'),
    jsonb_build_object('substituto_usuario_id', prof, 'inicio', clock_timestamp() + interval '11 days', 'fim', clock_timestamp() + interval '10 days'),
    jsonb_build_object('substituto_usuario_id', prof, 'inicio', clock_timestamp() - interval '3 days', 'fim', clock_timestamp() - interval '2 days')
  ] loop
    if (public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm',
      jsonb_build_object('paciente_id', caso, 'substituicao_id', gen_random_uuid(),
        'chave_idempotencia', gen_random_uuid()::text, 'digest_idempotencia', repeat('d', 43),
        'motivo_cifrado', public.envelope_fixture()) || r)
      )#>>'{erro,codigo}' is distinct from 'responsavel_invalido' then
      raise exception 'ENTRADA_INDEVIDA_ACEITA: %', r;
    end if;
  end loop;

  -- 12. Encerrar algo já encerrado ou de outro caso é conflito, não sucesso silencioso.
  r := public.substituicao_fixture(admin, sa, 'api.encerrar_substituicao_cm', jsonb_build_object(
    'paciente_id', caso, 'substituicao_id', s1,
    'chave_idempotencia', 'sub-reencerra', 'digest_idempotencia', repeat('e', 43),
    'motivo_encerramento_cifrado', public.envelope_fixture()));
  if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'REENCERRAMENTO_ACEITO: %', r; end if;
  r := public.substituicao_fixture(admin, sa, 'api.encerrar_substituicao_cm', jsonb_build_object(
    'paciente_id', outro, 'substituicao_id', s2,
    'chave_idempotencia', 'sub-encerra-caso-errado', 'digest_idempotencia', repeat('e', 43),
    'motivo_encerramento_cifrado', public.envelope_fixture()));
  if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'ENCERRAMENTO_CRUZADO_ACEITO: %', r; end if;

  -- 13. FR-037: sem motivo não há alteração de acesso. Registrar e encerrar são recusados na
  -- entrada, e envelope de forma errada também — o banco não guarda texto, só confere a forma.
  begin
    perform public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm', jsonb_build_object(
      'paciente_id', caso, 'substituicao_id', gen_random_uuid(), 'substituto_usuario_id', prof,
      'inicio', clock_timestamp() + interval '20 days', 'fim', clock_timestamp() + interval '21 days',
      'chave_idempotencia', 'sub-sem-motivo', 'digest_idempotencia', repeat('d', 43)));
    raise exception 'REGISTRO_SEM_MOTIVO_ACEITO';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.substituicao_fixture(admin, sa, 'api.encerrar_substituicao_cm', jsonb_build_object(
      'paciente_id', caso, 'substituicao_id', s2,
      'chave_idempotencia', 'sub-encerra-sem-motivo', 'digest_idempotencia', repeat('e', 43)));
    raise exception 'ENCERRAMENTO_SEM_MOTIVO_ACEITO';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm', jsonb_build_object(
      'paciente_id', caso, 'substituicao_id', gen_random_uuid(), 'substituto_usuario_id', prof,
      'inicio', clock_timestamp() + interval '20 days', 'fim', clock_timestamp() + interval '21 days',
      'chave_idempotencia', 'sub-envelope-torto', 'digest_idempotencia', repeat('d', 43),
      'motivo_cifrado', public.envelope_fixture() || jsonb_build_object('extra', 'x')));
    raise exception 'ENVELOPE_TORTO_ACEITO';
  exception when invalid_parameter_value then null;
  end;
  -- O envelope do encerramento não entra no registro, e vice-versa.
  begin
    perform public.substituicao_fixture(admin, sa, 'api.registrar_substituicao_cm', jsonb_build_object(
      'paciente_id', caso, 'substituicao_id', gen_random_uuid(), 'substituto_usuario_id', prof,
      'inicio', clock_timestamp() + interval '20 days', 'fim', clock_timestamp() + interval '21 days',
      'chave_idempotencia', 'sub-motivo-trocado', 'digest_idempotencia', repeat('d', 43),
      'motivo_cifrado', public.envelope_fixture(),
      'motivo_encerramento_cifrado', public.envelope_fixture()));
    raise exception 'MOTIVO_DE_ENCERRAMENTO_NO_REGISTRO_ACEITO';
  exception when invalid_parameter_value then null;
  end;
  -- Os dois motivos ficam gravados na linha, e o do registro não muda depois.
  if not exists(select 1 from cadastro.substituicao_case_manager
    where id = s1 and motivo_cifrado is not null and motivo_encerramento_cifrado is not null) then
    raise exception 'MOTIVOS_NAO_GRAVADOS';
  end if;
  if exists(select 1 from cadastro.substituicao_case_manager
    where id = s2 and motivo_encerramento_cifrado is not null) then
    raise exception 'MOTIVO_DE_ENCERRAMENTO_SEM_ENCERRAMENTO';
  end if;
  begin
    update cadastro.substituicao_case_manager set motivo_cifrado = public.envelope_fixture()
      where id = s1;
    raise exception 'MOTIVO_ALTERADO';
  exception when insufficient_privilege then
    if sqlerrm <> 'REGISTRO_IMUTAVEL' then raise; end if;
  end;

  -- 14. Consulta devolve histórico do caso e nada do outro.
  r := public.substituicao_fixture(admin, sa, 'api.consultar_substituicao_cm', jsonb_build_object('paciente_id', caso));
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,substituicoes}') <> 3
    or exists(select 1 from jsonb_array_elements(r#>'{dados,substituicoes}') i
      where i->'motivo_cifrado' is null or jsonb_typeof(i->'motivo_cifrado') <> 'object')
    or not exists(select 1 from jsonb_array_elements(r#>'{dados,substituicoes}') i
      where i->>'id' = s1::text and jsonb_typeof(i->'motivo_encerramento_cifrado') = 'object')
  then raise exception 'CONSULTA: %', r; end if;
  r := public.substituicao_fixture(admin, sa, 'api.consultar_substituicao_cm', jsonb_build_object('paciente_id', outro));
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,substituicoes}') <> 0 then raise exception 'CONSULTA_OUTRO: %', r; end if;
  s4 := s4;
end $$;

-- Prova de ACL exata: nenhum papel da aplicação recebe privilégio direto nas tabelas novas,
-- e só o wrapper é executável por `authenticated`.
do $$
declare papel text; assinatura text := 'api.substituicao_case_manager_privado(jsonb)';
begin
  foreach papel in array array['authenticated', 'anon', 'service_role'] loop
    if has_table_privilege(papel, 'cadastro.substituicao_case_manager', 'select')
      or has_table_privilege(papel, 'cadastro.substituicao_case_manager', 'insert')
      or has_table_privilege(papel, 'cadastro.substituicao_case_manager', 'update')
      or has_table_privilege(papel, 'cadastro.substituicao_case_manager', 'delete')
      or has_table_privilege(papel, 'cadastro.substituicao_case_manager', 'truncate') then
      raise exception 'PRIVILEGIO_DIRETO_NA_TABELA: %', papel;
    end if;
    if has_function_privilege(papel, 'cadastro.case_manager_atual(uuid)', 'execute')
      or has_function_privilege(papel, 'operacao.substituicao_cm_privada(jsonb)', 'execute') then
      raise exception 'FUNCAO_INTERNA_EXPOSTA: %', papel;
    end if;
    if pg_has_role(papel, 'ffcmapp_substituicao_cm_owner', 'MEMBER') then
      raise exception 'MEMBERSHIP_NO_OWNER: %', papel;
    end if;
  end loop;
  if not has_function_privilege('authenticated', to_regprocedure(assinatura), 'execute')
    or has_function_privilege('anon', to_regprocedure(assinatura), 'execute')
    or has_function_privilege('service_role', to_regprocedure(assinatura), 'execute')
    or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure(assinatura)
        and (a.grantee not in (p.proowner, 'authenticated'::regrole) or a.privilege_type <> 'EXECUTE' or a.is_grantable)) then
    raise exception 'ACL_GRANT_INEXATA';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'cadastro.substituicao_case_manager'::regclass) then
    raise exception 'RLS_DESLIGADA';
  end if;
  if not exists(select 1 from pg_constraint where conname = 'substituicao_cm_sem_sobreposicao'
    and conrelid = 'cadastro.substituicao_case_manager'::regclass and contype = 'x') then
    raise exception 'RESTRICAO_DE_SOBREPOSICAO_AUSENTE';
  end if;
end $$;

-- Acesso direto por `authenticated` continua negado, mesmo com o wrapper liberado.
set role authenticated;
do $$ begin
  begin
    perform 1 from cadastro.substituicao_case_manager;
    raise exception 'TABELA_EXPOSTA';
  exception when insufficient_privilege then null;
  end;
  begin
    perform cadastro.case_manager_atual('40000000-0000-4000-8000-000000000001');
    raise exception 'FUNCAO_EXPOSTA';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
