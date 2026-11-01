-- Fixture transacional; prévia origem confiável da geração NÃO é comprovada.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'postgres' or inet_server_addr() is not null
  or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
  or current_setting('data_directory')<>current_setting('unix_socket_directories')||'/data' then raise exception 'cluster isolado obrigatório'; end if;
end $$;
\ir ../drafts/20261103090000_reserva_cadastro_experimento.sql
\ir ../drafts/20261103100000_reserva_autorizada_experimento.sql
\ir ../drafts/20261103110000_reserva_capacidade_experimento.sql
insert into reserva_fixture.ator(id) values('61000000-0000-4000-8000-000000000001');
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',true);
savepoint antes_revogacao;
do $$ begin
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) is not true
   or reserva_fixture.capacidade_vigente_fixture(1,1,decode(repeat('01',32),'hex')) is not true then raise exception 'controle positivo antes da revogação falhou'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"v1","nonce":"n","ciphertext":"c","tag":"t"}' where session_id='63000000-0000-4000-8000-000000000001';
 if reserva_fixture.capacidade_vigente_fixture(1,1,decode(repeat('01',32),'hex')) is not false then raise exception 'capacidade ainda válida após revogação'; end if;
end $$;
rollback to savepoint antes_revogacao;
savepoint antes_emissao_revogada;
do $$ begin
 if exists(select 1 from reserva_fixture.capacidade_fixture) then raise exception 'fixture de emissão não está vazia'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"v1","nonce":"n","ciphertext":"c","tag":"t"}' where session_id='63000000-0000-4000-8000-000000000001';
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) is not false or exists(select 1 from reserva_fixture.capacidade_fixture) then raise exception 'sessão revogada recebeu novo vínculo'; end if;
end $$;
rollback to savepoint antes_emissao_revogada;
do $$
declare a uuid:='61000000-0000-4000-8000-000000000001'; s uuid:='63000000-0000-4000-8000-000000000001'; r uuid:='b2000000-0000-4000-8000-000000000001';
begin
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('02',32),'hex')) is distinct from false then raise exception 'prova incorreta emitiu capacidade'; end if;
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) is distinct from true then raise exception 'capacidade válida negada'; end if;
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) is distinct from true then raise exception 'resposta perdida de capacidade não recuperada'; end if;
 if not reserva_fixture.capacidade_vigente_fixture(1,1,decode(repeat('01',32),'hex')) then raise exception 'capacidade vinculada recusada'; end if;
 update public.usuario set perfil='profissional' where id=a;
 if reserva_fixture.capacidade_vigente_fixture(1,1,decode(repeat('01',32),'hex')) then raise exception 'capacidade aceita para perfil não autorizado'; end if;
 update public.usuario set perfil='administrador' where id=a;
 if reserva_fixture.abrir(a,1,r)<>'aberta' or reserva_fixture.fechar(a,1,r)<>'cancelada' then raise exception 'fixture de barreira recusada'; end if;
 if reserva_fixture.capacidade_vigente_fixture(1,1,decode(repeat('01',32),'hex')) then raise exception 'capacidade antiga aceita após barreira'; end if;
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) or reserva_fixture.vincular_capacidade_fixture(2,1,decode(repeat('01',32),'hex')) then raise exception 'sessão antiga ganhou geração após barreira'; end if;
 if not exists(select 1 from reserva_fixture.capacidade_fixture where session_id=s and usuario_id=a and geracao=1) then raise exception 'capacidade alterada'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=a,motivo_revogacao_cifrado='{"formato":1,"key_id":"v1","nonce":"n","ciphertext":"c","tag":"t"}' where session_id=s;
 if reserva_fixture.vincular_capacidade_fixture(2,1,decode(repeat('01',32),'hex')) or reserva_fixture.capacidade_vigente_fixture(2,1,decode(repeat('01',32),'hex')) then raise exception 'sessão revogada emitiu capacidade'; end if;
end $$;
rollback;
