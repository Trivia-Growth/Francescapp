-- Somente cluster descartável, com base D-05 e rascunho D-04 já carregados.
-- Gateway/JWT/Vault são fictícios; a escrita de contato e auditoria são SQL real.
\set ON_ERROR_STOP on
\set ffcm_fixture_concorrente 1
\ir fundacao_cadastro_prova_renovacao_integracao.sql
\ir ../drafts/20261102180000_contato_prova_experimento.sql
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values('66000000-0000-4000-8000-000000000099','{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"}','61000000-0000-4000-8000-000000000001');
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values('66000000-0000-4000-8000-000000000098','{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"}','61000000-0000-4000-8000-000000000001');
create function experimento_atestado.assinar_contato_fixture(e jsonb) returns jsonb language plpgsql as $$
declare entrada text := e::text; dados jsonb; texto text; mac text;
begin
 dados:=jsonb_build_object('key_id','v1','usuario_id','61000000-0000-4000-8000-000000000001','session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao','api.criar_contato_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '30 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=dados::text;
 mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('07',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',false);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',false);
do $$
declare e jsonb := '{"request_id":"64000000-0000-4000-8000-000000000070","auditoria_id":"65000000-0000-4000-8000-000000000070","paciente_id":"66000000-0000-4000-8000-000000000099","contato_id":"67000000-0000-4000-8000-000000000070","chave_idempotencia":"fixture-contato-um","digest_idempotencia":"digest-ficticio","tipo":"email","valor":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"tabela":"cadastro.contato_paciente","registro_id":"67000000-0000-4000-8000-000000000070","campo":"valor","formato":1}}'; r jsonb;
begin
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('02',32),'hex'));
 if r->>'ok' is distinct from 'false' or exists(select 1 from cadastro.contato_paciente) then raise exception 'prova incorreta permitiu contato'; end if;
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.contato_paciente where id='67000000-0000-4000-8000-000000000070' and paciente_id='66000000-0000-4000-8000-000000000099') then raise exception 'contato válido negado'; end if;
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.contato_paciente)<>1 then raise exception 'repetição exata inválida'; end if;
 e:=jsonb_set(jsonb_set(e,'{request_id}','"64000000-0000-4000-8000-000000000072"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000072"');
 e:=jsonb_set(jsonb_set(e,'{contato_id}','"67000000-0000-4000-8000-000000000072"'),'{aad,registro_id}','"67000000-0000-4000-8000-000000000072"');
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.contato_paciente)<>1 then raise exception 'replay idempotente incorreto'; end if;
 if not exists(select 1 from auditoria.evento where request_id='64000000-0000-4000-8000-000000000072' and acao='api.repetir_contato_paciente' and objeto_id='67000000-0000-4000-8000-000000000070' and resultado='permitido') then raise exception 'replay não auditou contato original'; end if;
 e:=jsonb_set(jsonb_set(e,'{request_id}','"64000000-0000-4000-8000-000000000079"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000070"');
 begin
   perform experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
   raise exception 'colisão de auditoria ignorada';
 exception when unique_violation then
   if sqlerrm <> 'AUDITORIA_CONFLITANTE' then raise; end if;
 end;
 e:=jsonb_set(jsonb_set(jsonb_set(e,'{paciente_id}','"66000000-0000-4000-8000-000000000098"'),'{request_id}','"64000000-0000-4000-8000-000000000078"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000078"');
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'contato original vinculado a outro paciente'; end if;
 e:=jsonb_set(e,'{paciente_id}','"66000000-0000-4000-8000-000000000099"');
 e:=jsonb_set(jsonb_set(e,'{request_id}','"64000000-0000-4000-8000-000000000074"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000074"');
 e:=jsonb_set(e,'{digest_idempotencia}','"outro-digest"');
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'conflito de payload não detectado'; end if;
 e:=jsonb_set(jsonb_set(e,'{request_id}','"64000000-0000-4000-8000-000000000075"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000075"');
 e:=jsonb_set(e,'{aad,registro_id}','"67000000-0000-4000-8000-000000000099"');
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r#>>'{erro,codigo}' is distinct from 'entrada_invalida' then raise exception 'AAD de outro contato aceito'; end if;
 if (select count(*) from auditoria.evento where acao='api.criar_contato_paciente' and resultado='permitido')<>1
   or (select count(*) from auditoria.evento where acao='api.repetir_contato_paciente' and resultado='permitido')<>2
   or (select count(*) from auditoria.evento where acao='api.criar_contato_paciente' and resultado='negado')<>3 then raise exception 'auditoria inicial incorreta'; end if;
end $$;
do $$
declare e jsonb := '{"request_id":"64000000-0000-4000-8000-000000000076","auditoria_id":"65000000-0000-4000-8000-000000000076","paciente_id":"66000000-0000-4000-8000-000000000099","contato_id":"67000000-0000-4000-8000-000000000076","chave_idempotencia":"fixture-contato-tres","digest_idempotencia":"digest-ficticio","tipo":"email","valor":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"tabela":"cadastro.contato_paciente","registro_id":"67000000-0000-4000-8000-000000000076","campo":"valor","formato":1}}'; r jsonb;
begin
 update public.usuario set perfil='profissional' where id='61000000-0000-4000-8000-000000000001';
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or exists(select 1 from cadastro.contato_paciente where id='67000000-0000-4000-8000-000000000076') then raise exception 'profissional criou contato'; end if;
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'repetição de negativa falhou'; end if;
 update public.usuario set perfil='administrador' where id='61000000-0000-4000-8000-000000000001';
 e:=jsonb_set(jsonb_set(jsonb_set(e,'{paciente_id}','"66000000-0000-4000-8000-000000000088"'),'{request_id}','"64000000-0000-4000-8000-000000000077"'),'{auditoria_id}','"65000000-0000-4000-8000-000000000077"');
 r:=experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
 if r#>>'{erro,codigo}' is distinct from 'nao_encontrado' then raise exception 'paciente inexistente aceito'; end if;
 if not exists(select 1 from auditoria.evento where request_id='64000000-0000-4000-8000-000000000076' and resultado='negado') or not exists(select 1 from auditoria.evento where request_id='64000000-0000-4000-8000-000000000077' and resultado='negado') then raise exception 'negativa sem auditoria'; end if;
end $$;
create function pg_temp.falhar_auditoria_contato() returns trigger language plpgsql as $$ begin raise exception 'falha-auditoria-fixture'; end $$;
create trigger falha_auditoria_contato before insert on auditoria.evento for each row execute function pg_temp.falhar_auditoria_contato();
do $$
declare e jsonb := '{"request_id":"64000000-0000-4000-8000-000000000073","auditoria_id":"65000000-0000-4000-8000-000000000073","paciente_id":"66000000-0000-4000-8000-000000000099","contato_id":"67000000-0000-4000-8000-000000000073","chave_idempotencia":"fixture-contato-dois","digest_idempotencia":"digest-ficticio","tipo":"telefone","valor":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"tabela":"cadastro.contato_paciente","registro_id":"67000000-0000-4000-8000-000000000073","campo":"valor","formato":1}}';
begin
 begin
   perform experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
   raise exception 'falha de auditoria ignorada';
 exception when raise_exception then if sqlerrm <> 'falha-auditoria-fixture' then raise; end if; end;
 if exists(select 1 from cadastro.contato_paciente where id='67000000-0000-4000-8000-000000000073')
   or exists(select 1 from operacao.requisicao where chave_idempotencia='fixture-contato-dois') then raise exception 'falha de auditoria deixou contato ou ledger'; end if;
 e:='{"request_id":"64000000-0000-4000-8000-000000000070","auditoria_id":"65000000-0000-4000-8000-000000000070","paciente_id":"66000000-0000-4000-8000-000000000099","contato_id":"67000000-0000-4000-8000-000000000070","chave_idempotencia":"fixture-contato-um","digest_idempotencia":"digest-ficticio","tipo":"email","valor":{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"},"aad":{"tabela":"cadastro.contato_paciente","registro_id":"67000000-0000-4000-8000-000000000070","campo":"valor","formato":1}}';
 begin
   perform experimento_atestado.criar_contato_com_prova_fixture(experimento_atestado.assinar_contato_fixture(e),1,decode(repeat('01',32),'hex'));
   raise exception 'leitura repetida sem auditoria foi retornada';
 exception when raise_exception then if sqlerrm <> 'falha-auditoria-fixture' then raise; end if; end;
end $$;
