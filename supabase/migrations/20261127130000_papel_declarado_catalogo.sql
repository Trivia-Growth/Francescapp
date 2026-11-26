begin;
-- FR-079 (diario-de-plantao, D4): catálogo administrado de papéis declarados do
-- profissional. É rótulo de registro, nunca autorização.
--
-- A barreira é ESTRUTURAL, não convencional: o papel que decide acesso a conteúdo de
-- caso (ffcmapp_turno_owner e os demais owners de autorização) NÃO recebe grant nenhum
-- nesta tabela. Uma regra de autorização que quisesse consultar o papel declarado
-- falharia por privilégio, no banco, antes de existir. O enum `usuario.perfil` não é
-- tocado. Preparação privada: sem grant de aplicação, sem rota, sem ativação.
create table cadastro.papel_declarado_catalogo (
  id uuid primary key,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  ativo boolean not null default true,
  de_fabrica boolean not null default false,
  versao integer not null default 1 check (versao between 1 and 2147483647),
  criado_por_usuario_id uuid references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint papel_declarado_criador_chk check (de_fabrica or criado_por_usuario_id is not null)
);
create unique index papel_declarado_catalogo_nome_uidx
  on cadastro.papel_declarado_catalogo (lower(btrim(nome)));
create index papel_declarado_catalogo_ativo_idx on cadastro.papel_declarado_catalogo (ativo);
alter table cadastro.papel_declarado_catalogo enable row level security;
revoke all on cadastro.papel_declarado_catalogo from public, anon, authenticated, service_role;

-- Tarefa 0.3 (P1 resolvida em 20/11/2026): o catálogo nasce com exatamente dois termos.
-- Os demais o Administrador acrescenta pela tela.
insert into cadastro.papel_declarado_catalogo(id, nome, ativo, de_fabrica, versao, criado_por_usuario_id)
values
  ('7f2d0001-0000-4000-8000-000000000001', 'Acompanhante terapêutico', true, true, 1, null),
  ('7f2d0001-0000-4000-8000-000000000002', 'Enfermeira', true, true, 1, null);

