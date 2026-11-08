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
  perform identidade.agenda_google_revogar_credencial();
  if exists(select 1 from identidade.agenda_google_state where hash=hash_b) then raise exception 'REVOGACAO_NAO_REMOVEU_STATE'; end if;
  if not identidade.agenda_google_registrar_state(hash_a,'novo') then raise exception 'REGISTRO_APOS_REVOGACAO_FALHOU'; end if;
  resultado := identidade.agenda_google_consumir_state(hash_a);
  if resultado->>'geracao' is distinct from '1' then raise exception 'GERACAO_NAO_AVANCOU'; end if;
end $$;

-- Helper não deve ler ou excluir segredo vinculado a outro usuário.
insert into vault.secrets values
 ('00000000-0000-4000-8000-000000000101','segredo-a'),
 ('00000000-0000-4000-8000-000000000102','segredo-b');
insert into identidade.agenda_google_credencial(usuario_id,subject_google,geracao,segredo_id) values
 ('00000000-0000-4000-8000-000000000001','a',1,'00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000002','b',1,'00000000-0000-4000-8000-000000000102');
set role ffcmapp_agenda_google_owner;
do $$ begin
 perform set_config('ffcmapp.agenda_usuario','00000000-0000-4000-8000-000000000001',true);
 if identidade.agenda_google_vault('00000000-0000-4000-8000-000000000101',false) is distinct from 'segredo-a' then raise exception 'LEITURA_PROPRIA_FALHOU'; end if;
 begin
  perform identidade.agenda_google_vault('00000000-0000-4000-8000-000000000102',false);
  raise exception 'LEITURA_ALHEIA_PERMITIDA';
 exception when insufficient_privilege then null; end;
 begin
  perform identidade.agenda_google_vault('00000000-0000-4000-8000-000000000102',true);
  raise exception 'EXCLUSAO_ALHEIA_PERMITIDA';
 exception when insufficient_privilege then null; end;
 perform identidade.agenda_google_vault('00000000-0000-4000-8000-000000000101',true);
end $$;
reset role;
do $$ begin
 if exists(select 1 from vault.secrets where id='00000000-0000-4000-8000-000000000101') or not exists(select 1 from vault.secrets where id='00000000-0000-4000-8000-000000000102') then raise exception 'EXCLUSAO_INCORRETA'; end if;
 if has_table_privilege('ffcmapp_agenda_google_owner','vault.secrets','DELETE') or has_table_privilege('ffcmapp_agenda_google_owner','vault.decrypted_secrets','SELECT') then raise exception 'ACESSO_VAULT_DIRETO'; end if;
end $$;
