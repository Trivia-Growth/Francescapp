\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_cadeia_local' or inet_server_addr() is not null then
  raise exception 'ALVO_LOCAL_DESCARTAVEL_OBRIGATORIO';
 end if;
end $$;
insert into vault.segredos_fixture values
 ('ffcmapp.cifra.ativa', encode(decode(repeat('11',32),'hex'),'base64')),
 ('ffcmapp.cifra.hmac', encode(decode(repeat('22',32),'hex'),'base64')),
 ('ffcmapp.atestado.teste', encode(decode(repeat('33',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
create role ffcm_cofre_runtime login noinherit;
grant ffcmapp_vault_executor, ffcmapp_atestado_vault_executor to ffcm_cofre_runtime;
grant usage on schema identidade to ffcm_cofre_runtime;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcm_cofre_runtime;