-- Autorização: mesmo desenho vigente de operacao.campo_extra_plano_operacao_privada
-- (contexto gerenciado DF-023 com autenticador legado como alternativa), administrador
-- para gravar; listar também para profissional, porque é ele quem escolhe o próprio papel
-- ao preencher a ficha. Família nunca lê o catálogo.
create function operacao.papel_declarado_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; papel uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text; atual integer;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'papel_id', 'nome', 'ativo', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; papel := (e->>'papel_id')::uuid; auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_papel_declarado', 'api.gravar_papel_declarado')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado := identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' = 'administrador'
    or (acao = 'api.listar_papel_declarado' and contexto_gerenciado->>'perfil' = 'profissional') then
   autorizado := true;
   concessao := (contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
      select i.provider_id, i.identity_data into google from auth_privado.identidades() i where i.user_id = ator and i.provider = 'google'
        and bloqueios_auth.travar(ator, sessao)
        and exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()))
        and (select count(*) from auth_privado.identidades() j where j.user_id = ator and j.provider = 'google') = 1;
      if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true' and google.identity_data#>>'{custom_claims,hd}' = dominio then
        select c.id, c.subject_google into concessao, sujeito from identidade.concessao_equipe c
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.perfil = 'administrador' for share;
        if found and sujeito = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
      select c.id into concessao from identidade.concessao_equipe c
        where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'tecnica' and c.perfil = 'administrador' for share;
      if found then
        perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
        if found then
          perform 1 from identidade.excecao_tecnica x where x.usuario_id = ator and x.concessao_id = concessao for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
 end if;

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'papel_declarado_catalogo', papel, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_papel_declarado' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('papel_id', p.id, 'nome', p.nome, 'ativo', p.ativo, 'de_fabrica', p.de_fabrica, 'versao', p.versao) order by p.nome, p.id), '[]'::jsonb)
      into resultado from cadastro.papel_declarado_catalogo p;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'papel_declarado_catalogo', null, 'permitido', req);
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
  -- acao = 'api.gravar_papel_declarado'. Não há grant de DELETE: "remover" é ativo = false,
  -- que bumpa a versão. Ficha já gravada guarda o papel declarado à época e não é reescrita.
  if papel is null or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(length(btrim(e->>'nome')) between 1 and 120, false) is not true
    or jsonb_typeof(e->'ativo') is distinct from 'boolean'
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or auditoria_id is null then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.gravar_papel_declarado', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', papel, (e->>'versao_esperada')::integer + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator and r.operacao = 'api.gravar_papel_declarado' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
      or anterior.resultado_id is distinct from papel or anterior.resultado_versao is distinct from (e->>'versao_esperada')::integer + 1
      or not exists(select 1 from cadastro.papel_declarado_catalogo p where p.id = papel and p.versao = (e->>'versao_esperada')::integer + 1) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'papel_declarado_catalogo', papel, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    select p.versao into atual from cadastro.papel_declarado_catalogo p where p.id = papel for update;
    if (coalesce((e->>'versao_esperada')::integer, 0) = 0 and found)
      or ((e->>'versao_esperada')::integer > 0 and (not found or atual <> (e->>'versao_esperada')::integer)) then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'papel_declarado_catalogo', papel, 'negado', req);
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    if (e->>'versao_esperada')::integer = 0 then
      begin
        insert into cadastro.papel_declarado_catalogo(id, nome, ativo, de_fabrica, versao, criado_por_usuario_id)
          values(papel, btrim(e->>'nome'), (e->'ativo')::boolean, false, 1, ator);
      exception when unique_violation then
        delete from operacao.requisicao where id = anterior.id;
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'papel_declarado_catalogo', papel, 'negado', req);
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end;
    else
      begin
        update cadastro.papel_declarado_catalogo
          set nome = btrim(e->>'nome'), ativo = (e->'ativo')::boolean,
            versao = atual + 1, atualizado_em = clock_timestamp()
          where id = papel and versao = atual;
      exception when unique_violation then
        delete from operacao.requisicao where id = anterior.id;
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'papel_declarado_catalogo', papel, 'negado', req);
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
      end;
    end if;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'papel_declarado_catalogo', papel, 'permitido', req);
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object('papel_id', p.id, 'nome', p.nome, 'ativo', p.ativo, 'de_fabrica', p.de_fabrica, 'versao', p.versao) into resultado
    from cadastro.papel_declarado_catalogo p where p.id = papel;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
revoke all on function operacao.papel_declarado_operacao_privada(jsonb) from public, anon, authenticated, service_role;

