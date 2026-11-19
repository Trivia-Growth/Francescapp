-- FR-037/DF-024: preparação da prova de concorrência real. Apenas fixtures fictícias em
-- PostgreSQL descartável; as duas conexões concorrentes ficam no runner, não aqui.
\set ON_ERROR_STOP on
\ir acompanhamento_caso_local.sql
\ir ../migrations/20261118100000_habilitacao_plano_crise_concessao.sql
\ir ../migrations/20261118110000_plano_crise_versoes_privadas.sql
\ir ../migrations/20261118120000_plano_crise_operacoes_privadas.sql
\ir ../migrations/20261118130000_grant_plano_crise_teste.sql
\ir ../migrations/20261125040000_plano_crise_case_manager_atual.sql
\ir ../migrations/20261126100000_substituicao_case_manager.sql
\ir ../migrations/20261126100100_grant_substituicao_cm_teste.sql

-- Período idêntico nas duas conexões: a sobreposição tem de ser impedida pelo banco.
create function public.registrar_sub_fixture(p_sub uuid, p_chave text) returns jsonb
language plpgsql as $$
declare
  admin uuid := '10000000-0000-4000-8000-000000000001'; sa uuid := '20000000-0000-4000-8000-000000000001';
  prof uuid := '10000000-0000-4000-8000-000000000002'; caso uuid := '40000000-0000-4000-8000-000000000001';
  t jsonb; r jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin, 'session_id', sa,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true);
  t := public.assinar_anamnese_fixture(jsonb_build_object('request_id', gen_random_uuid(),
    'paciente_id', caso, 'substituicao_id', p_sub, 'substituto_usuario_id', prof,
    'inicio', date_trunc('hour', clock_timestamp()) + interval '1 hour',
    'fim', date_trunc('hour', clock_timestamp()) + interval '5 hours',
    'chave_idempotencia', p_chave, 'digest_idempotencia', repeat('d', 43)),
    'api.registrar_substituicao_cm', admin, sa);
  execute 'set local role authenticated';
  r := api.substituicao_case_manager_privado(t);
  execute 'reset role';
  return r;
end $$;

do $$
#variable_conflict use_variable
declare admin uuid := '10000000-0000-4000-8000-000000000001'; sa uuid := '20000000-0000-4000-8000-000000000001';
  caso uuid := '40000000-0000-4000-8000-000000000001'; r jsonb;
begin
  r := public.editar_fixture(admin, sa, caso, 'conc-resp-admin', jsonb_build_object('responsavel_id', admin));
  if r->>'ok' is distinct from 'true' then raise exception 'TITULAR_CASO: %', r; end if;
end $$;
