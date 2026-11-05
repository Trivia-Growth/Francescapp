-- RASCUNHO BLOQUEADO: não aplicar nem conceder acesso. O cliente pode receber
-- uma chave e desfazer a auditoria com ROLLBACK; COMMIT também pode falhar após
-- a entrega. Eventos de cifra e HMAC são indistintos. Revogar ou expirar o
-- acesso não elimina cópias de chaves já entregues. Exige desenho de auditoria
-- independente da transação controlada pelo cliente e decisão sobre cópias.
-- A concessão de EXECUTE pelos owners e o projeto de teste não foram provados.
create role ffcmapp_servico_cofre_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create table identidade.cofre_servico_teste_configuracao (
  unico boolean primary key default true check (unico),
  projeto_ref text not null,
  referencia_cifra text not null check (referencia_cifra ~ '^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$')
);
alter table identidade.cofre_servico_teste_configuracao enable row level security;
revoke all on identidade.cofre_servico_teste_configuracao from public, anon, authenticated, service_role;
grant usage on schema identidade, auditoria to ffcmapp_servico_cofre_owner;
grant select on identidade.cofre_servico_teste_configuracao to ffcmapp_servico_cofre_owner;
grant select (projeto_ref) on identidade.bootstrap_tecnico_controle to ffcmapp_servico_cofre_owner;
grant select (codigo, tipo) on auditoria.operador_tecnico to ffcmapp_servico_cofre_owner;
grant insert (id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_servico_cofre_owner;
create policy cofre_servico_config_select on identidade.cofre_servico_teste_configuracao for select to ffcmapp_servico_cofre_owner using (true);
create policy cofre_servico_controle_select on identidade.bootstrap_tecnico_controle for select to ffcmapp_servico_cofre_owner using (true);
create policy cofre_servico_operador_select on auditoria.operador_tecnico for select to ffcmapp_servico_cofre_owner using (true);
create policy cofre_servico_auditoria_insert on auditoria.evento for insert to ffcmapp_servico_cofre_owner with check (acao='bootstrap.cofre_servico' and ator_usuario_id is null and operador_restrito is not null);

-- Devem ser concedidos pelos owners efetivos; uma falha interrompe a migração.
grant execute on function auditoria.operador_tecnico_atual() to ffcmapp_servico_cofre_owner;
grant execute on function identidade.ler_chave_cifra_vault(text) to ffcmapp_servico_cofre_owner;
grant execute on function identidade.ler_chave_hmac_email_bootstrap() to ffcmapp_servico_cofre_owner;

-- O migrador precisa poder SET ROLE neste owner; acesso é removido após criação.
select set_config('ffcmapp.cofre_servico_migrador', current_user, false);
select set_config('ffcmapp.cofre_servico_tinha_set', pg_has_role(current_user,'ffcmapp_servico_cofre_owner','SET')::text, false);
do $$ begin
 if current_setting('ffcmapp.cofre_servico_tinha_set')='false' then
  execute format('grant ffcmapp_servico_cofre_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
grant create on schema identidade to ffcmapp_servico_cofre_owner;
set role ffcmapp_servico_cofre_owner;
create function identidade.ler_cofre_servico_teste(p_projeto text, p_tipo text, p_request uuid, p_referencia text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_operador text; v_ref text; v_valor text;
begin
  v_operador := auditoria.operador_tecnico_atual();
  if p_request is null or p_tipo is null or p_tipo not in ('cifra','hmac') or not exists
    (select 1 from auditoria.operador_tecnico where codigo=v_operador and tipo='servico_teste') then
    raise exception using errcode='42501', message='OPERADOR_NAO_AUTORIZADO';
  end if;
  select c.referencia_cifra into strict v_ref
    from identidade.cofre_servico_teste_configuracao c
    join identidade.bootstrap_tecnico_controle b on b.projeto_ref=c.projeto_ref
    where c.projeto_ref=p_projeto and (p_tipo <> 'cifra' or c.referencia_cifra=p_referencia);
  if p_tipo='cifra' then v_valor := identidade.ler_chave_cifra_vault(v_ref);
  else v_valor := identidade.ler_chave_hmac_email_bootstrap(); end if;
  insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,resultado,request_id)
    values(gen_random_uuid(),v_operador,'bootstrap.cofre_servico','cofre','permitido',p_request);
  return v_valor;
end $$;
revoke all on function identidade.ler_cofre_servico_teste(text,text,uuid,text) from public, anon, authenticated, service_role;
select set_config('role',current_setting('ffcmapp.cofre_servico_migrador'),false);
revoke create on schema identidade from ffcmapp_servico_cofre_owner;
do $$ begin if current_setting('ffcmapp.cofre_servico_tinha_set')='false' then execute format('revoke ffcmapp_servico_cofre_owner from %I granted by %I',current_user,current_user); end if; end $$;