create function api.papel_declarado_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; papel uuid; acao text;
begin
  begin
    return operacao.papel_declarado_operacao_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    papel := (p_transporte#>>'{entrada,papel_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'papel_declarado_catalogo', papel, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.papel_declarado_privado(jsonb) from public, anon, authenticated, service_role;

create role ffcmapp_papel_declarado_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_papel_declarado_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_papel_declarado_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_papel_declarado_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid), operacao.papel_declarado_operacao_privada(jsonb) to ffcmapp_papel_declarado_owner;
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_papel_declarado_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_papel_declarado_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_papel_declarado_owner;
grant select (usuario_id, concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_papel_declarado_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_papel_declarado_owner;
-- Sem DELETE, de propósito: desativar é ativo = false com bump de versão.
grant select, insert, update on cadastro.papel_declarado_catalogo to ffcmapp_papel_declarado_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_papel_declarado_owner;
grant insert (id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_papel_declarado_owner;
create policy papel_declarado_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_papel_declarado_owner using (true);
create policy papel_declarado_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_papel_declarado_owner using (true) with check (false);
create policy papel_declarado_usuario_select on public.usuario for select to ffcmapp_papel_declarado_owner using (id = (select auth_privado.uid()));
create policy papel_declarado_usuario_lock on public.usuario for update to ffcmapp_papel_declarado_owner using (id = (select auth_privado.uid())) with check (false);
create policy papel_declarado_concessao_select on identidade.concessao_equipe for select to ffcmapp_papel_declarado_owner using (usuario_id = (select auth_privado.uid()));
create policy papel_declarado_concessao_lock on identidade.concessao_equipe for update to ffcmapp_papel_declarado_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy papel_declarado_excecao_select on identidade.excecao_tecnica for select to ffcmapp_papel_declarado_owner using (usuario_id = (select auth_privado.uid()));
create policy papel_declarado_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_papel_declarado_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy papel_declarado_sessao_select on identidade.sessao for select to ffcmapp_papel_declarado_owner using (usuario_id = (select auth_privado.uid()));
create policy papel_declarado_sessao_lock on identidade.sessao for update to ffcmapp_papel_declarado_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy papel_declarado_catalogo_rw on cadastro.papel_declarado_catalogo for all to ffcmapp_papel_declarado_owner using (true) with check (true);
create policy papel_declarado_requisicao on operacao.requisicao to ffcmapp_papel_declarado_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_papel_declarado') with check (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.gravar_papel_declarado');
create policy papel_declarado_auditoria on auditoria.evento for insert to ffcmapp_papel_declarado_owner with check (ator_usuario_id = (select auth_privado.uid()));
alter function api.papel_declarado_privado(jsonb) owner to ffcmapp_papel_declarado_owner;
select set_config('ffcmapp.papel_declarado_migrador', current_user, false);
set role ffcmapp_papel_declarado_owner;
revoke all on function api.papel_declarado_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.papel_declarado_migrador'), false);
revoke create on schema api from ffcmapp_papel_declarado_owner;
revoke ffcmapp_papel_declarado_owner from current_user;

-- Contexto gerenciado DF-023: a concessão de EXECUTE pertence a ffcmapp_acessos_owner.
select set_config('ffcmapp.papel_declarado_tinha_acessos', pg_has_role(current_user, 'ffcmapp_acessos_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.papel_declarado_tinha_acessos') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_acessos_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_ACESSOS_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_acessos_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_acessos_owner;
grant execute on function identidade.contexto_acesso_vigente(boolean), identidade.cadastro_gerenciado_proprio(boolean) to ffcmapp_papel_declarado_owner;
reset role;
select set_config('role', current_setting('ffcmapp.papel_declarado_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.papel_declarado_tinha_acessos') = 'false' then
    execute format('revoke ffcmapp_acessos_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

select set_config('ffcmapp.papel_declarado_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.papel_declarado_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_papel_declarado_owner;
reset role;
select set_config('role', current_setting('ffcmapp.papel_declarado_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.papel_declarado_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;

-- D4, barreira estrutural conferida na própria migração: nenhum owner de autorização
-- alcança o catálogo de papéis.
do $$
declare r record;
begin
  for r in select rolname from pg_roles where rolname like 'ffcmapp\_%\_owner' and rolname <> 'ffcmapp_papel_declarado_owner' loop
    if has_table_privilege(r.rolname, 'cadastro.papel_declarado_catalogo', 'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE') then
      raise exception 'OWNER_DE_AUTORIZACAO_ALCANCA_PAPEL: %', r.rolname;
    end if;
  end loop;
  if has_table_privilege('anon', 'cadastro.papel_declarado_catalogo', 'SELECT')
    or has_table_privilege('authenticated', 'cadastro.papel_declarado_catalogo', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'cadastro.papel_declarado_catalogo', 'SELECT') then
    raise exception 'CATALOGO_PAPEL_EXPOSTO';
  end if;
  if has_table_privilege('ffcmapp_papel_declarado_owner', 'cadastro.papel_declarado_catalogo', 'DELETE') then
    raise exception 'PAPEL_COM_DELETE';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.usuario'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%perfil%') is distinct from
     $perfil$CHECK ((perfil = ANY (ARRAY['administrador'::text, 'profissional'::text, 'familia'::text])))$perfil$ then
    raise exception 'ENUM_PERFIL_ALTERADO';
  end if;
end $$;
commit;
