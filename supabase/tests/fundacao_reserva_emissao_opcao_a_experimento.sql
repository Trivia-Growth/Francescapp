-- Apenas clone descartável; sessão, prova, claims e dados são fictícios.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'ffcm_reserva_emissao_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
\ir ../drafts/20261103180000_reserva_emissao_opcao_a_experimento.sql
insert into reserva_fixture.ator(id) values('61000000-0000-4000-8000-000000000001');
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',true);
do $$
declare p bytea:=decode(repeat('01',32),'hex'); q uuid:='d1000000-0000-4000-8000-000000000001';
 a uuid:='61000000-0000-4000-8000-000000000001'; v uuid:='d2000000-0000-4000-8000-000000000001'; x jsonb; y jsonb;
begin
 if reserva_fixture.emitir_opcao_a(1,q,1,decode(repeat('02',32),'hex')) is not null then raise exception 'prova errada aceita'; end if;
 x:=reserva_fixture.emitir_opcao_a(1,q,1,p);
 if x->>'epoca'<>'1' or (x->>'capacidade')::uuid is null then raise exception 'emissão válida negada'; end if;
 y:=reserva_fixture.emitir_opcao_a(1,q,1,p);
 if y is distinct from x then raise exception 'resposta perdida não recuperada'; end if;
 if reserva_fixture.abrir(a,1,v)<>'aberta' or reserva_fixture.fechar(a,1,v)<>'cancelada' then raise exception 'barreira não avançou'; end if;
 if reserva_fixture.emitir_opcao_a(1,q,1,p) is not null then raise exception 'emissão antiga aceita após fechamento'; end if;
 -- CONTRAEXEMPLO: com a mesma prova de sessão, basta adivinhar época seguinte.
 y:=reserva_fixture.emitir_opcao_a(2,'d1000000-0000-4000-8000-000000000002',1,p);
 if y is null then raise exception 'contraexemplo mudou; investigar antes de concluir'; end if;
end $$;
rollback;
