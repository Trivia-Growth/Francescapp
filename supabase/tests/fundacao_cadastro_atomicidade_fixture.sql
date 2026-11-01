-- Prova parcial de atomicidade D-09 em cluster local; NÃO é RPC de cadastro.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'ffcm_cadastro_teste_local' or inet_server_addr() is not null
     or current_setting('unix_socket_directories') not like '/tmp/ffcm-cadastro.%' then
    raise exception 'Cluster local descartável obrigatório';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create schema cadastro;
create schema auditoria;
create schema operacao;
create table cadastro.paciente (id uuid primary key);
create table operacao.requisicao (
  id uuid primary key, ator_usuario_id uuid not null, operacao text not null,
  chave_idempotencia text not null, digest_entrada text not null, estado text not null,
  resultado_id uuid, resultado_versao integer,
  unique (ator_usuario_id, operacao, chave_idempotencia)
);
create table auditoria.evento (
  id uuid primary key, ator_usuario_id uuid not null, acao text not null, tipo_objeto text not null,
  objeto_id uuid, resultado text not null check (resultado <> 'falha_auditoria_forcada'), request_id uuid not null
);
-- A migração substitui essa assinatura anterior; stub serve apenas ao fixture.
create function operacao.registrar_requisicao_auditada(uuid,text,text,text,uuid,integer,text,text,uuid,text)
returns void language plpgsql as $$ begin return; end $$;
\ir ../migrations/20261027160000_auditoria_correlacao_request.sql
do $$
declare
  ator uuid := '10000000-0000-4000-8000-000000000001';
  paciente uuid := '20000000-0000-4000-8000-000000000001';
  request uuid := '30000000-0000-4000-8000-000000000001';
  tentativa operacao.requisicao;
begin
  -- Falha na auditoria reverte tanto o ledger quanto a escrita da mesma transação.
  begin
    insert into cadastro.paciente values (paciente);
    perform operacao.registrar_requisicao_auditada(ator,'api.criar_paciente','chave-1','digest-1',paciente,1,'criar','paciente',paciente,'falha_auditoria_forcada',request);
    raise exception 'falha de auditoria não ocorreu';
  exception when check_violation then null; end;
  if exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao)
     or exists (select 1 from auditoria.evento) then raise exception 'falha deixou efeitos parciais'; end if;
  insert into cadastro.paciente values (paciente);
  select * into tentativa from operacao.registrar_requisicao_auditada(ator,'api.criar_paciente','chave-1','digest-1',paciente,1,'criar','paciente',paciente,'permitido',request);
  if tentativa.resultado_id is distinct from paciente or (select count(*) from auditoria.evento) <> 1 then
    raise exception 'registro inicial inválido';
  end if;
  select * into tentativa from operacao.registrar_requisicao_auditada(ator,'api.criar_paciente','chave-1','digest-1',paciente,1,'criar','paciente',paciente,'permitido',request);
  if tentativa.resultado_id is distinct from paciente or (select count(*) from operacao.requisicao) <> 1
     or (select count(*) from auditoria.evento) <> 1 then raise exception 'repetição duplicou operação'; end if;
  begin
    perform operacao.registrar_requisicao_auditada(ator,'api.criar_paciente','chave-1','digest-2',paciente,1,'criar','paciente',paciente,'permitido',request);
    raise exception 'conflito idempotente aceito';
  exception when raise_exception then
    if sqlerrm <> 'CONFLITO_IDEMPOTENCIA' then raise; end if;
  end;
end $$;
rollback;
