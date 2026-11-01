-- Experimento local: a operação e a auditoria abaixo são apenas fixtures.
\set ON_ERROR_STOP on
begin;
\ir ../drafts/recibo_identidade_gateway_experimento.sql
set local role recibo_owner_fixture;
create table recibo_fixture.operacao (id text primary key);
create table recibo_fixture.auditoria (id text primary key);
create table recibo_fixture.operacao_vinculada (id text primary key, dados bytea not null);
create function recibo_fixture.operar_vinculado(p_id text, p_bytes bytea) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not recibo_fixture.consumir_vinculado(p_id, '41000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000001', 'cadastro', 'equipe', p_bytes) then return false; end if;
  insert into recibo_fixture.operacao_vinculada values (p_id, p_bytes);
  insert into recibo_fixture.auditoria values (p_id);
  return true;
end $$;
revoke all on function recibo_fixture.operar_vinculado(text,bytea) from public;
grant execute on function recibo_fixture.operar_vinculado(text,bytea) to recibo_executor_fixture;
create function recibo_fixture.operar(p_id text, p_falhar boolean default false) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not recibo_fixture.consumir(p_id, '41000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000001', 'digest1') then return false; end if;
  insert into recibo_fixture.operacao values (p_id);
  insert into recibo_fixture.auditoria values (p_id);
  if p_falhar then raise exception 'falha fictícia'; end if;
  return true;
end $$;
revoke all on function recibo_fixture.operar(text,boolean) from public;
grant execute on function recibo_fixture.operar(text,boolean) to recibo_executor_fixture;
reset role;
set local role recibo_gateway_fixture;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000001"}', true);
select recibo_fixture.emitir('rollback', 'digest1');
select recibo_fixture.emitir('concorrente', 'digest1');
select recibo_fixture.emitir_vinculado('bytes', 'cadastro', 'equipe', convert_to('dados fictícios', 'UTF8'));
select recibo_fixture.emitir_vinculado('rollback-vinculado', 'cadastro', 'equipe', convert_to('dados fictícios', 'UTF8'));
select recibo_fixture.emitir_vinculado('concorrente', 'cadastro', 'equipe', convert_to('dados fictícios', 'UTF8'));
reset role;
set local role recibo_executor_fixture;
do $$ begin
  begin
    perform recibo_fixture.consumir_vinculado('bytes', '41000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000001', 'cadastro', 'equipe', convert_to('dados fictícios', 'UTF8'));
    raise exception 'executor consumiu recibo diretamente';
  exception when insufficient_privilege then null; end;
  if recibo_fixture.operar_vinculado('bytes', convert_to('dados alterados', 'UTF8')) then raise exception 'operação aceitou outros bytes'; end if;
  if not recibo_fixture.operar_vinculado('bytes', convert_to('dados fictícios', 'UTF8')) then raise exception 'operação válida recusada'; end if;
  if recibo_fixture.operar_vinculado('bytes', convert_to('dados fictícios', 'UTF8')) then raise exception 'operação repetida'; end if;
  begin
    if not recibo_fixture.operar_vinculado('rollback-vinculado', convert_to('dados fictícios', 'UTF8')) then raise exception 'operação vinculada recusada'; end if;
    raise exception 'falha vinculada fictícia';
  exception when raise_exception then
    if sqlerrm <> 'falha vinculada fictícia' then raise; end if;
  end;
  if not recibo_fixture.operar_vinculado('rollback-vinculado', convert_to('dados fictícios', 'UTF8')) then raise exception 'rollback consumiu recibo vinculado'; end if;
  if recibo_fixture.operar_vinculado('rollback-vinculado', convert_to('dados fictícios', 'UTF8')) then raise exception 'replay vinculado após rollback'; end if;
  begin
    perform recibo_fixture.operar('rollback', true);
    raise exception 'falha esperada não ocorreu';
  exception when raise_exception then
    if sqlerrm <> 'falha fictícia' then raise; end if;
  end;
  if not recibo_fixture.operar('rollback', false) then raise exception 'rollback consumiu o recibo'; end if;
  if recibo_fixture.operar('rollback', false) then raise exception 'replay permitido'; end if;
  begin
    perform id from recibo_fixture.operacao;
    raise exception 'leitura direta da operação permitida';
  exception when insufficient_privilege then null; end;
  begin
    insert into recibo_fixture.auditoria values ('forjado');
    raise exception 'escrita direta de auditoria permitida';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select dados from recibo_fixture.operacao_vinculada where id='bytes') is distinct from convert_to('dados fictícios', 'UTF8')
    or (select count(*) from recibo_fixture.auditoria where id='bytes') <> 1 then
    raise exception 'bytes ou auditoria inconsistentes';
  end if;
  if (select count(*) from recibo_fixture.operacao where id='rollback') <> 1
    or (select count(*) from recibo_fixture.auditoria where id='rollback') <> 1 then
    raise exception 'operação e auditoria inconsistentes após rollback';
  end if;
end $$;
commit;
