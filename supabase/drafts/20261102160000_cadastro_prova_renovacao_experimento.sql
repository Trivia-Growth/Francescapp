-- Experimento isolado, sem grants e sem uso real. O argumento bytea é sensível:
-- a segurança do canal SQL e de logs/telemetria ainda não foi demonstrada.
-- A função chamada continua sendo uma fixture sem contrato de DTO completo.
-- O helper detém os locks até o término da mesma transação deste comando.
create function experimento_atestado.criar_paciente_com_prova_fixture(
  p_transporte jsonb, p_geracao bigint, p_verificador bytea
) returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if saida_fixture.autorizar_prova(p_geracao,p_verificador) is distinct from true then
    -- Só atribui negativa se a assinatura e a identidade forem comprovadas.
    perform experimento_atestado.auditar_negacao_confiavel(p_transporte);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),
      'request_id',p_transporte->'entrada'->'request_id');
  end if;
  return experimento_atestado.criar_paciente(p_transporte);
end $$;
revoke all on function experimento_atestado.criar_paciente_com_prova_fixture(jsonb,bigint,bytea)
  from public, anon, authenticated;
