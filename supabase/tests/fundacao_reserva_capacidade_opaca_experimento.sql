-- Apenas clone descartável; identidade, provas e tokens são fictícios.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'ffcm_reserva_opaca_fixture' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'clone isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
\ir ../drafts/20261103190000_reserva_capacidade_opaca_experimento.sql
insert into reserva_fixture.ator(id) values('61000000-0000-4000-8000-000000000001');
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',true);
-- Capacidade prévia simulada; origem/entrega reais não são provadas.
insert into reserva_fixture.capacidade_opaca_fixture values('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1,extensions.digest(decode(repeat('09',32),'hex'),'sha256'));
do $$
declare a uuid:='61000000-0000-4000-8000-000000000001'; p bytea:=decode(repeat('01',32),'hex');
 velha bytea:=decode(repeat('09',32),'hex'); nova bytea; r uuid:='e1000000-0000-4000-8000-000000000001';
begin
 if reserva_fixture.verificar_opaca_fixture(1,velha,1,p) is not true then raise exception 'controle positivo negado'; end if;
 if reserva_fixture.verificar_opaca_fixture(1,velha,1,decode(repeat('02',32),'hex')) is not false then raise exception 'prova errada aceita'; end if;
 if reserva_fixture.abrir(a,1,r)<>'aberta' then raise exception 'reserva negada'; end if;
 nova:=reserva_fixture.fechar_rotacionando_opaca_fixture(r,1,velha,1,p);
 if nova is null or nova=velha or reserva_fixture.verificar_opaca_fixture(2,nova,1,p) is not true then raise exception 'rotação negada'; end if;
 if reserva_fixture.verificar_opaca_fixture(1,velha,1,p) is not false or reserva_fixture.verificar_opaca_fixture(2,velha,1,p) is not false then raise exception 'requisição com capacidade antiga aceita'; end if;
 if reserva_fixture.fechar_rotacionando_opaca_fixture(r,1,velha,1,p) is not null then raise exception 'repetição antiga devolveu capacidade'; end if;
 if reserva_fixture.abrir(a,2,'e1000000-0000-4000-8000-000000000002')<>'aberta' then raise exception 'nova época negada'; end if;
 -- Simula resposta perdida: não guardar retorno. Há apenas hash da nova prova.
 perform reserva_fixture.fechar_rotacionando_opaca_fixture('e1000000-0000-4000-8000-000000000002',2,nova,1,p);
 if reserva_fixture.verificar_opaca_fixture(2,nova,1,p) is not false or reserva_fixture.verificar_opaca_fixture(3,nova,1,p) is not false then raise exception 'prova antiga após perda aceita'; end if;
 if not exists(select 1 from reserva_fixture.capacidade_opaca_fixture where epoca=3 and octet_length(verificador)=32) then raise exception 'verificador ausente após perda'; end if;
end $$;
rollback;
