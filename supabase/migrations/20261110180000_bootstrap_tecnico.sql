-- O alvo é configurado separadamente por responsável privilegiado, após verificação
-- independente da conexão. A migração não cadastra operador nem concede execução.
create role ffcmapp_bootstrap_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create table identidade.bootstrap_tecnico_controle (
  unico boolean primary key default true check (unico),
  projeto_ref text not null check (length(btrim(projeto_ref)) > 0 and projeto_ref=btrim(projeto_ref)),
  usuario_id uuid references auth.users(id),
  concessao_id uuid references identidade.concessao_equipe(id),
  check ((usuario_id is null) = (concessao_id is null))
);
alter table identidade.bootstrap_tecnico_controle enable row level security;
revoke all on identidade.bootstrap_tecnico_controle from public, anon, authenticated, service_role;
grant usage on schema identidade, public, auditoria to ffcmapp_bootstrap_owner;
grant select, update (usuario_id, concessao_id) on identidade.bootstrap_tecnico_controle to ffcmapp_bootstrap_owner;
grant select (id, perfil, ativo), insert (id, perfil, ativo) on public.usuario to ffcmapp_bootstrap_owner;
grant select (id, usuario_id, metodo, perfil, email_cifrado, email_hmac, motivo_cifrado),
  insert (id, email_cifrado, email_hmac, perfil, metodo, estado, usuario_id, motivo_cifrado, vinculada_em)
  on identidade.concessao_equipe to ffcmapp_bootstrap_owner;
grant select (usuario_id, concessao_id, motivo_cifrado), insert (usuario_id, concessao_id, motivo_cifrado)
  on identidade.excecao_tecnica to ffcmapp_bootstrap_owner;
grant insert (id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_bootstrap_owner;
create policy bootstrap_controle_select on identidade.bootstrap_tecnico_controle for select to ffcmapp_bootstrap_owner using (true);
create policy bootstrap_controle_update on identidade.bootstrap_tecnico_controle for update to ffcmapp_bootstrap_owner using (true) with check (true);
create policy bootstrap_usuario_select on public.usuario for select to ffcmapp_bootstrap_owner using (true);
create policy bootstrap_usuario_insert on public.usuario for insert to ffcmapp_bootstrap_owner with check (perfil='administrador' and ativo);
create policy bootstrap_concessao_select on identidade.concessao_equipe for select to ffcmapp_bootstrap_owner using (true);
create policy bootstrap_concessao_insert on identidade.concessao_equipe for insert to ffcmapp_bootstrap_owner with check (perfil='administrador' and metodo='tecnica' and estado='vinculada');
create policy bootstrap_excecao_select on identidade.excecao_tecnica for select to ffcmapp_bootstrap_owner using (true);
create policy bootstrap_excecao_insert on identidade.excecao_tecnica for insert to ffcmapp_bootstrap_owner with check (true);
create policy bootstrap_auditoria_insert on auditoria.evento for insert to ffcmapp_bootstrap_owner with check (acao='bootstrap.tecnico' and operador_restrito is not null and ator_usuario_id is null);
select set_config('ffcmapp.bootstrap_migrador',current_user,false);
grant ffcmapp_operador_resolver_owner to current_user with inherit false, set true;
set role ffcmapp_operador_resolver_owner;
grant execute on function auditoria.operador_tecnico_atual() to ffcmapp_bootstrap_owner;
select set_config('role',current_setting('ffcmapp.bootstrap_migrador'),false);
revoke ffcmapp_operador_resolver_owner from current_user;
grant ffcmapp_bootstrap_owner to current_user with inherit false, set true;
grant create on schema identidade to ffcmapp_bootstrap_owner;
set role ffcmapp_bootstrap_owner;
create function identidade.bootstrap_tecnico(
 p_projeto text, p_usuario uuid, p_concessao uuid, p_email_cifrado jsonb,
 p_email_hmac text, p_motivo_cifrado jsonb, p_request uuid
) returns text language plpgsql security definer set search_path = '' as $$
declare v_alvo identidade.bootstrap_tecnico_controle%rowtype; v_operador text; v_resultado text; v_linhas integer;
begin
  v_operador := auditoria.operador_tecnico_atual();
  if p_projeto is null or btrim(p_projeto) = '' or p_usuario is null or p_concessao is null
    or p_request is null or p_email_hmac is null or btrim(p_email_hmac) = ''
    or p_motivo_cifrado is null or p_email_cifrado is null then
    raise exception 'entrada inválida' using errcode = '22023';
  end if;
  select * into v_alvo from identidade.bootstrap_tecnico_controle where unico for update;
  if not found or v_alvo.projeto_ref <> p_projeto then
    raise exception 'alvo não confirmado' using errcode = '22023';
  end if;
  if v_alvo.usuario_id is null then
    insert into public.usuario(id,perfil,ativo) values (p_usuario,'administrador',true);
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de usuário indisponível'; end if;
    insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,motivo_cifrado,vinculada_em)
      values(p_concessao,p_email_cifrado,p_email_hmac,'administrador','tecnica','vinculada',p_usuario,p_motivo_cifrado,clock_timestamp());
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de concessão indisponível'; end if;
    insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values(p_usuario,p_concessao,p_motivo_cifrado);
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de exceção indisponível'; end if;
    update identidade.bootstrap_tecnico_controle set usuario_id=p_usuario,concessao_id=p_concessao where unico;
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de controle indisponível'; end if;
    v_resultado := 'inicializado';
  else
    if v_alvo.usuario_id <> p_usuario or v_alvo.concessao_id <> p_concessao
      or not exists (select 1 from identidade.concessao_equipe c
        join identidade.excecao_tecnica e on e.usuario_id=p_usuario and e.concessao_id=c.id
        where c.id=p_concessao and c.usuario_id=p_usuario and c.metodo='tecnica' and c.perfil='administrador'
          and c.email_cifrado=p_email_cifrado and c.email_hmac=p_email_hmac
          and c.motivo_cifrado=p_motivo_cifrado and e.motivo_cifrado=p_motivo_cifrado) then
      raise exception 'bootstrap divergente' using errcode = '22023';
    end if;
    -- Repetição nunca reativa nem repara contas ou concessões.
    v_resultado := 'ja_inicializado';
  end if;
  insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),v_operador,'bootstrap.tecnico','usuario',p_usuario,'permitido',p_request);
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then raise exception 'auditoria indisponível'; end if;
  return v_resultado;
end $$;
revoke all on function identidade.bootstrap_tecnico(text,uuid,uuid,jsonb,text,jsonb,uuid) from public, anon, authenticated, service_role;
select set_config('role',current_setting('ffcmapp.bootstrap_migrador'),false);
revoke create on schema identidade from ffcmapp_bootstrap_owner;
revoke ffcmapp_bootstrap_owner from current_user;
