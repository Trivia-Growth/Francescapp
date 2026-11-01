-- Fundação FFCMApp — testes da tarefa 2.3 / D-06 e D-09.
-- Não persiste fixtures: execute com psql -v ON_ERROR_STOP=1 quando aplicável.

begin;

insert into auth.users (id)
values ('71000000-0000-4000-8000-000000000001');

insert into public.usuario (id, perfil)
values ('71000000-0000-4000-8000-000000000001', 'administrador');

do $bloco$
declare
  v_primeira operacao.requisicao;
  v_repetida operacao.requisicao;
  v_evento uuid;
begin
  select * into v_primeira
  from operacao.registrar_requisicao_auditada(
    '71000000-0000-4000-8000-000000000001',
    'api.teste-idempotencia',
    'chave-ficticia-1',
    'digest-ficticio-a',
    null,
    null,
    'teste.idempotencia',
    'requisicao',
    '72000000-0000-4000-8000-000000000001',
    'permitido', '73000000-0000-4000-8000-000000000001'
  );

  select * into v_repetida
  from operacao.registrar_requisicao_auditada(
    '71000000-0000-4000-8000-000000000001',
    'api.teste-idempotencia',
    'chave-ficticia-1',
    'digest-ficticio-a',
    null,
    null,
    'teste.idempotencia',
    'requisicao',
    '72000000-0000-4000-8000-000000000001',
    'permitido', '73000000-0000-4000-8000-000000000002'
  );

  if v_primeira.id <> v_repetida.id
    or (select count(*) from operacao.requisicao where operacao = 'api.teste-idempotencia') <> 1 then
    raise exception 'FALHA: repetição idêntica não devolveu o mesmo registro';
  end if;

  begin
    perform operacao.registrar_requisicao_auditada(
      '71000000-0000-4000-8000-000000000001',
      'api.teste-idempotencia',
      'chave-ficticia-1',
      'digest-ficticio-b',
      null,
      null,
      'teste.idempotencia',
      'requisicao',
      '72000000-0000-4000-8000-000000000001',
      'permitido', '73000000-0000-4000-8000-000000000003'
    );
    raise exception 'FALHA: repetição com digest diferente foi aceita';
  exception
    when raise_exception then
      if sqlerrm <> 'CONFLITO_IDEMPOTENCIA' then
        raise;
      end if;
  end;

  begin
    perform operacao.registrar_requisicao_auditada(
      '71000000-0000-4000-8000-000000000001',
      'api.teste-auditoria-falha',
      'chave-ficticia-2',
      'digest-ficticio-c',
      null,
      null,
      '',
      'requisicao',
      '72000000-0000-4000-8000-000000000002',
      'permitido', '73000000-0000-4000-8000-000000000004'
    );
    raise exception 'FALHA: trilha inválida não interrompeu a mutação';
  exception
    when check_violation then null;
  end;

  if exists (
    select 1 from operacao.requisicao
    where operacao = 'api.teste-auditoria-falha'
  ) then
    raise exception 'FALHA: falha de auditoria deixou registro idempotente parcial';
  end if;

  perform operacao.registrar_requisicao_auditada(
    '71000000-0000-4000-8000-000000000001',
    'api.teste-negativa',
    'chave-ficticia-3',
    'digest-ficticio-d',
    null,
    null,
    'teste.negativa',
    'paciente',
    '72000000-0000-4000-8000-000000000003',
    'negado', '73000000-0000-4000-8000-000000000005'
  );

  select id into v_evento
  from auditoria.evento
  where acao = 'teste.idempotencia'
    and resultado = 'permitido';

  begin
    update auditoria.evento set resultado = 'falhou' where id = v_evento;
    raise exception 'FALHA: auditoria permitiu alteração';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    delete from auditoria.evento where id = v_evento;
    raise exception 'FALHA: auditoria permitiu exclusão';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  if not exists (
    select 1 from auditoria.evento
    where acao = 'teste.negativa'
      and resultado = 'negado'
  ) then
    raise exception 'FALHA: negativa esperada não foi preservada';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema in ('auditoria', 'operacao')
      and table_name in ('evento', 'requisicao')
      and data_type in ('json', 'jsonb')
  ) then
    raise exception 'FALHA: auditoria/idempotência aceita payload estruturado';
  end if;
end
$bloco$;

rollback;
