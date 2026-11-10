\set ON_ERROR_STOP on
\ir agenda_google_privilegios_local.sql
-- Exercita helpers sob contexto artificial: não substitui atestado ou autorização do wrapper.
do $$
declare
  hash_a text := repeat('a',64);
  hash_b text := repeat('b',64);
  resultado jsonb;
begin
  perform set_config('ffcmapp.agenda_usuario','00000000-0000-4000-8000-000000000001',true);
  perform set_config('ffcmapp.agenda_sessao','00000000-0000-4000-8000-000000000011',true);
  if not identidade.agenda_google_registrar_state(hash_a,'selado-ficticio') then raise exception 'REGISTRO_FALHOU'; end if;
  perform set_config('ffcmapp.agenda_usuario','00000000-0000-4000-8000-000000000002',true);
  if identidade.agenda_google_consumir_state(hash_a) is not null then raise exception 'OUTRO_USUARIO_CONSUMIU'; end if;
  perform set_config('ffcmapp.agenda_usuario','00000000-0000-4000-8000-000000000001',true);
  perform set_config('ffcmapp.agenda_sessao','00000000-0000-4000-8000-000000000012',true);
  if identidade.agenda_google_consumir_state(hash_a) is not null then raise exception 'OUTRA_SESSAO_CONSUMIU'; end if;
  perform set_config('ffcmapp.agenda_sessao','00000000-0000-4000-8000-000000000011',true);
  resultado := identidade.agenda_google_consumir_state(hash_a);
  if resultado is distinct from '{"selado":"selado-ficticio","geracao":"0"}'::jsonb then raise exception 'CONSUMO_INVALIDO'; end if;
  if identidade.agenda_google_consumir_state(hash_a) is not null then raise exception 'REPLAY_ACEITO'; end if;
  if not identidade.agenda_google_registrar_state(hash_b,'selado-ficticio') then raise exception 'SEGUNDO_REGISTRO_FALHOU'; end if;
  update identidade.agenda_google_state set expira_em=clock_timestamp()-interval '1 second' where hash=hash_b;
  if identidade.agenda_google_consumir_state(hash_b) is not null then raise exception 'STATE_EXPIRADO_ACEITO'; end if;
end $$;

-- Owner Agenda não pode forjar vínculo nem acessar Vault com GUC ou envelope sem assinatura.
insert into vault.secrets values ('00000000-0000-4000-8000-000000000102','segredo-b');
insert into identidade.agenda_google_vault_vinculo values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000102','b',1);
set role ffcmapp_agenda_google_owner;
do $$ begin
 perform set_config('ffcmapp.agenda_usuario','00000000-0000-4000-8000-000000000002',true);
 begin
  perform identidade.agenda_google_vault('{}'::jsonb,'ler',null);
  raise exception 'CONTEXTO_FORJADO_LEITURA_PERMITIDA';
 exception when insufficient_privilege then null; end;
 begin
  perform identidade.agenda_google_vault('{}'::jsonb,'excluir',null);
  raise exception 'CONTEXTO_FORJADO_EXCLUSAO_PERMITIDA';
 exception when insufficient_privilege then null; end;
 begin
  insert into identidade.agenda_google_vault_vinculo values (gen_random_uuid(),gen_random_uuid(),'a',1);
  raise exception 'VINCULO_FORJADO_PERMITIDO';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from vault.secrets where id='00000000-0000-4000-8000-000000000102') then raise exception 'SEGREDO_ALHEIO_REMOVIDO'; end if;
 if has_table_privilege('ffcmapp_agenda_google_owner','vault.secrets','DELETE') or has_table_privilege('ffcmapp_agenda_google_owner','vault.decrypted_secrets','SELECT') then raise exception 'ACESSO_VAULT_DIRETO'; end if;
end $$;

insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001');
insert into public.usuario(id,perfil) select id,'administrador' from auth.users;
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}', 'fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;
insert into vault.secrets values ('00000000-0000-4000-8000-000000000101','segredo-a');
insert into identidade.agenda_google_vault_vinculo values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','google-10000000-0000-4000-8000-000000000001',2);
create function pg_temp.assinar_agenda(operacao text, geracao text, valor text default null, subject text default 'google-10000000-0000-4000-8000-000000000001', operacao_id uuid default '40000000-0000-4000-8000-000000000001') returns jsonb language plpgsql as $$
declare req uuid:=gen_random_uuid(); e jsonb; dados jsonb; entrada text; texto text; mac text;
begin
 e:=jsonb_build_object('request_id',req,'subject',subject,'geracao',geracao);
 if operacao in ('agenda.desconectar','agenda.cancelar_desconexao') then e:=e||jsonb_build_object('operacao_id',operacao_id); end if;
 if valor is not null then e:=e||jsonb_build_object('valor_hash',encode(extensions.digest(convert_to(valor,'UTF8'),'sha256'),'hex')); end if;
 entrada:=e::text;
 dados:=jsonb_build_object('key_id','teste','usuario_id','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001','request_id',req,'operacao',operacao,
  'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds',
  'digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=dados::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
do $$
declare leitura jsonb:=pg_temp.assinar_agenda('agenda.ler','2'); antigo jsonb:=pg_temp.assinar_agenda('agenda.desconectar','1');
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001')::text,true);
 execute 'set local role ffcmapp_agenda_google_owner';
 begin perform identidade.agenda_google_vault(leitura,'excluir',null); raise exception 'LEITURA_AUTORIZOU_EXCLUSAO'; exception when insufficient_privilege then null; end;
 begin perform identidade.agenda_google_vault(antigo,'excluir',null); raise exception 'DESCONEXAO_ANTIGA_ACEITA'; exception when insufficient_privilege then null; end;
 perform set_config('ffcmapp.agenda_usuario','00000000-0000-4000-8000-000000000002',true);
 if identidade.agenda_google_vault(leitura,'ler',null) is distinct from 'segredo-a' then raise exception 'LEITURA_PROPRIA_FALHOU'; end if;
 begin perform identidade.agenda_google_vault(leitura,'ler',null); raise exception 'REPLAY_ACEITO'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 if not exists(select 1 from vault.secrets where id='00000000-0000-4000-8000-000000000101') then raise exception 'SEGREDO_REMOVIDO'; end if;
end $$;

do $$
declare salvar_antigo jsonb:=pg_temp.assinar_agenda('agenda.salvar','2','novo');
 revogar jsonb:=pg_temp.assinar_agenda('agenda.revogar','2');
 revogar_outro jsonb:=pg_temp.assinar_agenda('agenda.revogar','2',null,'outro');
 revogar_antigo jsonb:=pg_temp.assinar_agenda('agenda.revogar','2');
 salvar_atual jsonb:=pg_temp.assinar_agenda('agenda.salvar','3','novo');
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001')::text,true);
 execute 'set local role ffcmapp_agenda_google_owner';
 begin perform identidade.agenda_google_vault(revogar_outro,'excluir',null); raise exception 'SUBJECT_ALHEIO_ACEITO'; exception when insufficient_privilege then null; end;
 perform identidade.agenda_google_vault(revogar,'excluir',null);
 begin perform identidade.agenda_google_vault(salvar_antigo,'salvar','novo'); raise exception 'SALVAMENTO_ANTIGO_ACEITO'; exception when insufficient_privilege then null; end;
 perform identidade.agenda_google_vault(salvar_atual,'salvar','novo');
 begin perform identidade.agenda_google_vault(revogar_antigo,'excluir',null); raise exception 'REVOGACAO_ANTIGA_ACEITA'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 if not exists(select 1 from identidade.agenda_google_vault_vinculo where usuario_id='10000000-0000-4000-8000-000000000001' and geracao=4 and segredo_id is not null) then raise exception 'GERACAO_NAO_PRESERVADA'; end if;
end $$;

-- Atestado atual não permite ler refresh da conta anterior nem executar desconexão cancelada.
do $$
declare leitura jsonb:=pg_temp.assinar_agenda('agenda.ler','4');
 cancelamento jsonb:=pg_temp.assinar_agenda('agenda.cancelar_desconexao','4');
 desconexao jsonb:=pg_temp.assinar_agenda('agenda.desconectar','4');
begin
 update identidade.agenda_google_vault_vinculo set subject_google='conta-anterior' where usuario_id='10000000-0000-4000-8000-000000000001';
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id','20000000-0000-4000-8000-000000000001')::text,true);
 execute 'set local role ffcmapp_agenda_google_owner';
 begin perform identidade.agenda_google_vault(leitura,'ler',null); raise exception 'REFRESH_CONTA_ANTERIOR_EXPOSTO'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 update identidade.agenda_google_vault_vinculo set subject_google='google-10000000-0000-4000-8000-000000000001' where usuario_id='10000000-0000-4000-8000-000000000001';
 execute 'set local role ffcmapp_agenda_google_owner';
 perform identidade.agenda_google_vault(cancelamento,'cancelar',null);
 begin perform identidade.agenda_google_vault(desconexao,'excluir',null); raise exception 'DESCONEXAO_CANCELADA_ACEITA'; exception when insufficient_privilege then null; end;
 execute 'reset role';
 if not exists(select 1 from identidade.agenda_google_vault_vinculo where usuario_id='10000000-0000-4000-8000-000000000001' and segredo_id is not null and geracao=4) then raise exception 'SEGREDO_CANCELADO_REMOVIDO'; end if;
end $$;
