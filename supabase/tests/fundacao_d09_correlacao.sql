-- D-09: correlaciona auditoria ao request HTTP, independente do ID do ledger.
-- Fixtures sintéticas, revertidas ao final; psql exige -v ON_ERROR_STOP=1.
begin;

insert into auth.users (id) values ('81000000-0000-4000-8000-000000000001');
insert into public.usuario (id, perfil)
values ('81000000-0000-4000-8000-000000000001', 'administrador');

do $bloco$
declare
  v_requisicao operacao.requisicao;
  v_request constant uuid := '82000000-0000-4000-8000-000000000001';
begin
  begin
    perform operacao.registrar_requisicao_auditada(
      '81000000-0000-4000-8000-000000000001'::uuid,
      'api.teste-correlacao', 'chave-ficticia-correlacao', 'digest-ficticio',
      null::uuid, null::integer, 'teste.correlacao', 'requisicao',
      '82000000-0000-4000-8000-000000000002'::uuid, 'permitido', null::uuid
    );
    raise exception 'FALHA: request ausente foi aceito';
  exception when null_value_not_allowed then
    if sqlerrm <> 'REQUEST_ID_OBRIGATORIO' then raise; end if;
  end;
  if exists (select 1 from operacao.requisicao where operacao = 'api.teste-correlacao') then
    raise exception 'FALHA: request ausente deixou registro';
  end if;

  select * into v_requisicao from operacao.registrar_requisicao_auditada(
    '81000000-0000-4000-8000-000000000001'::uuid,
    'api.teste-correlacao', 'chave-ficticia-correlacao', 'digest-ficticio',
    null::uuid, null::integer, 'teste.correlacao', 'requisicao',
    '82000000-0000-4000-8000-000000000002'::uuid, 'permitido', v_request
  );

  if v_requisicao.id = v_request or not exists (
    select 1 from auditoria.evento
    where acao = 'teste.correlacao' and request_id = v_request
  ) then
    raise exception 'FALHA: auditoria não correlaciona request original';
  end if;

  begin
    perform operacao.registrar_requisicao_auditada(
      '81000000-0000-4000-8000-000000000001'::uuid,
      'api.teste-correlacao', 'chave-ficticia-correlacao', 'digest-ficticio',
      null::uuid, null::integer, 'teste.correlacao', 'requisicao',
      '82000000-0000-4000-8000-000000000002'::uuid, 'permitido', null::uuid
    );
    raise exception 'FALHA: repetição com request ausente foi aceita';
  exception when null_value_not_allowed then
    if sqlerrm <> 'REQUEST_ID_OBRIGATORIO' then raise; end if;
  end;
end
$bloco$;

rollback;
