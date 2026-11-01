-- Teste descartável: gateway é simulado, não prova PostgREST/Supabase.
\set ON_ERROR_STOP on
begin;
\ir ../drafts/recibo_identidade_gateway_experimento.sql

-- A emissão é executada apenas pelo papel que simula o gateway autenticado.
set local role recibo_gateway_fixture;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000001"}', true);
select recibo_fixture.emitir('a', 'digest1');
select recibo_fixture.emitir_vinculado('vinculado', 'cadastro', 'equipe', convert_to('dados fictícios', 'UTF8'));
reset role;

set local role recibo_executor_fixture;
do $$ begin
  begin
    perform set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000002"}', true);
    perform recibo_fixture.emitir('forjado', 'digest1');
    raise exception 'executor emitiu recibo';
  exception when insufficient_privilege then null; end;
  begin
    perform id from recibo_fixture.recibo;
    raise exception 'executor leu recibos diretamente';
  exception when insufficient_privilege then null; end;
  if pg_has_role(current_user, 'recibo_gateway_fixture', 'MEMBER') then raise exception 'executor é membro do gateway'; end if;
end $$;
reset role;
set local role recibo_owner_fixture;
do $$ begin
  if recibo_fixture.consumir_vinculado('vinculado', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'outra', 'equipe', convert_to('dados fictícios', 'UTF8')) then raise exception 'aceitou outra operação'; end if;
  if recibo_fixture.consumir_vinculado('vinculado', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'cadastro', 'familia', convert_to('dados fictícios', 'UTF8')) then raise exception 'aceitou outra audiência'; end if;
  if recibo_fixture.consumir_vinculado('vinculado', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'cadastro', 'equipe', convert_to('dados alterados', 'UTF8')) then raise exception 'aceitou outros bytes'; end if;
  if not recibo_fixture.consumir_vinculado('vinculado', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'cadastro', 'equipe', convert_to('dados fictícios', 'UTF8')) then raise exception 'negou operação vinculada'; end if;
  if recibo_fixture.consumir_vinculado('vinculado', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'cadastro', 'equipe', convert_to('dados fictícios', 'UTF8')) then raise exception 'aceitou replay vinculado'; end if;
end $$;
reset role;
set local role recibo_executor_fixture;
do $$ begin
  if recibo_fixture.consumir('a', '41000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000001', 'digest1') then raise exception 'aceitou outro usuário'; end if;
  if recibo_fixture.consumir('a', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000002', 'digest1') then raise exception 'aceitou outra sessão'; end if;
  if recibo_fixture.consumir('a', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'digest2') then raise exception 'aceitou digest alterado'; end if;
  if not recibo_fixture.consumir('a', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'digest1') then raise exception 'negou recibo correto'; end if;
  if recibo_fixture.consumir('a', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'digest1') then raise exception 'aceitou replay'; end if;
end $$;
reset role;
set local role recibo_gateway_fixture;
select recibo_fixture.emitir('expirado', 'digest1');
reset role;
update recibo_fixture.recibo set expira_em = clock_timestamp() - interval '1 second' where id='expirado';
set local role recibo_executor_fixture;
do $$ begin
  if recibo_fixture.consumir('expirado', '41000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'digest1') then raise exception 'aceitou recibo expirado'; end if;
end $$;
reset role;
rollback;
