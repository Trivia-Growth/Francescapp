-- Auth e assinatura são fixtures; este teste não comprova integração externa.
\ir criar_paciente_privado_local.sql
create temporary table funcao_antes as
 select proowner, proacl from pg_proc where oid='operacao.criar_paciente_privado(jsonb)'::regprocedure;
\ir ../migrations/20261106210000_corrigir_auditoria_replay_paciente.sql

do $$
declare
 paciente uuid := '60000000-0000-4000-8000-000000000001';
 pedido uuid := '70000000-0000-4000-8000-000000000001';
 entrada jsonb;
 transporte jsonb;
 resposta jsonb;
 anteriores bigint;
begin
 if exists(select 1 from pg_proc p cross join funcao_antes a
  where p.oid='operacao.criar_paciente_privado(jsonb)'::regprocedure
   and (p.proowner is distinct from a.proowner or p.proacl is distinct from a.proacl)) then
  raise exception 'OWNER_OU_GRANTS_ALTERADOS';
 end if;
 entrada := jsonb_build_object(
  'request_id', pedido, 'paciente_id', paciente,
  'reserva_id', '20000000-0000-4000-8000-000000000010', 'geracao_reserva', 1,
  'auditoria_id', '80000000-0000-4000-8000-000000000001',
  'chave_idempotencia', 'chave-ficticia', 'digest_idempotencia', repeat('a', 43),
  'nome', jsonb_build_object('formato', 1, 'key_id', 'teste', 'nonce', repeat('a', 16), 'ciphertext', 'YQ', 'tag', repeat('a', 22)),
  'aad', jsonb_build_object('nome', jsonb_build_object('tabela', 'cadastro.paciente', 'registro_id', paciente::text, 'campo', 'nome', 'formato', 1)),
  'atestado', jsonb_build_object('usuario_id', auth.uid(), 'session_id', auth.jwt()->>'session_id', 'request_id', pedido,
   'operacao', 'api.criar_paciente', 'emitido_em', clock_timestamp()-interval '1 second',
   'expira_em', clock_timestamp()+interval '20 seconds', 'mac', 'valido'));
 transporte := jsonb_build_object('entrada', entrada, 'entrada_canonica', '{}', 'dados_canonicos', '{}');
 select count(*) into anteriores from auditoria.evento where request_id=pedido and resultado='negado';
 for tentativa in 1..2 loop
  resposta := operacao.criar_paciente_privado(transporte);
  if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_ACEITO'; end if;
 end loop;
 if (select count(*) from auditoria.evento where request_id=pedido and resultado='negado') <> anteriores+2 then
  raise exception 'REPLAY_NEGADO_NAO_AUDITADO';
 end if;
 create trigger falha before insert on auditoria.evento for each row execute function auditoria.falhar_fixture();
 begin
  perform operacao.criar_paciente_privado(transporte);
  raise exception 'AUDITORIA_IGNORADA';
 exception when raise_exception then if sqlerrm <> 'AUDITORIA_FIXTURE' then raise; end if; end;
 drop trigger falha on auditoria.evento;
 if (select count(*) from auditoria.evento where request_id=pedido and resultado='negado') <> anteriores+2 then
  raise exception 'AUDITORIA_PARCIAL';
 end if;
end $$;
