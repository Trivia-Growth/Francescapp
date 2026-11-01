-- Somente fixture descartável; todo o experimento abaixo é revertido.
\set ON_ERROR_STOP on
\ir fundacao_admissao_prova_compartilhada_experimento.sql
begin;
create table identidade.prova_saida_fixture(session_id uuid primary key references identidade.sessao(session_id),usuario_id uuid not null references public.usuario(id),geracao bigint not null,verificador bytea not null);
\ir ../drafts/20261104140000_admissao_prova_compartilhada_experimento.sql
\ir ../drafts/20261104160000_admissao_geracao_inicial_experimento.sql
\ir ../drafts/20261104150000_admissao_owner_experimento.sql
insert into auth.users values('41000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values('41000000-0000-4000-8000-000000000002','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-2','administrador','google_workspace','vinculada','41000000-0000-4000-8000-000000000002','fixture-2','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values('41000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$ begin
 if exists(select 1 from pg_roles where rolname in ('ffcm_admissao_owner_fixture','ffcm_admissao_executor_fixture') and (rolsuper or rolbypassrls or rolcanlogin))
  or pg_has_role('ffcm_admissao_executor_fixture','ffcm_admissao_owner_fixture','member')
  or has_function_privilege('anon','identidade.admitir_tecnica_com_prova(jsonb,bytea)','execute')
  or has_function_privilege('authenticated','identidade.admitir_tecnica_com_prova(jsonb,bytea)','execute')
  or has_function_privilege('ffcm_admissao_executor_fixture','identidade.admitir_sessao_tecnica(jsonb)','execute') then raise exception 'privilégio indevido'; end if;
end $$;
set local role ffcm_admissao_executor_fixture;
do $$ declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000021","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000021","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; begin
 if identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'true' then raise exception 'admissão restrita falhou'; end if;
 e:=jsonb_set(jsonb_set(e,'{identidade,usuario_id}','"41000000-0000-4000-8000-000000000099"'),'{identidade,session_id}','"43000000-0000-4000-8000-000000000022"');
 if identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'false' then raise exception 'outra conta admitida'; end if;
 begin perform * from identidade.prova_saida_fixture; raise exception 'executor leu prova diretamente'; exception when insufficient_privilege then null; end;
 begin perform session_id from identidade.sessao; raise exception 'executor leu sessões'; exception when insufficient_privilege then null; end;
 begin perform envelope from identidade.credencial_sessao; raise exception 'executor leu credenciais'; exception when insufficient_privilege then null; end;
 begin perform usuario_id from identidade.excecao_tecnica; raise exception 'executor leu exceções'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role ffcm_admissao_owner_fixture;
do $$ begin
 begin update public.usuario set perfil='profissional' where id='41000000-0000-4000-8000-000000000002'; raise exception 'owner alterou perfil'; exception when insufficient_privilege then null; end;
 begin update identidade.concessao_equipe set estado='revogada' where id='42000000-0000-4000-8000-000000000002'; raise exception 'owner alterou concessão'; exception when insufficient_privilege then null; end;
 begin update public.usuario set id=id where id='41000000-0000-4000-8000-000000000002'; raise exception 'owner alterou coluna de lock'; exception when insufficient_privilege then null; end;
 begin update identidade.concessao_equipe set id=id where id='42000000-0000-4000-8000-000000000002'; raise exception 'owner alterou lock da concessão'; exception when insufficient_privilege then null; end;
 begin update identidade.excecao_tecnica set usuario_id=usuario_id where usuario_id='41000000-0000-4000-8000-000000000002'; raise exception 'owner alterou lock da exceção'; exception when insufficient_privilege then null; end;
 begin perform email_cifrado from identidade.concessao_equipe; raise exception 'owner leu dado desnecessário'; exception when insufficient_privilege then null; end;
 -- A verificação de integridade reintroduz SELECT do envelope: registrar o
 -- limite, sem interpretá-lo como isolamento entre sessões.
 if not exists(select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000001' and envelope is not null) then raise exception 'limite de leitura do owner não reproduzido'; end if;
end $$;
-- O owner não deve atualizar credenciais de outra sessão.
do $$ begin
 begin
  update identidade.credencial_sessao set geracao=1 where session_id='43000000-0000-4000-8000-000000000001';
  raise exception 'owner alterou geração alheia';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
create function pg_temp.adulterar_credencial() returns trigger language plpgsql as $$ begin
 new.envelope:=jsonb_set(new.envelope,'{ciphertext}','"adulterado"'); return new;
end $$;
create trigger adulterar_credencial before insert on identidade.credencial_sessao for each row execute function pg_temp.adulterar_credencial();
set local role ffcm_admissao_executor_fixture;
do $$ declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000023","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000023","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; begin
 begin
  perform identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex'));
  raise exception 'adulteração aceita';
 exception when sqlstate 'P0002' then if sqlerrm<>'ADMISSAO_INCOMPLETA' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000023')
  or exists(select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000023')
  or exists(select 1 from identidade.prova_saida_fixture where session_id='43000000-0000-4000-8000-000000000023')
  or exists(select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000023') then raise exception 'adulteração deixou efeitos parciais'; end if;
end $$;
drop trigger adulterar_credencial on identidade.credencial_sessao;
grant usage on schema identidade to anon,authenticated;
set local role anon;
do $$ begin
 begin perform identidade.admitir_tecnica_com_prova('{}'::jsonb,decode(repeat('ab',32),'hex')); raise exception 'anon executou admissão'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform identidade.admitir_tecnica_com_prova('{}'::jsonb,decode(repeat('ab',32),'hex')); raise exception 'authenticated executou admissão'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from identidade.prova_saida_fixture where session_id='43000000-0000-4000-8000-000000000021' and geracao=1) then raise exception 'prova ausente'; end if;
end $$;
rollback;
