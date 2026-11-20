begin;
-- FR-078 (diario-de-plantao, D2): generalização ADITIVA do catálogo de campos extras do
-- Plano de cuidado para servir também de modelo da ficha de plantão. Nenhuma linha
-- existente muda de valor: toda coluna nova tem `default` que reproduz o comportamento
-- atual do Plano, e a ação literal continua significando `plano_cuidado`.
-- Nada aqui concede privilégio a anon/authenticated/service_role nem ativa rota.

-- 1. Colunas novas. `escopo` fecha o conjunto; `ordem`, `obrigatorio`, `de_fabrica` e
--    `visibilidade` são as quatro lacunas levantadas para servir de modelo de formulário.
alter table cadastro.campo_extra_plano_catalogo
  add column escopo text not null default 'plano_cuidado'
    constraint campo_extra_catalogo_escopo_chk check (escopo in ('plano_cuidado', 'ficha_plantao')),
  add column ordem integer not null default 0
    constraint campo_extra_catalogo_ordem_chk check (ordem between 0 and 999999999),
  add column obrigatorio boolean not null default false,
  add column de_fabrica boolean not null default false,
  add column visibilidade text not null default 'interna'
    constraint campo_extra_catalogo_visibilidade_chk check (visibilidade in ('interna', 'compartilhavel'));

-- 2. Tipos novos. O CHECK antigo era inline (nome gerado); descobre e substitui sem supor nome.
do $$
declare nome text;
begin
  select conname into nome from pg_constraint
    where conrelid = 'cadastro.campo_extra_plano_catalogo'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%tipo%' and pg_get_constraintdef(oid) like '%''lista''%'
      and pg_get_constraintdef(oid) not like '%opcoes%';
  if nome is null then raise exception 'CHECK_TIPO_NAO_ENCONTRADO'; end if;
  execute format('alter table cadastro.campo_extra_plano_catalogo drop constraint %I', nome);
end $$;
alter table cadastro.campo_extra_plano_catalogo
  add constraint campo_extra_catalogo_tipo_chk
    check (tipo in ('texto', 'numero', 'data', 'lista', 'booleano', 'texto_longo'));

-- 3. Campo de fábrica é semeado pela migração, sem pessoa que o tenha criado. A exigência
--    de autor continua valendo para todo campo acrescentado por gente.
alter table cadastro.campo_extra_plano_catalogo alter column criado_por_usuario_id drop not null;
alter table cadastro.campo_extra_plano_catalogo
  add constraint campo_extra_catalogo_criador_chk
    check (de_fabrica or criado_por_usuario_id is not null);

create index campo_extra_plano_catalogo_escopo_ordem_idx
  on cadastro.campo_extra_plano_catalogo (escopo, ordem, criado_em, id);

-- 4. Revalidação do retrato id->versão extraída para função chamável. Hoje ela está
--    injetada no corpo de api.plano_cuidado_operacao_privada por substituição de âncora
--    textual; um segundo consumidor repetiria a substituição e as duas cópias divergiriam
--    em silêncio. Semântica preservada: mesmo `for share`, mesma recusa com `conflito`,
--    mesma ENTRADA_INVALIDA. O filtro por escopo é estritamente mais restritivo e, para o
--    Plano (todas as linhas pré-existentes são 'plano_cuidado'), idêntico ao de hoje.
create function operacao.campo_extra_revalidar_snapshot(p_escopo text, p_snapshot jsonb)
  returns boolean language plpgsql security invoker set search_path = '' as $$
