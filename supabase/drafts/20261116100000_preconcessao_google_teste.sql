-- Rascunho para revisão e teste isolado. Não aplicar remotamente.
-- Não concede EXECUTE a nenhum login e não configura ou lê o Vault.
begin;
create role ffcmapp_preconcessao_teste_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema identidade, public, auditoria to ffcmapp_preconcessao_teste_owner;
grant select (unico, projeto_ref, usuario_id, concessao_id) on identidade.bootstrap_tecnico_controle to ffcmapp_preconcessao_teste_owner;
grant select (id, ativo, perfil) on public.usuario to ffcmapp_preconcessao_teste_owner;
grant select (id, usuario_id, estado, metodo, perfil), insert (id, email_cifrado, email_hmac, perfil, metodo, estado, motivo_cifrado)
 on identidade.concessao_equipe to ffcmapp_preconcessao_teste_owner;
grant select (singleton, dominio_workspace, google_unico_oauth_confirmado) on identidade.configuracao_auth_nativo to ffcmapp_preconcessao_teste_owner;
grant insert (id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_preconcessao_teste_owner;
create policy preconcessao_teste_controle on identidade.bootstrap_tecnico_controle for select to ffcmapp_preconcessao_teste_owner using (true);
create policy preconcessao_teste_usuario on public.usuario for select to ffcmapp_preconcessao_teste_owner using (true);
create policy preconcessao_teste_concessao_select on identidade.concessao_equipe for select to ffcmapp_preconcessao_teste_owner using (metodo = 'tecnica');
create policy preconcessao_teste_concessao_insert on identidade.concessao_equipe for insert to ffcmapp_preconcessao_teste_owner with check (metodo = 'google_workspace' and estado = 'pendente' and perfil = 'administrador');
create policy preconcessao_teste_config on identidade.configuracao_auth_nativo for select to ffcmapp_preconcessao_teste_owner using (true);
create policy preconcessao_teste_auditoria on auditoria.evento for insert to ffcmapp_preconcessao_teste_owner with check (acao = 'teste.preconcessao_google' and tipo_objeto = 'concessao_equipe' and operador_restrito is not null and ator_usuario_id is null and resultado = 'permitido');

-- O migrador deve poder conceder a função do resolver e assumir o owner.
-- A transação reverte todos os grants temporários em falha.
select set_config('ffcmapp.preconcessao_migrador',current_user,true);
select set_config('ffcmapp.preconcessao_resolver_set',pg_has_role(current_user,'ffcmapp_operador_resolver_owner','SET')::text,true);
do $$ begin
 if current_setting('ffcmapp.preconcessao_resolver_set')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_operador_resolver_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_operador_resolver_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set local role ffcmapp_operador_resolver_owner;
grant execute on function auditoria.operador_tecnico_atual() to ffcmapp_preconcessao_teste_owner;
select set_config('role',current_setting('ffcmapp.preconcessao_migrador'),true);
do $$ begin if current_setting('ffcmapp.preconcessao_resolver_set')='false' then execute format('revoke ffcmapp_operador_resolver_owner from %I granted by %I',current_user,current_user); end if; end $$;
-- Owner é novo, portanto não existe membership prévia a preservar.
do $$ begin execute format('grant ffcmapp_preconcessao_teste_owner to %I with inherit false, set true granted by %I',current_user,current_user); end $$;
grant create on schema identidade to ffcmapp_preconcessao_teste_owner;
set local role ffcmapp_preconcessao_teste_owner;
create function identidade.preconcessao_google_teste(p_projeto text,p_id uuid,p_email jsonb,p_hmac text,p_perfil text,p_motivo jsonb,p_request uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare operador text; linhas integer;
begin
 operador := auditoria.operador_tecnico_atual();
 if p_projeto is distinct from 'drdpuxcllpymtoskmuqv' or p_id is null or p_request is null or p_email is null or p_motivo is null or p_hmac is null or btrim(p_hmac)='' or p_perfil is distinct from 'administrador' then raise exception 'ENTRADA_INVALIDA' using errcode='22023'; end if;
 if not exists (select 1 from identidade.bootstrap_tecnico_controle b join public.usuario u on u.id=b.usuario_id join identidade.concessao_equipe c on c.id=b.concessao_id and c.usuario_id=u.id where b.unico and b.projeto_ref=p_projeto and u.ativo and u.perfil='administrador' and c.estado='vinculada' and c.metodo='tecnica' and c.perfil='administrador') or not exists (select 1 from identidade.configuracao_auth_nativo where singleton and dominio_workspace='francescato.com.br' and google_unico_oauth_confirmado) then raise exception 'CONFIGURACAO_INDISPONIVEL' using errcode='55000'; end if;
 insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values(p_id,p_email,p_hmac,p_perfil,'google_workspace','pendente',p_motivo);
 get diagnostics linhas = row_count;
 if linhas <> 1 then raise exception 'PERSISTENCIA_INDISPONIVEL'; end if;
 insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),operador,'teste.preconcessao_google','concessao_equipe',p_id,'permitido',p_request);
 get diagnostics linhas = row_count;
 if linhas <> 1 then raise exception 'AUDITORIA_INDISPONIVEL'; end if;
 return 'criada';
end $$;
revoke all on function identidade.preconcessao_google_teste(text,uuid,jsonb,text,text,jsonb,uuid) from public, anon, authenticated, service_role;
select set_config('role',current_setting('ffcmapp.preconcessao_migrador'),true);
revoke create on schema identidade from ffcmapp_preconcessao_teste_owner;
do $$ begin execute format('revoke ffcmapp_preconcessao_teste_owner from %I granted by %I',current_user,current_user); end $$;
commit;
