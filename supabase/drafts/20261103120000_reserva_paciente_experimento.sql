-- EXPERIMENTO: não expor, nem conceder execução. Capacidade/identidade dependem
-- de fixtures; emissão e canal reais, contratos e revisão S-02 estão pendentes.
-- O efeito do paciente e a confirmação da reserva ocorrem na mesma transação.
-- Este arquivo isolado cria o wrapper como SECURITY INVOKER e não o expõe.
-- A composição em 20261103170000 é apenas experimental: owner dedicado e
-- privilégios ainda exigem revisão independente antes de qualquer uso real.
alter table reserva_fixture.reserva add column chave_paciente text;
alter table reserva_fixture.reserva add column digest_paciente text;
alter table reserva_fixture.reserva add column paciente_resultado uuid;

create function reserva_fixture.criar_paciente_reservado_fixture(p_transporte jsonb,p_geracao_sessao bigint,p_verificador bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; v_ator uuid; v_request uuid; v_reserva uuid; v_geracao bigint; v_reserva_linha reserva_fixture.reserva; v_resultado jsonb; v_paciente uuid; v_linhas bigint;
begin
 begin
  v_request:=(e->>'request_id')::uuid; v_reserva:=(e->>'reserva_id')::uuid; v_geracao:=(e->>'geracao_reserva')::bigint;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end;
 if v_request is null or v_reserva is null or v_geracao is null or v_geracao<1 then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 if reserva_fixture.capacidade_vigente_fixture(v_geracao,p_geracao_sessao,p_verificador) is not true
   or a->>'request_id' is distinct from v_request::text
   or experimento_atestado.verificar_criar_paciente(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is not true then
  insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),'reserva_paciente_fixture','fixture.reserva.criar_paciente','reserva',null,'negado',v_request);
  get diagnostics v_linhas = row_count;
  if v_linhas<>1 then raise exception 'AUDITORIA_NAO_REGISTRADA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 v_ator:=auth.uid();
 select * into v_reserva_linha from reserva_fixture.reserva where id=v_reserva and ator_id=v_ator and geracao=v_geracao for update;
 if not found or v_reserva_linha.fechada or v_reserva_linha.estado not in ('aberta','confirmada') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),v_ator,'fixture.reserva.criar_paciente','reserva',v_reserva,'negado',v_request);
  get diagnostics v_linhas = row_count;
  if v_linhas<>1 then raise exception 'AUDITORIA_NAO_REGISTRADA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 if v_reserva_linha.estado='confirmada' and
   (v_reserva_linha.chave_paciente is distinct from e->>'chave_idempotencia' or v_reserva_linha.digest_paciente is distinct from e->>'digest_idempotencia') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),v_ator,'fixture.reserva.criar_paciente','reserva',v_reserva,'negado',v_request);
  get diagnostics v_linhas = row_count;
  if v_linhas<>1 then raise exception 'AUDITORIA_NAO_REGISTRADA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',v_request);
 end if;
 -- A função interna revalida atestado e autoridade após espera de locks.
 v_resultado:=experimento_atestado.criar_paciente(p_transporte);
 if v_resultado->>'ok' is distinct from 'true' then return v_resultado; end if;
 v_paciente:=(v_resultado#>>'{dados,paciente_id}')::uuid;
 if v_paciente is null then raise exception using errcode='P0002',message='PACIENTE_NAO_CONFIRMADO'; end if;
 if v_reserva_linha.estado='confirmada' then
  if v_reserva_linha.paciente_resultado is distinct from v_paciente then raise exception using errcode='23514',message='RESULTADO_DIVERGENTE'; end if;
 else
  insert into reserva_fixture.efeito(reserva_id) values(v_reserva);
  get diagnostics v_linhas = row_count;
  if v_linhas<>1 then raise exception using errcode='P0002',message='EFEITO_NAO_REGISTRADO'; end if;
  update reserva_fixture.reserva set estado='confirmada',chave_paciente=e->>'chave_idempotencia',digest_paciente=e->>'digest_idempotencia',paciente_resultado=v_paciente where id=v_reserva;
  get diagnostics v_linhas = row_count;
  if v_linhas<>1 then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
 end if;
 return v_resultado;
end $$;
revoke all on function reserva_fixture.criar_paciente_reservado_fixture(jsonb,bigint,bytea) from public,anon,authenticated;
