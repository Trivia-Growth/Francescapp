-- Exclusivamente cluster local descartável. Gateway e JWT são simulados.
\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null
  or current_setting('listen_addresses')<>'' or s !~ '^/tmp/ffcm-admissao\.[a-zA-Z0-9]+$'
  or current_setting('data_directory')<>s||'/data'
  or s is distinct from current_setting('ffcm_fixture.socket_esperado',true)
  or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado',true)
  or coalesce(current_setting('ffcm_fixture.token_servidor',true),'')=''
  or current_setting('ffcm_fixture.token_servidor',true) is distinct from current_setting('ffcm_fixture.token_esperado',true)
 then raise exception 'cluster local descartável obrigatório'; end if;
end $$;
\ir fundacao_admissao_prova_experimento.sql
begin;
\ir ../drafts/recibo_identidade_gateway_experimento.sql
create table identidade.prova_saida_fixture(session_id uuid primary key references identidade.sessao(session_id),usuario_id uuid not null references public.usuario(id),geracao bigint not null,verificador bytea not null);
\ir ../drafts/20261104140000_admissao_prova_compartilhada_experimento.sql
\ir ../drafts/20261104160000_admissao_geracao_inicial_experimento.sql
\ir ../drafts/20261104150000_admissao_owner_experimento.sql
grant usage on schema recibo_fixture to ffcm_admissao_owner_fixture;
grant execute on function recibo_fixture.consumir_vinculado(text,uuid,uuid,text,text,bytea) to ffcm_admissao_owner_fixture;
revoke execute on function identidade.admitir_tecnica_com_prova(jsonb,bytea) from ffcm_admissao_executor_fixture;
-- A codificação é apenas da fixture: inclui entrada e verificador sem ambiguidade.
create function identidade.admitir_recibo_fixture(p_id text,p_entrada jsonb,p_verificador bytea) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not recibo_fixture.consumir_vinculado(p_id,(p_entrada#>>'{identidade,usuario_id}')::uuid,
  (p_entrada#>>'{identidade,session_id}')::uuid,'admissao_tecnica','equipe',
  convert_to(p_entrada::text,'UTF8')||p_verificador) then raise exception 'recibo inválido'; end if;
 return identidade.admitir_tecnica_com_prova(p_entrada,p_verificador);
end $$;
alter function identidade.admitir_recibo_fixture(text,jsonb,bytea) owner to ffcm_admissao_owner_fixture;
revoke all on function identidade.admitir_recibo_fixture(text,jsonb,bytea) from public,anon,authenticated;
grant execute on function identidade.admitir_recibo_fixture(text,jsonb,bytea) to ffcm_admissao_executor_fixture;
insert into auth.users values('41000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values('41000000-0000-4000-8000-000000000002','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-2','administrador','google_workspace','vinculada','41000000-0000-4000-8000-000000000002','fixture-2','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values('41000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
set local request.jwt.claims='{"sub":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000031"}';
set local role recibo_gateway_fixture;
select recibo_fixture.emitir_vinculado('entrada','admissao_tecnica','equipe',convert_to('{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000031","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000031","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'::jsonb::text,'UTF8')||decode(repeat('ab',32),'hex'));
select recibo_fixture.emitir_vinculado('audiencia','admissao_tecnica','familia',convert_to('{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000031","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000031","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'::jsonb::text,'UTF8')||decode(repeat('ab',32),'hex'));
reset role;
create function pg_temp.falhar_auditoria_recibo() returns trigger language plpgsql as $$ begin
 if current_setting('ffcm.fixture.falhar_auditoria',true)='on' then raise exception 'falha auditoria fixture'; end if;
 return new;
end $$;
create trigger falhar_auditoria_recibo before insert on auditoria.evento for each row execute function pg_temp.falhar_auditoria_recibo();
set local role ffcm_admissao_executor_fixture;
do $$ declare e jsonb:='{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000002","session_id":"43000000-0000-4000-8000-000000000031","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000031","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; begin
 begin perform identidade.admitir_tecnica_com_prova(e,decode(repeat('ab',32),'hex')); raise exception 'atalho permitido'; exception when insufficient_privilege then null; end;
 begin perform recibo_fixture.emitir_vinculado('forjado','admissao_tecnica','equipe',convert_to(e::text,'UTF8')||decode(repeat('ab',32),'hex')); raise exception 'executor emitiu recibo'; exception when insufficient_privilege then null; end;
 begin perform recibo_fixture.consumir_vinculado('entrada',(e#>>'{identidade,usuario_id}')::uuid,(e#>>'{identidade,session_id}')::uuid,'admissao_tecnica','equipe',convert_to(e::text,'UTF8')||decode(repeat('ab',32),'hex')); raise exception 'executor consumiu recibo diretamente'; exception when insufficient_privilege then null; end;
 begin perform identidade.admitir_recibo_fixture('audiencia',e,decode(repeat('ab',32),'hex')); raise exception 'audiência divergente aceita'; exception when raise_exception then if sqlerrm<>'recibo inválido' then raise; end if; end;
 begin perform identidade.admitir_recibo_fixture('entrada',jsonb_set(e,'{identidade,usuario_id}','"41000000-0000-4000-8000-000000000099"'),decode(repeat('ab',32),'hex')); raise exception 'outro ator aceito'; exception when raise_exception then if sqlerrm<>'recibo inválido' then raise; end if; end;
 begin perform identidade.admitir_recibo_fixture('entrada',jsonb_set(e,'{identidade,session_id}','"43000000-0000-4000-8000-000000000032"'),decode(repeat('ab',32),'hex')); raise exception 'outra sessão aceita'; exception when raise_exception then if sqlerrm<>'recibo inválido' then raise; end if; end;
 begin perform identidade.admitir_recibo_fixture('entrada',e,decode(repeat('ac',32),'hex')); raise exception 'verificador divergente aceito'; exception when raise_exception then if sqlerrm<>'recibo inválido' then raise; end if; end;
 begin perform identidade.admitir_recibo_fixture('entrada',jsonb_set(e,'{request_id}','"44000000-0000-4000-8000-000000000032"'),decode(repeat('ab',32),'hex')); raise exception 'entrada divergente aceita'; exception when raise_exception then if sqlerrm<>'recibo inválido' then raise; end if; end;
 perform set_config('ffcm.fixture.falhar_auditoria','on',true);
 begin perform identidade.admitir_recibo_fixture('entrada',e,decode(repeat('ab',32),'hex')); raise exception 'falha da admissão aceita'; exception when raise_exception then if sqlerrm<>'falha auditoria fixture' then raise; end if; end;
 perform set_config('ffcm.fixture.falhar_auditoria','off',true);
 begin
  if identidade.admitir_recibo_fixture('entrada',e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'true' then raise exception 'admissão negada'; end if;
  raise exception 'rollback teste';
 exception when raise_exception then if sqlerrm<>'rollback teste' then raise; end if; end;
 if identidade.admitir_recibo_fixture('entrada',e,decode(repeat('ab',32),'hex'))->>'ok' is distinct from 'true' then raise exception 'rollback consumiu recibo'; end if;
 begin perform identidade.admitir_recibo_fixture('entrada',e,decode(repeat('ab',32),'hex')); raise exception 'replay aceito'; exception when raise_exception then if sqlerrm<>'recibo inválido' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from identidade.sessao where session_id='43000000-0000-4000-8000-000000000031')<>1
 or (select count(*) from identidade.prova_saida_fixture where session_id='43000000-0000-4000-8000-000000000031')<>1
 or (select count(*) from auditoria.evento where request_id='44000000-0000-4000-8000-000000000031')<>1 then raise exception 'efeitos incompletos ou duplicados'; end if;
end $$;
rollback;
