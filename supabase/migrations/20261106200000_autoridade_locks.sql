-- O helper é privado e não concede autorização por si só.
grant usage on schema bloqueios_auth to ffcmapp_carteira_owner, ffcmapp_api_cadastro_owner, ffcmapp_auth_nativo_owner;
grant execute on function bloqueios_auth.travar(uuid, uuid) to ffcmapp_carteira_owner, ffcmapp_api_cadastro_owner, ffcmapp_auth_nativo_owner;
