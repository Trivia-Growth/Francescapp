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
