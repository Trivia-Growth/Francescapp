-- Fixture local: claims, atestado e segredo são fictícios. Nenhuma chamada externa.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() not in ('postgres','ffcm_reserva_abertura_fixture') or inet_server_addr() is not null
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
create function pg_temp.assinar_reserva(e jsonb,p_operacao text) returns jsonb language plpgsql as $$
declare entrada text:=e::text; dados jsonb; texto text; mac text;
begin
 dados:=jsonb_build_object('key_id','v1','usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao',p_operacao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '30 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=dados::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('07',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
create function pg_temp.suprimir_evento_abertura() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm_fixture.suprimir_auditoria_abertura',true)='sim' then return null; end if;
 return new;
end $$;
create trigger suprimir_evento_abertura before insert on auditoria.evento for each row execute function pg_temp.suprimir_evento_abertura();
savepoint antes_dos_casos;
do $$
declare e jsonb:='{"request_id":"b1000000-0000-4000-8000-000000000001","reserva_id":"b2000000-0000-4000-8000-000000000001","geracao":1}'; t jsonb; r jsonb;
begin
 t:=pg_temp.assinar_reserva(e,'fixture.reserva.abrir');
 perform set_config('ffcm_fixture.suprimir_auditoria_abertura','sim',true);
 begin
  perform reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
  raise exception 'negativa sem auditoria aceita';
 exception when sqlstate 'P0002' then
  if sqlerrm<>'AUDITORIA_NAO_REGISTRADA' then raise; end if;
 end;
 perform set_config('ffcm_fixture.suprimir_auditoria_abertura','nao',true);
 r:=reserva_fixture.abrir_autorizada(t,1,decode(repeat('02',32),'hex'));
 if r->>'ok' is distinct from 'false' or exists(select 1 from reserva_fixture.reserva) then raise exception 'prova falsa criou reserva'; end if;
 r:=reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' or exists(select 1 from reserva_fixture.reserva) then raise exception 'abertura sem capacidade aceita'; end if;
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) is not true then raise exception 'capacidade fixture não vinculada'; end if;
 perform set_config('ffcm_fixture.suprimir_auditoria_abertura','sim',true);
 begin
  perform reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
  raise exception 'abertura sem auditoria aceita';
 exception when sqlstate 'P0002' then
  if sqlerrm<>'AUDITORIA_NAO_REGISTRADA' then raise; end if;
 end;
 perform set_config('ffcm_fixture.suprimir_auditoria_abertura','nao',true);
 if exists(select 1 from reserva_fixture.reserva) or exists(select 1 from reserva_fixture.ator where atual is not null) then raise exception 'auditoria ausente deixou reserva'; end if;
 r:=reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
 if r->>'estado' is distinct from 'aberta' then raise exception 'reserva autorizada negada'; end if;
 if reserva_fixture.confirmar('61000000-0000-4000-8000-000000000001',1,'b2000000-0000-4000-8000-000000000001') is not true then raise exception 'confirmação fixture negada'; end if;
 r:=reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' or r->>'estado' is distinct from 'confirmada'
  or (select count(*) from auditoria.evento where request_id='b1000000-0000-4000-8000-000000000001' and acao='fixture.reserva.abrir' and resultado='permitido')<>2
 then raise exception 'repetição confirmada auditada incorretamente'; end if;
 r:=reserva_fixture.abrir_autorizada(jsonb_set(t,'{entrada,reserva_id}','"b2000000-0000-4000-8000-000000000002"'),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' then raise exception 'entrada adulterada admitida'; end if;
 r:=reserva_fixture.abrir_autorizada(pg_temp.assinar_reserva(e,'fixture.outra.operacao'),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' then raise exception 'atestado de outra operação admitido'; end if;
 update public.usuario set perfil='profissional' where id='61000000-0000-4000-8000-000000000001';
 r:=reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' then raise exception 'perfil sem permissão admitido'; end if;
 update public.usuario set perfil='administrador' where id='61000000-0000-4000-8000-000000000001';
 perform set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000002',true);
 r:=reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' then raise exception 'outra identidade admitida'; end if;
 perform set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
 if reserva_fixture.fechar('61000000-0000-4000-8000-000000000001',1,'b2000000-0000-4000-8000-000000000001')<>'confirmada' then raise exception 'fechamento fixture falhou'; end if;
 r:=reserva_fixture.abrir_autorizada(pg_temp.assinar_reserva(jsonb_set(e,'{reserva_id}','"b2000000-0000-4000-8000-000000000003"'),'fixture.reserva.abrir'),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' or (select count(*) from reserva_fixture.reserva)<>1 then raise exception 'abertura atrasada aceita após fechamento'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"v1","nonce":"n","ciphertext":"c","tag":"t"}' where session_id='63000000-0000-4000-8000-000000000001';
 r:=reserva_fixture.abrir_autorizada(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' then raise exception 'sessão revogada admitida'; end if;
 if (select count(*) from reserva_fixture.reserva)<>1 then raise exception 'negação mudou reserva'; end if;
end $$;
rollback to savepoint antes_dos_casos;
do $$ begin
 if reserva_fixture.vincular_capacidade_fixture(1,1,decode(repeat('01',32),'hex')) is distinct from true then raise exception 'capacidade de controle ausente'; end if;
end $$;
create function pg_temp.rejeitar_evento_reserva() returns trigger language plpgsql as $$ begin raise exception 'falha-auditoria-fixture'; end $$;
create trigger teste_falha_auditoria_reserva before insert on auditoria.evento for each row execute function pg_temp.rejeitar_evento_reserva();
do $$
declare e jsonb:='{"request_id":"b1000000-0000-4000-8000-000000000002","reserva_id":"b2000000-0000-4000-8000-000000000002","geracao":1}';
begin
 begin
  perform reserva_fixture.abrir_autorizada(pg_temp.assinar_reserva(e,'fixture.reserva.abrir'),1,decode(repeat('01',32),'hex'));
  raise exception 'reserva sem auditoria aceita';
 exception when raise_exception then if sqlerrm<>'falha-auditoria-fixture' then raise; end if; end;
 if exists(select 1 from reserva_fixture.reserva) then raise exception 'falha de auditoria deixou reserva'; end if;
end $$;
rollback;
