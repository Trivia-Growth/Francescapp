-- Somente leitura. Nunca consulta Vault, sessão, paciente ou valor de segredo.
-- Alternativa ao log Netlify para configuracao-no-banco 6.7.
select jsonb_build_object(
  'owner', (select r.rolname from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='api.configuracao_sistema_privado(jsonb)'::regprocedure),
  'authenticated_executa', has_function_privilege('authenticated',
    'api.configuracao_sistema_privado(jsonb)', 'EXECUTE'),
  'anon_executa', has_function_privilege('anon',
    'api.configuracao_sistema_privado(jsonb)', 'EXECUTE'),
  'service_role_executa', has_function_privilege('service_role',
    'api.configuracao_sistema_privado(jsonb)', 'EXECUTE'),
  'operacao_devolve_opcoes', position('''opcoes''' in pg_get_functiondef(
    'operacao.configuracao_sistema_operacao_privada(jsonb)'::regprocedure)) > 0,
  'catalogo_total', (select count(*) from identidade.configuracao_sistema),
  'catalogo_fora_contrato', (select coalesce(jsonb_agg(chave order by chave), '[]')
    from identidade.configuracao_sistema c where
      chave !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
      or length(btrim(rotulo)) not between 1 and 160
      or (descricao is not null and length(btrim(descricao)) not between 1 and 600)
      or versao not between 1 and 2147483647
      or tipo not in ('booleano','texto','numero','lista')
      or exposicao not in ('administracao','servidor','publica')
      or case jsonb_typeof(valor)
        when 'string' then length(valor #>> '{}') > 600
        when 'boolean' then false
        when 'number' then false
        when 'array' then jsonb_array_length(valor) not between 1 and 50 or exists (
          select 1 from jsonb_array_elements(valor) v
          where jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) not between 1 and 200)
        else true end
      or case when opcoes is null then false when jsonb_typeof(opcoes) <> 'array' then true
        else jsonb_array_length(opcoes) not between 1 and 50 or exists (
          select 1 from jsonb_array_elements(opcoes) o
          where jsonb_typeof(o) <> 'string' or length(btrim(o #>> '{}')) not between 1 and 200)
        end),
  'ultima_migration', (select max(version) from supabase_migrations.schema_migrations)
) as diagnostico;


-- Complemento somente leitura: não devolve valores, datas, IDs pessoais ou definição de função.
-- A interna é SECURITY INVOKER, criada pelo migrador, sem row_security próprio nas
-- migrations 17410000/19110000. Apenas a wrapper é SECURITY DEFINER, owner dedicado,
-- row_security=on. Portanto owner_esperado/restrito e row_security_on falsos na interna
-- não demonstram desvio. Seu EXECUTE relevante é o do owner da wrapper, não authenticated.
-- Número acima do limite é suspeita de representação JS; isto não executa o parser Zod.
-- Metadados limpos não provam projeção/envelope reais, RLS funcional, sessão ou causa do 503.
with suspeitas as (
  select chave
  from identidade.configuracao_sistema
  where atualizado_em is null
     or not isfinite(atualizado_em)
     or extract(year from atualizado_em) not between 1 and 9999
     or case when jsonb_typeof(valor) = 'number'
          then abs((valor #>> '{}')::numeric)
               > 1.7976931348623157e308::numeric
          else false end
),
funcoes as (
  select p.oid, p.proowner, p.prosecdef, p.proconfig,
    r.rolname, r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolinherit
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  where p.oid in (
    to_regprocedure('api.configuracao_sistema_privado(jsonb)'),
    to_regprocedure('operacao.configuracao_sistema_operacao_privada(jsonb)')
  )
)
select jsonb_build_object(
  'chaves_carimbo_numero_suspeitas',
    (select coalesce(jsonb_agg(chave order by chave), '[]'::jsonb) from suspeitas),
  'funcoes',
    (select coalesce(jsonb_object_agg(
      oid::regprocedure::text,
      jsonb_build_object(
        'owner_esperado', rolname = 'ffcmapp_configuracao_sistema_owner',
        'owner_restrito', not rolcanlogin and not rolsuper and not rolbypassrls and not rolinherit,
        'security_definer', prosecdef,
        'search_path_vazio', 'search_path=""' = any(coalesce(proconfig, '{}'::text[])),
        'row_security_on', 'row_security=on' = any(coalesce(proconfig, '{}'::text[])),
        'owner_configuracao_executa',
          has_function_privilege('ffcmapp_configuracao_sistema_owner', oid, 'EXECUTE'),
        'authenticated_executa', has_function_privilege('authenticated', oid, 'EXECUTE'),
        'anon_executa', has_function_privilege('anon', oid, 'EXECUTE'),
        'service_role_executa', has_function_privilege('service_role', oid, 'EXECUTE')
      )
    ), '{}'::jsonb) from funcoes)
) as diagnostico_complementar;
