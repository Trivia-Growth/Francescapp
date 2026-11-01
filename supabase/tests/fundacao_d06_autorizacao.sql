-- Fundação FFCMApp — testes de grants e RLS da tarefa 2.2 / D-06.
-- Este arquivo não cria dados. Com psql, execute com -v ON_ERROR_STOP=1.

begin;

-- Criação transitória pelo mesmo owner do teste: detecta EXECUTE herdado de
-- PUBLIC mesmo antes de um schema receber USAGE de roles públicas.
create function identidade.teste_default_execute_s02()
returns boolean language sql as $$ select true $$;

do $bloco$
declare
  v_tabela regclass;
  v_schema text;
begin
  if has_function_privilege('anon', 'identidade.teste_default_execute_s02()'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'identidade.teste_default_execute_s02()'::regprocedure, 'execute') then
    raise exception 'FALHA: EXECUTE padrão expõe função futura';
  end if;

  foreach v_tabela in array array[
    'public.usuario'::regclass,
    'identidade.concessao_equipe'::regclass,
    'identidade.excecao_tecnica'::regclass,
    'identidade.desafio_login'::regclass,
    'identidade.sessao'::regclass,
    'cadastro.paciente'::regclass,
    'cadastro.contato_paciente'::regclass,
    'cadastro.pessoa_relacionada'::regclass,
    'cadastro.relacao_paciente'::regclass,
    'cadastro.acesso_paciente'::regclass,
    'auditoria.evento'::regclass,
    'operacao.requisicao'::regclass,
    'operacao.lote_teste'::regclass
  ] loop
    if not (select relrowsecurity from pg_class where oid = v_tabela) then
      raise exception 'FALHA: RLS não está habilitada em %', v_tabela;
    end if;

    if has_table_privilege('anon', v_tabela, 'select,insert,update,delete')
      or has_table_privilege('authenticated', v_tabela, 'select,insert,update,delete') then
      raise exception 'FALHA: role pública possui acesso direto a %', v_tabela;
    end if;
  end loop;

  foreach v_schema in array array['identidade', 'cadastro', 'auditoria', 'operacao'] loop
    if has_schema_privilege('anon', v_schema, 'usage,create')
      or has_schema_privilege('authenticated', v_schema, 'usage,create') then
      raise exception 'FALHA: role pública possui acesso ao schema interno %', v_schema;
    end if;
  end loop;

  if not exists (select 1 from pg_namespace where nspname = 'api') then
    raise exception 'FALHA: schema api restrito não foi criado';
  end if;

  if has_schema_privilege('anon', 'api', 'usage,create')
    or has_schema_privilege('authenticated', 'api', 'usage,create') then
    raise exception 'FALHA: schema api está exposto antes de RPCs autorizadas';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('identidade', 'cadastro', 'auditoria', 'operacao')
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
  ) then
    raise exception 'FALHA: função interna executável por role pública';
  end if;

  if (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('identidade', 'sessao_atual_valida'),
      ('cadastro', 'possui_acesso_paciente')
    )
      and p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=pg_catalog%'
  ) <> 2 then
    raise exception 'FALHA: helpers internos não têm SECURITY DEFINER e search_path fixo';
  end if;

  if exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(coalesce(d.defaclacl, acldefault(d.defaclobjtype, d.defaclrole))) a
    where n.nspname in ('api', 'identidade', 'cadastro', 'auditoria', 'operacao')
      and d.defaclobjtype in ('r', 'S', 'f')
      and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)
      and a.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'USAGE', 'EXECUTE')
  ) then
    raise exception 'FALHA: default privilege futuro expõe objeto da aplicação';
  end if;
end
$bloco$;

rollback;