declare campo_extra record; versao_catalogo integer;
begin
  if p_escopo is null or p_escopo not in ('plano_cuidado', 'ficha_plantao') then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  if p_snapshot is null then return true; end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  for campo_extra in select key, value from jsonb_each(p_snapshot) order by key loop
    if campo_extra.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(campo_extra.value) is distinct from 'number'
      or (campo_extra.value #>> '{}') !~ '^[1-9][0-9]{0,9}$' then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select c.versao into versao_catalogo from cadastro.campo_extra_plano_catalogo c
      where c.id = campo_extra.key::uuid and c.ativo and c.escopo = p_escopo for share;
    if not found or versao_catalogo::text is distinct from (campo_extra.value #>> '{}') then
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke all on function operacao.campo_extra_revalidar_snapshot(text, jsonb)
  from public, anon, authenticated, service_role;

-- 5. Helper de substituição por âncora. Mesmo desenho de 20261125190000, com uma diferença
--    registrada: não fixa o md5 do corpo anterior. O corpo de api.plano_cuidado_operacao_privada
--    tem dois estados legítimos neste ponto da cadeia (com e sem 20261125250000), e fixar um
--    deles quebraria a outra. A garantia equivalente é a unicidade da âncora — um bloco
--    verbatim de ~1,2 KB — mais a conferência de que o corpo final contém o texto novo,
--    além da preservação de
--    owner/ACL/proconfig/prosecdef/assinatura, que continua idêntica à do helper original.
create function pg_temp.generalizar_campo_extra(p_assinatura text, p_patches jsonb) returns void
  language plpgsql as $guard$
declare
  oid_alvo oid := to_regprocedure(p_assinatura); antes record; depois record; definicao text;
  migrador text := current_user; dono text; esquema text; tinha_set boolean; tinha_create boolean;
  novo_corpo text; patch jsonb; antigo text; novo text;
begin
  if oid_alvo is null then raise exception 'CONSUMIDOR_AUSENTE: %', p_assinatura; end if;
  select p.prosrc, p.proowner, p.proacl, p.proconfig, p.prosecdef, p.prorettype, p.proargtypes
    into antes from pg_proc p where p.oid = oid_alvo;
  select r.rolname, n.nspname into dono, esquema from pg_proc p
    join pg_roles r on r.oid = p.proowner join pg_namespace n on n.oid = p.pronamespace
    where p.oid = oid_alvo and (not antes.prosecdef or (not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin));
  if dono is null or not ('search_path=""' = any(antes.proconfig)) then
    raise exception 'OWNER_CONFIG_INESPERADO: %', p_assinatura;
  end if;
  novo_corpo := antes.prosrc;
  for patch in select value from jsonb_array_elements(p_patches) loop
    antigo := patch->>'antes'; novo := patch->>'depois';
    if antigo is null or antigo = '' or novo is null
      or (length(novo_corpo) - length(replace(novo_corpo, antigo, ''))) / length(antigo) <> 1 then
      raise exception 'ANCORA_NAO_UNICA: % / %', p_assinatura, left(antigo, 60);
    end if;
    novo_corpo := replace(novo_corpo, antigo, novo);
    if (length(novo_corpo) - length(replace(novo_corpo, novo, ''))) / greatest(length(novo), 1) < 1 then
      raise exception 'SUBSTITUICAO_NAO_APLICADA: %', p_assinatura;
    end if;
  end loop;
  if antes.prosecdef then
    tinha_set := pg_has_role(migrador, dono, 'SET');
    tinha_create := has_schema_privilege(dono, esquema, 'CREATE');
    if not tinha_set then
      if exists(select 1 from pg_auth_members where roleid = dono::regrole and member = migrador::regrole and grantor = migrador::regrole) then
        raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
      end if;
      execute format('grant %I to %I with inherit false, set true granted by %I', dono, migrador, migrador);
    end if;
    if not tinha_create then execute format('grant create on schema %I to %I', esquema, dono); end if;
    definicao := pg_get_functiondef(oid_alvo);
    perform set_config('role', dono, true);
    execute replace(definicao, antes.prosrc, novo_corpo);
    perform set_config('role', migrador, true);
    if not tinha_create then execute format('revoke create on schema %I from %I', esquema, dono); end if;
    if not tinha_set then execute format('revoke %I from %I granted by %I', dono, migrador, migrador); end if;
  else
    if not pg_has_role(migrador, dono, 'USAGE') then
      raise exception 'OWNERSHIP_INVOKER_INDISPONIVEL: %', p_assinatura;
    end if;
    definicao := pg_get_functiondef(oid_alvo);
    execute replace(definicao, antes.prosrc, novo_corpo);
  end if;
  select p.prosrc, p.proowner, p.proacl, p.proconfig, p.prosecdef, p.prorettype, p.proargtypes
    into depois from pg_proc p where p.oid = oid_alvo;
  if depois.proowner <> antes.proowner or depois.proacl is distinct from antes.proacl
    or depois.proconfig is distinct from antes.proconfig or depois.prosecdef <> antes.prosecdef
    or depois.prorettype <> antes.prorettype or depois.proargtypes <> antes.proargtypes
    or depois.prosrc <> novo_corpo then
    raise exception 'CONSUMIDOR_NAO_PRESERVADO: %', p_assinatura;
  end if;
end $guard$;

-- 6. Plano de cuidado passa a chamar a função extraída. Auditoria, código de erro e
--    retorno continuam sendo decididos pelo Plano, que é quem conhece 'paciente'.
select pg_temp.generalizar_campo_extra('api.plano_cuidado_operacao_privada(jsonb)', jsonb_build_array(
jsonb_build_object('antes', $fragmento$  declare campo_extra record; versao_catalogo integer; begin
    if e ? 'campos_extras_catalogo' then
      if jsonb_typeof(e->'campos_extras_catalogo') is distinct from 'object' then
        raise exception using errcode='22023', message='ENTRADA_INVALIDA';
      end if;
      for campo_extra in select key, value from jsonb_each(e->'campos_extras_catalogo') order by key loop
        if campo_extra.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(campo_extra.value) is distinct from 'number'
          or (campo_extra.value #>> '{}') !~ '^[1-9][0-9]{0,9}$' then
          raise exception using errcode='22023', message='ENTRADA_INVALIDA';
        end if;
        select c.versao into versao_catalogo from cadastro.campo_extra_plano_catalogo c
          where c.id=campo_extra.key::uuid and c.ativo for share;
        if not found or versao_catalogo::text is distinct from (campo_extra.value #>> '{}') then
          insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
            values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
          if not found then raise exception using errcode='P0002', message='AUDITORIA_NAO_INSERIDA'; end if;
          return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
        end if;
      end loop;
    end if;
  end;$fragmento$, 'depois', $fragmento$  begin
    if operacao.campo_extra_revalidar_snapshot('plano_cuidado', e->'campos_extras_catalogo') is not true then
      insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
        values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
      if not found then raise exception using errcode='P0002', message='AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
    end if;
  end;$fragmento$)));

grant select (escopo) on cadastro.campo_extra_plano_catalogo to ffcmapp_plano_owner;
grant execute on function operacao.campo_extra_revalidar_snapshot(text, jsonb) to ffcmapp_plano_owner;
-- 7. Ações parametrizadas por escopo. As literais `api.listar_campo_extra_plano` e
--    `api.gravar_campo_extra_plano` continuam existindo e continuam significando
--    `plano_cuidado` — agora explicitamente, com filtro de escopo, para que a semeadura da
--    ficha não apareça no catálogo do Plano. As irmãs `api.listar_campo_extra` e
--    `api.gravar_campo_extra` levam o escopo no corpo do pedido e enxergam as colunas novas.
select pg_temp.generalizar_campo_extra('operacao.campo_extra_plano_operacao_privada(jsonb)', jsonb_build_array(
jsonb_build_object('antes', $f1$  anterior operacao.requisicao; resultado jsonb; acao text; atual integer; opcoes jsonb; item jsonb;$f1$,
 'depois', $f1$  anterior operacao.requisicao; resultado jsonb; acao text; atual integer; opcoes jsonb; item jsonb;
  escopo text;$f1$),
jsonb_build_object('antes', $f2$    or e - array['request_id', 'campo_id', 'nome', 'tipo', 'opcoes', 'ativo', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb$f2$,
 'depois', $f2$    or e - array['request_id', 'campo_id', 'escopo', 'nome', 'tipo', 'opcoes', 'ativo', 'ordem',
      'obrigatorio', 'visibilidade', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb$f2$),
jsonb_build_object('antes', $f3$    or acao not in ('api.listar_campo_extra_plano', 'api.gravar_campo_extra_plano')$f3$,
 'depois', $f3$    or acao not in ('api.listar_campo_extra_plano', 'api.gravar_campo_extra_plano',
      'api.listar_campo_extra', 'api.gravar_campo_extra')$f3$),
jsonb_build_object('antes', $f4$    or (acao = 'api.listar_campo_extra_plano' and contexto_gerenciado->>'perfil' = 'profissional') then$f4$,
 'depois', $f4$    or (acao in ('api.listar_campo_extra_plano', 'api.listar_campo_extra')
      and contexto_gerenciado->>'perfil' = 'profissional') then$f4$),
jsonb_build_object('antes', $f5$  if acao = 'api.listar_campo_extra_plano' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('campo_id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'opcoes', c.opcoes, 'ativo', c.ativo, 'versao', c.versao) order by c.criado_em), '[]'::jsonb)
      into resultado from cadastro.campo_extra_plano_catalogo c;$f5$,
 'depois', $f5$  if acao in ('api.listar_campo_extra_plano', 'api.listar_campo_extra') then
    escopo := case when acao = 'api.listar_campo_extra_plano' then 'plano_cuidado' else e->>'escopo' end;
    if (acao = 'api.listar_campo_extra_plano' and e - array['request_id', 'atestado'] <> '{}'::jsonb)
      or (acao = 'api.listar_campo_extra' and (e - array['request_id', 'escopo', 'atestado'] <> '{}'::jsonb
        or coalesce(escopo, '') not in ('plano_cuidado', 'ficha_plantao'))) then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    if acao = 'api.listar_campo_extra_plano' then
      select coalesce(jsonb_agg(jsonb_build_object('campo_id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'opcoes', c.opcoes, 'ativo', c.ativo, 'versao', c.versao) order by c.criado_em), '[]'::jsonb)
        into resultado from cadastro.campo_extra_plano_catalogo c where c.escopo = escopo;
    else
      select coalesce(jsonb_agg(jsonb_build_object('campo_id', c.id, 'escopo', c.escopo, 'nome', c.nome, 'tipo', c.tipo, 'opcoes', c.opcoes, 'ativo', c.ativo, 'ordem', c.ordem, 'obrigatorio', c.obrigatorio, 'de_fabrica', c.de_fabrica, 'visibilidade', c.visibilidade, 'versao', c.versao) order by c.ordem, c.criado_em, c.id), '[]'::jsonb)
        into resultado from cadastro.campo_extra_plano_catalogo c where c.escopo = escopo;
    end if;$f5$),
jsonb_build_object('antes', $f6$  opcoes := e->'opcoes';
  if opcoes = 'null'::jsonb then opcoes := null; end if;
  if campo is null or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(length(btrim(e->>'nome')) between 1 and 120, false) is not true
    or coalesce(e->>'tipo', '') not in ('texto', 'numero', 'data', 'lista')$f6$,
 'depois', $f6$  escopo := case when acao = 'api.gravar_campo_extra_plano' then 'plano_cuidado' else e->>'escopo' end;
  opcoes := e->'opcoes';
  if opcoes = 'null'::jsonb then opcoes := null; end if;
  if escopo is null or escopo not in ('plano_cuidado', 'ficha_plantao')
    or (acao = 'api.gravar_campo_extra_plano' and e ?| array['escopo', 'ordem', 'obrigatorio', 'visibilidade'])
    or (acao = 'api.gravar_campo_extra' and (jsonb_typeof(e->'ordem') is distinct from 'number'
      or coalesce(e->>'ordem', '') !~ '^(0|[1-9][0-9]{0,8})$'
      or jsonb_typeof(e->'obrigatorio') is distinct from 'boolean'
      or coalesce(e->>'visibilidade', '') not in ('interna', 'compartilhavel')))
    or campo is null or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(length(btrim(e->>'nome')) between 1 and 120, false) is not true
    or not (coalesce(e->>'tipo', '') in ('texto', 'numero', 'data', 'lista')
      or (acao = 'api.gravar_campo_extra' and coalesce(e->>'tipo', '') in ('booleano', 'texto_longo')))$f6$),
jsonb_build_object('antes', $f7$      or not exists(select 1 from cadastro.campo_extra_plano_catalogo c where c.id = campo and c.versao = (e->>'versao_esperada')::integer + 1) then$f7$,
 'depois', $f7$      or not exists(select 1 from cadastro.campo_extra_plano_catalogo c where c.id = campo and c.escopo = escopo and c.versao = (e->>'versao_esperada')::integer + 1) then$f7$),
jsonb_build_object('antes', $f8$    select c.versao into atual from cadastro.campo_extra_plano_catalogo c where c.id = campo for update;$f8$,
 'depois', $f8$    select c.versao into atual from cadastro.campo_extra_plano_catalogo c where c.id = campo and c.escopo = escopo for update;$f8$),
jsonb_build_object('antes', $f9$        insert into cadastro.campo_extra_plano_catalogo(id, nome, tipo, opcoes, ativo, versao, criado_por_usuario_id)
          values(campo, btrim(e->>'nome'), e->>'tipo', opcoes, (e->'ativo')::boolean, 1, ator);$f9$,
 'depois', $f9$        insert into cadastro.campo_extra_plano_catalogo(id, escopo, nome, tipo, opcoes, ativo, ordem, obrigatorio, de_fabrica, visibilidade, versao, criado_por_usuario_id)
          values(campo, escopo, btrim(e->>'nome'), e->>'tipo', opcoes, (e->'ativo')::boolean,
            case when acao = 'api.gravar_campo_extra' then (e->>'ordem')::integer else 0 end,
            case when acao = 'api.gravar_campo_extra' then (e->'obrigatorio')::boolean else false end,
            false,
            case when acao = 'api.gravar_campo_extra' then e->>'visibilidade' else 'interna' end,
            1, ator);$f9$),
jsonb_build_object('antes', $fa$      update cadastro.campo_extra_plano_catalogo
        set nome = btrim(e->>'nome'), tipo = e->>'tipo', opcoes = opcoes, ativo = (e->'ativo')::boolean,
          versao = atual + 1, atualizado_em = clock_timestamp()
        where id = campo and versao = atual;$fa$,
 'depois', $fa$      update cadastro.campo_extra_plano_catalogo
        set nome = btrim(e->>'nome'), tipo = e->>'tipo', opcoes = opcoes, ativo = (e->'ativo')::boolean,
          ordem = case when acao = 'api.gravar_campo_extra' then (e->>'ordem')::integer else campo_extra_plano_catalogo.ordem end,
          obrigatorio = case when acao = 'api.gravar_campo_extra' then (e->'obrigatorio')::boolean else campo_extra_plano_catalogo.obrigatorio end,
          visibilidade = case when acao = 'api.gravar_campo_extra' then e->>'visibilidade' else campo_extra_plano_catalogo.visibilidade end,
          versao = atual + 1, atualizado_em = clock_timestamp()
        where id = campo and versao = atual;$fa$),
jsonb_build_object('antes', $fb$  select jsonb_build_object('campo_id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'opcoes', c.opcoes, 'ativo', c.ativo, 'versao', c.versao) into resultado
    from cadastro.campo_extra_plano_catalogo c where c.id = campo;$fb$,
 'depois', $fb$  select case when acao = 'api.gravar_campo_extra'
      then jsonb_build_object('campo_id', c.id, 'escopo', c.escopo, 'nome', c.nome, 'tipo', c.tipo, 'opcoes', c.opcoes, 'ativo', c.ativo, 'ordem', c.ordem, 'obrigatorio', c.obrigatorio, 'de_fabrica', c.de_fabrica, 'visibilidade', c.visibilidade, 'versao', c.versao)
      else jsonb_build_object('campo_id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'opcoes', c.opcoes, 'ativo', c.ativo, 'versao', c.versao) end into resultado
    from cadastro.campo_extra_plano_catalogo c where c.id = campo;$fb$)));

grant execute on function operacao.campo_extra_revalidar_snapshot(text, jsonb) to ffcmapp_campo_extra_plano_owner;
commit;
