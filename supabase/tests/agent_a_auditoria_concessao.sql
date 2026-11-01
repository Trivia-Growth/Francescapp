-- Tarefa 2.3 / D-09 / FR-037/039/042: concessão e evidência indivisíveis.
-- Fixture inteiramente sintética; todas as gravações terminam em ROLLBACK.
-- Requer migrações até 20261027160000 e executor SQL privilegiado de testes.
-- Execução futura: psql -v ON_ERROR_STOP=1 -f supabase/tests/agent_a_auditoria_concessao.sql
-- Não valida HTTP, autorização/RLS, concorrência, cifra real nem RPC de domínio.
-- A função interna registra ledger/evento; o chamador deve incluir a mutação
-- na mesma subtransação. Este teste demonstra esse contrato de composição.

begin;

do $bloco$
declare
  v_ator constant uuid := 'a2300000-0000-4000-8000-000000000001';
  v_concessao constant uuid := 'a2300000-0000-4000-8000-000000000002';
  v_request_falha constant uuid := 'a2300000-0000-4000-8000-000000000003';
  v_request_sucesso constant uuid := 'a2300000-0000-4000-8000-000000000004';
  v_operacao constant text := 'api.teste-agent-a.revogar-concessao';
  v_chave_falha constant text := 'agent-a-auditoria-concessao-falha';
  v_chave_sucesso constant text := 'agent-a-auditoria-concessao-sucesso';
  -- Envelope só satisfaz o formato; não representa criptografia válida.
  v_envelope constant jsonb := '{"formato":1,"key_id":"agent-a-ficticio","nonce":"bm9uY2U=","ciphertext":"Y2lwaGVy","tag":"dGFn"}';
  v_antes identidade.concessao_equipe;
  v_depois identidade.concessao_equipe;
  v_requisicao operacao.requisicao;
  v_evento auditoria.evento;
  v_schema text;
  v_tabela text;
  v_constraint text;
  v_falha_observada boolean := false;
