-- Exclusivo do cluster descartável criado pelo runner; dados e chave fictícios.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_carteira_fixture' or inet_server_addr() is not null
  or coalesce(current_setting('ffcm_fixture.token_servidor',true),'') = ''
  or current_setting('ffcm_fixture.token_servidor',true) is distinct from current_setting('ffcm_fixture.token_esperado',true)
  or current_setting('unix_socket_directories') is distinct from current_setting('ffcm_fixture.socket_esperado',true)
  or current_setting('data_directory') is distinct from current_setting('ffcm_fixture.data_esperado',true) then raise exception 'cluster descartável obrigatório'; end if;
end $$;
set role postgres;
\ir ../drafts/20261104130000_verificador_atestado.sql
reset role;
do $$ begin
 if has_function_privilege('anon','identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)','execute')
  or has_function_privilege('authenticated','identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)','execute')
  or has_function_privilege('ffcm_carteira_executor_fixture','identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)','execute')
  or exists(select 1 from pg_roles where rolname='ffcmapp_atestado_verificador_owner' and (rolcanlogin or rolsuper or rolbypassrls)) then raise exception 'privilégios indevidos'; end if;
end $$;
update identidade.referencias_atestado_vault set ativa=true where referencia='ffcmapp.atestado.teste';
create role ffcmapp_atestado_teste nologin nosuperuser nobypassrls;
grant usage on schema identidade to ffcmapp_atestado_teste;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_atestado_teste;
do $$
declare entrada text:='{"limite":1}'; dados text; mac text; r boolean;
begin
 dados:=jsonb_build_object('key_id','teste','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'))::text;
 mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||dados,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 execute 'set local role ffcmapp_atestado_teste';
 r:=identidade.verificar_assinatura_atestado(entrada,dados,entrada::jsonb,dados::jsonb,mac);
 if r is distinct from true then raise exception 'assinatura válida rejeitada'; end if;
 r:=identidade.verificar_assinatura_atestado(entrada,dados,'{"limite":2}'::jsonb,dados::jsonb,mac);
 if r is distinct from false then raise exception 'entrada adulterada aceita'; end if;
 r:=identidade.verificar_assinatura_atestado(entrada,dados,entrada::jsonb,dados::jsonb,repeat('A',43));
 if r is distinct from false then raise exception 'assinatura adulterada aceita'; end if;
 r:=identidade.verificar_assinatura_atestado(entrada,dados,entrada::jsonb,jsonb_set(dados::jsonb,'{key_id}','"outra"'),mac);
 if r is distinct from false then raise exception 'metadados adulterados aceitos'; end if;
 r:=identidade.verificar_assinatura_atestado('{',dados,entrada::jsonb,dados::jsonb,mac);
 if r is distinct from false then raise exception 'json malformado aceito'; end if;
 execute 'reset role';
end $$;
update identidade.referencias_atestado_vault set ativa=false where referencia='ffcmapp.atestado.teste';
do $$
declare entrada text:='{"limite":1}'; dados text; mac text; r boolean;
begin
 dados:=jsonb_build_object('key_id','teste','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'))::text;
 mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||dados,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 execute 'set local role ffcmapp_atestado_teste';
 begin
  r:=identidade.verificar_assinatura_atestado(entrada,dados,entrada::jsonb,dados::jsonb,mac);
  raise exception 'falha de chave confundida com assinatura inválida';
 exception when sqlstate '55000' then
  if sqlerrm<>'CHAVE_INDISPONIVEL' then raise exception 'falha de chave não sanitizada'; end if;
 end;
 execute 'reset role';
end $$;
