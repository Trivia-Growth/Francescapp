-- FR-024: preparação da prova de concorrência real. Apenas fixtures FICTÍCIAS em
-- PostgreSQL descartável; as duas conexões concorrentes ficam no runner, não aqui.
\set ON_ERROR_STOP on
\ir acompanhamento_caso_local.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261126120000_realizacao_compromisso.sql
\ir ../migrations/20261126120100_grant_realizacao_compromisso_teste.sql

-- Mesma versão vigente nas duas conexões: a segunda gravação tem de ser recusada pelo banco.
create function public.registrar_realizacao_fixture(p_registro uuid, p_chave text, p_situacao text)
returns jsonb language plpgsql as $$
declare
  prof uuid := '10000000-0000-4000-8000-000000000002'; sp uuid := '20000000-0000-4000-8000-000000000002';
  t jsonb; r jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', prof, 'session_id', sp,
    'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true);
  t := public.assinar_anamnese_fixture(jsonb_build_object('request_id', gen_random_uuid(),
    'registro_id', p_registro, 'evento_id', 'evt-concorrente', 'situacao', p_situacao,
    'motivo', case when p_situacao = 'faltou' then 'transporte' else null end,
    'versao_esperada', 0, 'chave_idempotencia', p_chave,
    'digest_idempotencia', repeat('d', 43)),
    'api.registrar_realizacao_compromisso', prof, sp);
  execute 'set local role authenticated';
  r := api.realizacao_compromisso_privado(t);
  execute 'reset role';
  return r;
end $$;