begin
  insert into auth.users (id) values (v_ator);
  insert into public.usuario (id, perfil) values (v_ator, 'administrador');
  insert into identidade.concessao_equipe (
    id, email_cifrado, email_hmac, perfil, metodo, estado,
    criado_por_usuario_id, motivo_cifrado
  ) values (
    v_concessao, v_envelope, 'hmac-ficticio-agent-a-auditoria',
    'profissional', 'google_workspace', 'pendente', v_ator, v_envelope
  );
  select * into strict v_antes
  from identidade.concessao_equipe where id = v_concessao;

  -- O EXCEPTION cria a subtransação: a mutação ocorre ANTES da tentativa
  -- de registrar ledger/evento, dentro do mesmo bloco que sofrerá rollback.
  begin
    update identidade.concessao_equipe
    set estado = 'revogada', versao = versao + 1,
        revogada_em = clock_timestamp(), revogada_por_usuario_id = v_ator,
        motivo_revogacao_cifrado = v_envelope, atualizada_em = clock_timestamp()
    where id = v_concessao and estado = 'pendente' and versao = v_antes.versao
    returning * into strict v_depois;

    if v_depois.estado <> 'revogada' or v_depois.versao <> v_antes.versao + 1 then
      raise exception 'FALHA: fixture não alterou concessão antes da auditoria';
    end if;

    -- Onze argumentos; ação vazia viola especificamente evento_acao_check.
    -- Ledger é válido: a falha precisa ocorrer na inserção da auditoria.
    perform operacao.registrar_requisicao_auditada(
      p_ator_usuario_id => v_ator,
      p_operacao => v_operacao,
      p_chave_idempotencia => v_chave_falha,
      p_digest_entrada => 'digest-ficticio-agent-a-falha',
      p_resultado_id => v_concessao,
      p_resultado_versao => v_depois.versao,
      p_acao_auditoria => '',
      p_tipo_objeto => 'concessao_equipe',
      p_objeto_id => v_concessao,
      p_resultado_auditoria => 'permitido',
      p_request_id => v_request_falha
    );
    raise exception 'FALHA: auditoria inválida foi aceita';
  exception when check_violation then
    get stacked diagnostics v_schema = schema_name, v_tabela = table_name,
      v_constraint = constraint_name;
    if v_schema is distinct from 'auditoria'
      or v_tabela is distinct from 'evento'
      or v_constraint is distinct from 'evento_acao_check' then
      raise;
    end if;
    v_falha_observada := true;
  end;

  select * into strict v_depois
  from identidade.concessao_equipe where id = v_concessao;
  if not v_falha_observada or to_jsonb(v_depois) is distinct from to_jsonb(v_antes) then
    raise exception 'FALHA: falha de auditoria não restaurou concessão integralmente';
  end if;
  if exists (
    select 1 from operacao.requisicao
    where ator_usuario_id = v_ator and operacao = v_operacao
      and chave_idempotencia = v_chave_falha
  ) or exists (
    select 1 from auditoria.evento
    where request_id = v_request_falha or objeto_id = v_concessao
  ) then
    raise exception 'FALHA: subtransação falha deixou ledger ou evento parcial';
  end if;

  -- Controle positivo: mesmo tipo de mutação, agora com auditoria válida.
  -- O handler apenas propaga falhas; garante subtransação também neste caso.
  begin
    update identidade.concessao_equipe
    set estado = 'revogada', versao = versao + 1,
        revogada_em = clock_timestamp(), revogada_por_usuario_id = v_ator,
        motivo_revogacao_cifrado = v_envelope, atualizada_em = clock_timestamp()
    where id = v_concessao and estado = 'pendente' and versao = v_antes.versao
    returning * into strict v_depois;

    select * into strict v_requisicao
    from operacao.registrar_requisicao_auditada(
      p_ator_usuario_id => v_ator,
      p_operacao => v_operacao,
      p_chave_idempotencia => v_chave_sucesso,
      p_digest_entrada => 'digest-ficticio-agent-a-sucesso',
      p_resultado_id => v_concessao,
      p_resultado_versao => v_depois.versao,
      p_acao_auditoria => 'teste.agent_a.concessao_revogada',
      p_tipo_objeto => 'concessao_equipe',
      p_objeto_id => v_concessao,
      p_resultado_auditoria => 'permitido',
      p_request_id => v_request_sucesso
    );

    select * into strict v_evento from auditoria.evento
    where ator_usuario_id = v_ator and objeto_id = v_concessao
      and request_id = v_request_sucesso;
  exception when others then
    raise;
  end;

  if not exists (
    select 1 from identidade.concessao_equipe
    where id = v_concessao and estado = 'revogada'
      and versao = v_antes.versao + 1 and revogada_em is not null
      and revogada_por_usuario_id = v_ator and motivo_revogacao_cifrado = v_envelope
  ) or (select count(*) from operacao.requisicao where ator_usuario_id = v_ator) <> 1
    or (select count(*) from auditoria.evento where ator_usuario_id = v_ator) <> 1 then
    raise exception 'FALHA: concessão, ledger e evento não sobreviveram juntos à subtransação';
  end if;

  -- Allowlist de conteúdo completo das linhas, removendo somente IDs gerados
  -- e datas. Qualquer campo/payload extra (mesmo textual) reprova a fixture.
  -- Não prova que textos livres rejeitem PII em outros chamadores.
  if (to_jsonb(v_requisicao) - array['id', 'criada_em', 'atualizada_em'])
    is distinct from jsonb_build_object(
      'ator_usuario_id', v_ator, 'operacao', v_operacao,
      'chave_idempotencia', v_chave_sucesso,
      'digest_entrada', 'digest-ficticio-agent-a-sucesso', 'estado', 'registrada',
      'resultado_id', v_concessao, 'resultado_versao', v_antes.versao + 1
    ) then
    raise exception 'FALHA: ledger contém conteúdo fora dos metadados permitidos';
  end if;
  if (to_jsonb(v_evento) - array['id', 'instante'])
    is distinct from jsonb_build_object(
      'ator_usuario_id', v_ator, 'operador_restrito', null::text,
      'acao', 'teste.agent_a.concessao_revogada', 'tipo_objeto', 'concessao_equipe',
      'objeto_id', v_concessao, 'resultado', 'permitido', 'request_id', v_request_sucesso
    ) or v_requisicao.id = v_request_sucesso then
    raise exception 'FALHA: evento contém payload extra ou perdeu correlação HTTP';
  end if;
end
$bloco$;

rollback;
