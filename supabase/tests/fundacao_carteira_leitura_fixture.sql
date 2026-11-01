-- Exclusivamente em PostgreSQL descartável sem rede; claims e chaves são fictícios.
\set ON_ERROR_STOP on
\set ffcm_fixture_concorrente true
\ir fundacao_cadastro_prova_renovacao_integracao.sql
\ir ../drafts/20261103120000_carteira_leitura_experimento.sql
\ir ../drafts/20261103130000_carteira_owner_fixture.sql

begin;
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id,criado_em)
values ('66000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','61000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z'),
       ('66000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','61000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z');
create function pg_temp.assinar_carteira(e jsonb) returns jsonb language plpgsql as $$
declare entrada text := e::text; dados jsonb; texto text; mac text;
begin
 dados := jsonb_build_object('key_id','v1','usuario_id',auth.uid(),
   'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id',
   'operacao','api.listar_pacientes','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '30 seconds',
   'digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto := dados::text;
 mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('07',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
do $$
declare resultado jsonb; transporte jsonb;
begin
 if has_function_privilege('anon','experimento_atestado.listar_carteira_fixture(jsonb,bigint,bytea)','execute')
   or has_function_privilege('authenticated','experimento_atestado.listar_carteira_fixture(jsonb,bigint,bytea)','execute') then
   raise exception 'função experimental exposta';
 end if;
 if exists(select 1 from pg_roles where rolname in ('ffcm_carteira_owner_fixture','ffcm_carteira_executor_fixture') and (rolcanlogin or rolbypassrls or rolsuper))
   or pg_has_role('ffcm_carteira_executor_fixture','ffcm_carteira_owner_fixture','member')
   or has_table_privilege('ffcm_carteira_executor_fixture','cadastro.paciente','select')
   or has_table_privilege('ffcm_carteira_executor_fixture','cadastro.acesso_paciente','select,update')
   or has_table_privilege('ffcm_carteira_executor_fixture','auditoria.evento','insert')
   or has_table_privilege('anon','cadastro.paciente','select')
   or has_table_privilege('authenticated','cadastro.paciente','select') then
   raise exception 'privilégio direto indevido';
 end if;
 transporte := pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000001","limite":20}'::jsonb);
 resultado := experimento_atestado.listar_carteira_fixture(transporte,1,decode(repeat('01',32),'hex'));
 if resultado->>'ok' is distinct from 'true' or jsonb_array_length(resultado #> '{dados,itens}') <> 2 then
   raise exception 'administrador não recebeu carteira básica';
 end if;
 if (resultado #> '{dados,itens,0}') ?| array['contatos','data_nascimento'] then
   raise exception 'resposta básica contém campos administrativos';
 end if;
 if not exists(select 1 from auditoria.evento ev where ev.request_id='64000000-0000-4000-8000-000000000001' and ev.resultado='permitido') then
   raise exception 'consulta não foi auditada';
 end if;
 execute 'set local role ffcm_carteira_executor_fixture';
 resultado := experimento_atestado.listar_carteira_fixture(transporte,1,decode(repeat('01',32),'hex'));
 execute 'reset role';
 if resultado->>'ok' is distinct from 'true' or jsonb_array_length(resultado #> '{dados,itens}') <> 2 then
   raise exception 'executor restrito não recebeu carteira autorizada';
 end if;
end $$;
do $$
declare primeira jsonb; segunda jsonb; cursor text;
begin
 primeira := experimento_atestado.listar_carteira_fixture(pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000002","limite":1}'::jsonb),1,decode(repeat('01',32),'hex'));
 cursor := primeira #>> '{dados,proximo_cursor}';
 segunda := experimento_atestado.listar_carteira_fixture(pg_temp.assinar_carteira(jsonb_build_object('request_id','64000000-0000-4000-8000-000000000003','limite',1,'cursor',cursor)),1,decode(repeat('01',32),'hex'));
 if primeira #>> '{dados,itens,0,paciente_id}' <> '66000000-0000-4000-8000-000000000001'
    or segunda #>> '{dados,itens,0,paciente_id}' <> '66000000-0000-4000-8000-000000000002'
    or segunda #>> '{dados,proximo_cursor}' is not null then raise exception 'paginação incorreta'; end if;
end $$;
insert into auth.users(id) values('61000000-0000-4000-8000-000000000002');
insert into public.usuario(id,perfil) values('61000000-0000-4000-8000-000000000002','profissional');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values('62000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-profissional','profissional','google_workspace','vinculada','61000000-0000-4000-8000-000000000002','fixture-profissional','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
values('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000002',1,'google_workspace');
insert into identidade.credencial_sessao(session_id,estado,geracao,envelope)
values('63000000-0000-4000-8000-000000000002','disponivel',1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into identidade.prova_saida_fixture values('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002',1,decode(repeat('02',32),'hex'));
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
values('67000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare papel text; coluna text; acao text; helper text;
begin
 foreach papel in array array['anon','authenticated','ffcm_carteira_executor_fixture'] loop
  for coluna in select attname from pg_attribute where attrelid='cadastro.paciente'::regclass and attnum>0 and not attisdropped loop
   foreach acao in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
    if has_column_privilege(papel,'cadastro.paciente',coluna,acao) then
     raise exception 'privilégio % na coluna de paciente % indevido para %',acao,coluna,papel;
    end if;
   end loop;
  end loop;
  foreach acao in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
   if has_table_privilege(papel,'cadastro.acesso_paciente',acao) then
    raise exception 'privilégio % de vínculo indevido para %',acao,papel;
   end if;
  end loop;
  for coluna in select attname from pg_attribute where attrelid='cadastro.acesso_paciente'::regclass and attnum>0 and not attisdropped loop
   foreach acao in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
    if has_column_privilege(papel,'cadastro.acesso_paciente',coluna,acao) then
     raise exception 'privilégio % na coluna % indevido para %',acao,coluna,papel;
    end if;
   end loop;
  end loop;
  if has_table_privilege(papel,'auditoria.evento','INSERT') then raise exception 'inserção direta de auditoria permitida para %',papel; end if;
  for coluna in select attname from pg_attribute where attrelid='auditoria.evento'::regclass and attnum>0 and not attisdropped loop
   if has_column_privilege(papel,'auditoria.evento',coluna,'INSERT') then raise exception 'inserção direta em auditoria permitida para %',papel; end if;
  end loop;
  foreach helper in array array['saida_fixture.autorizar_prova(bigint,bytea)','experimento_atestado.validar_carteira_fixture(jsonb)','experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text)'] loop
   if has_function_privilege(papel,helper,'EXECUTE') then raise exception 'helper acessível diretamente por %',papel; end if;
  end loop;
  begin
   execute format('set local role %I',papel);
   perform id from cadastro.paciente limit 1;
   raise exception 'acesso direto permitido para %',papel;
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
 end loop;
 begin
  execute 'set local role ffcm_carteira_owner_fixture';
  update cadastro.acesso_paciente set id=id where id='67000000-0000-4000-8000-000000000001';
  raise exception 'policy permitiu escrita no vínculo';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
end $$;
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000002',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000002',true);
do $$
declare r jsonb; t jsonb;
begin
 t:=pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000004","limite":20}'::jsonb);
 execute 'set local role ffcm_carteira_executor_fixture';
 r:=experimento_atestado.listar_carteira_fixture(t,1,decode(repeat('02',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r #> '{dados,itens}')<>1
   or r #>> '{dados,itens,0,paciente_id}' <> '66000000-0000-4000-8000-000000000001' then raise exception 'carteira profissional incorreta'; end if;
 execute 'set local role ffcm_carteira_executor_fixture';
 r:=experimento_atestado.listar_carteira_fixture(t,1,decode(repeat('03',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'false' or not exists(select 1 from auditoria.evento ev where ev.request_id='64000000-0000-4000-8000-000000000004' and ev.resultado='negado') then raise exception 'prova errada aceita ou sem auditoria'; end if;
 -- Família é fixture de perfil, não implantação de jornada familiar.
 update public.usuario set perfil='familia' where id='61000000-0000-4000-8000-000000000002';
 execute 'set local role ffcm_carteira_executor_fixture';
 r:=experimento_atestado.listar_carteira_fixture(t,1,decode(repeat('02',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r #> '{dados,itens}')<>1
   or r #>> '{dados,itens,0,paciente_id}' <> '66000000-0000-4000-8000-000000000001' then raise exception 'carteira familiar incorreta'; end if;
 t:=pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000006","limite":20,"cursor":"66000000-0000-4000-8000-000000000002"}'::jsonb);
 execute 'set local role ffcm_carteira_executor_fixture';
 r:=experimento_atestado.listar_carteira_fixture(t,1,decode(repeat('02',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'false' or r #>> '{erro,codigo}' <> 'entrada_invalida'
   or not exists(select 1 from auditoria.evento ev where ev.request_id='64000000-0000-4000-8000-000000000006' and ev.resultado='negado') then
   raise exception 'cursor não autorizado aceito ou sem auditoria';
 end if;
 t:=pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000004","limite":20}'::jsonb);
 -- Estado corrompido apenas nesta transação: o gatilho normal impede usuário
 -- inativo com sessão ativa. A prova positiva anterior usa esta mesma sessão.
 execute 'alter table public.usuario disable trigger usuario_exige_sessoes_revogadas';
 update public.usuario set ativo=false where id='61000000-0000-4000-8000-000000000002';
 execute 'alter table public.usuario enable trigger usuario_exige_sessoes_revogadas';
 if not exists(select 1 from identidade.sessao where session_id='63000000-0000-4000-8000-000000000002' and revogada_em is null) then
   raise exception 'controle de sessão ativa ausente';
 end if;
 t:=pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000007","limite":20}'::jsonb);
 execute 'set local role ffcm_carteira_executor_fixture';
 r:=experimento_atestado.listar_carteira_fixture(t,1,decode(repeat('02',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'false' or not exists(
   select 1 from auditoria.evento ev
   where ev.request_id='64000000-0000-4000-8000-000000000007' and ev.resultado='negado'
 ) then raise exception 'usuário inativo autorizado ou negativa sem auditoria'; end if;
 t:=pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000004","limite":20}'::jsonb);
 update public.usuario set ativo=true where id='61000000-0000-4000-8000-000000000002';
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where id='67000000-0000-4000-8000-000000000001';
 execute 'set local role ffcm_carteira_executor_fixture';
 r:=experimento_atestado.listar_carteira_fixture(t,1,decode(repeat('02',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r #> '{dados,itens}')<>0 then raise exception 'vínculo revogado ainda acessa paciente'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where session_id='63000000-0000-4000-8000-000000000002';
 execute 'set local role ffcm_carteira_executor_fixture';
 r:=experimento_atestado.listar_carteira_fixture(t,1,decode(repeat('02',32),'hex'));
 execute 'reset role';
 if r->>'ok' is distinct from 'false' then raise exception 'sessão revogada autorizada'; end if;
end $$;
create function pg_temp.falhar_auditoria() returns trigger language plpgsql as $$ begin raise exception 'auditoria-ficticia-indisponivel'; end $$;
create trigger falhar_auditoria before insert on auditoria.evento for each row execute function pg_temp.falhar_auditoria();
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',true);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',true);
do $$
declare transporte jsonb;
begin
 transporte:=pg_temp.assinar_carteira('{"request_id":"64000000-0000-4000-8000-000000000005","limite":20}'::jsonb);
 begin
   execute 'set local role ffcm_carteira_executor_fixture';
   perform experimento_atestado.listar_carteira_fixture(transporte,1,decode(repeat('01',32),'hex'));
   raise exception 'auditoria falha liberou leitura';
 exception when raise_exception then if sqlerrm <> 'auditoria-ficticia-indisponivel' then raise; end if; end;
end $$;
rollback;
