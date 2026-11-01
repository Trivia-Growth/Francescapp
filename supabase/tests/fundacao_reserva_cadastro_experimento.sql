-- PostgreSQL descartável; sem claims, provas de sessão ou emissão real.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'postgres' or inet_server_addr() is not null
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
   or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'cluster isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
insert into reserva_fixture.ator(id) values('a1000000-0000-4000-8000-000000000001');
do $$
declare a uuid:='a1000000-0000-4000-8000-000000000001'; r uuid:='a2000000-0000-4000-8000-000000000001'; outro uuid:='a2000000-0000-4000-8000-000000000002';
begin
 if reserva_fixture.consultar(a) is distinct from 'indeterminada' then raise exception 'ausência interpretada como falha'; end if;
 if reserva_fixture.abrir(a,1,r) is distinct from 'aberta' then raise exception 'reserva válida negada'; end if;
 if reserva_fixture.consultar(a) is distinct from 'aberta' then raise exception 'reserva não recuperável'; end if;
 if reserva_fixture.abrir(a,1,r) is distinct from 'aberta' then raise exception 'resposta perdida não reconciliada'; end if;
 if reserva_fixture.abrir(a,1,outro) is distinct from 'bloqueada' then raise exception 'reserva paralela admitida'; end if;
 if reserva_fixture.fechar(a,1,r) is distinct from 'cancelada' then raise exception 'fechamento negado'; end if;
 if reserva_fixture.confirmar(a,1,r) is distinct from false then raise exception 'criação atrasada após fechamento'; end if;
 if reserva_fixture.abrir(a,1,outro) is distinct from 'geracao_antiga' then raise exception 'reserva atrasada após fechamento'; end if;
 if reserva_fixture.abrir(a,2,outro) is distinct from 'aberta' then raise exception 'nova geração negada'; end if;
 if reserva_fixture.confirmar(a,2,outro) is distinct from true or reserva_fixture.confirmar(a,2,outro) is distinct from true then raise exception 'confirmação idempotente incorreta'; end if;
 if reserva_fixture.consultar(a) is distinct from 'confirmada' then raise exception 'resposta perdida não confirmada'; end if;
 if (select count(*) from reserva_fixture.efeito where reserva_id=outro)<>1 then raise exception 'duplicação do efeito'; end if;
 if reserva_fixture.fechar(a,2,outro) is distinct from 'confirmada' then raise exception 'confirmação perdida não recuperada'; end if;
end $$;
rollback;
