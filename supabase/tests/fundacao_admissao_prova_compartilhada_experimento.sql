-- Somente banco descartável: identidade e canal são fixtures, não runtime.
\set ON_ERROR_STOP on
\ir fundacao_admissao_prova_experimento.sql
begin;
create table identidade.prova_saida_fixture (
 session_id uuid primary key references identidade.sessao(session_id),
 usuario_id uuid not null references public.usuario(id),
 geracao bigint not null check (geracao > 0),
 verificador bytea not null check (octet_length(verificador)=32)
);
create schema saida_fixture;
\ir ../drafts/20261102120000_saida_prova_experimento.sql
\ir ../drafts/20261104140000_admissao_prova_compartilhada_experimento.sql
insert into auth.users values ('41000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values ('41000000-0000-4000-8000-000000000002','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-2','administrador','google_workspace','vinculada','41000000-0000-4000-8000-000000000002','fixture-2','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values ('41000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000011","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000011","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; r jsonb;
begin
 r:=identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from identidade.prova_saida_fixture where session_id='43000000-0000-4000-8000-000000000011' and usuario_id='41000000-0000-4000-8000-000000000002' and geracao=1 and verificador=decode(repeat('ab',32),'hex')) then raise exception 'prova compartilhada não registrada'; end if;
 if identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'replay admitido'; end if;
 if saida_fixture.revogar('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000002',1,decode(repeat('ab',32),'hex'),'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb,'44000000-0000-4000-8000-000000000015') is not true then raise exception 'saída não reconheceu prova admitida'; end if;
 if identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'tombstone readmitido'; end if;
 begin
  perform identidade.admitir_tecnica_com_prova(e,decode('ab','hex'));
  raise exception 'prova curta aceita';
 exception when invalid_parameter_value then null; end;
 if not exists(select 1 from auth.users where id='41000000-0000-4000-8000-000000000099')
  or not exists(select 1 from public.usuario where id='41000000-0000-4000-8000-000000000099')
  or exists(select 1 from identidade.excecao_tecnica where usuario_id='41000000-0000-4000-8000-000000000099') then raise exception 'fixture da outra conta não corresponde ao cenário'; end if;
 e:=jsonb_set(jsonb_set(e,'{identidade,usuario_id}','"41000000-0000-4000-8000-000000000099"'),'{identidade,session_id}','"43000000-0000-4000-8000-000000000012"');
 if identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' or exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000012') then raise exception 'outra conta admitida'; end if;
 if has_function_privilege('anon','identidade.admitir_tecnica_com_prova(jsonb,bytea)','execute') or has_function_privilege('authenticated','identidade.admitir_tecnica_com_prova(jsonb,bytea)','execute') then raise exception 'execução pública'; end if;
end $$;
-- USAGE permite isolar a negativa de EXECUTE da negativa de schema.
grant usage on schema identidade to anon,authenticated;
set local role anon;
do $$ begin
 begin perform identidade.admitir_tecnica_com_prova('{}'::jsonb,decode(repeat('ab',32),'hex')); raise exception 'anon executou admissão';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform identidade.admitir_tecnica_com_prova('{}'::jsonb,decode(repeat('ab',32),'hex')); raise exception 'authenticated executou admissão';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
create function pg_temp.suprimir_geracao() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger suprimir_geracao before update on identidade.credencial_sessao for each row execute function pg_temp.suprimir_geracao();
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000014","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000014","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
begin
 begin
  perform identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'));
  raise exception 'atualização suprimida aceita';
 exception when sqlstate 'P0002' then if sqlerrm<>'GERACAO_NAO_INICIALIZADA' then raise; end if; end;
 if exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000014')
  or exists(select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000014')
  or exists(select 1 from identidade.prova_saida_fixture where session_id='43000000-0000-4000-8000-000000000014')
  or exists(select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000014') then raise exception 'geração suprimida deixou efeitos parciais'; end if;
end $$;
drop trigger suprimir_geracao on identidade.credencial_sessao;
create function pg_temp.suprimir_prova_compartilhada() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger suprimir_prova before insert on identidade.prova_saida_fixture for each row execute function pg_temp.suprimir_prova_compartilhada();
do $$
declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000013","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000013","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
begin
 begin
  perform identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'));
  raise exception 'admissão sem prova aceita';
 exception when sqlstate 'P0002' then if sqlerrm<>'PROVA_NAO_REGISTRADA' then raise; end if; end;
 if exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000013')
  or exists(select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000013')
  or exists(select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000013') then raise exception 'efeitos parciais após falha da prova'; end if;
end $$;
rollback;
