\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql

do $$
declare f regprocedure; d text;
begin
 foreach f in array array['identidade.listar_carteira_privada(jsonb)'::regprocedure,
  'operacao.criar_paciente_privado(jsonb)'::regprocedure,
  'operacao.cadastro_composicao_privada(jsonb)'::regprocedure] loop
  d:=pg_get_functiondef(f);
  if strpos(d,'bloqueios_auth.travar(ator,sessao)')=0
   or strpos(d,'bloqueios_auth.travar(ator,sessao)')>strpos(d,'select dominio_workspace into dominio') then
   raise exception 'BLOQUEIO_AUSENTE_OU_TARDIO: %', f;
  end if;
 end loop;
 if has_function_privilege('authenticated','bloqueios_auth.travar(uuid,uuid)','execute')
  or has_function_privilege('service_role','bloqueios_auth.travar(uuid,uuid)','execute') then
  raise exception 'GRANT_INDEVIDO';
 end if;
 if not has_function_privilege('ffcmapp_carteira_owner','bloqueios_auth.travar(uuid,uuid)','execute')
  or not has_function_privilege('ffcmapp_api_cadastro_owner','bloqueios_auth.travar(uuid,uuid)','execute')
  or not has_function_privilege('ffcmapp_auth_nativo_owner','bloqueios_auth.travar(uuid,uuid)','execute') then
  raise exception 'GRANT_PRIVADO_AUSENTE';
 end if;
end $$;
