-- Impressão digital do esquema usada por scripts/ensaiar-esquema-producao-local.sh para provar
-- que a restauração local é igual a produção: funções (corpo, ACL, dono), policies, ACL de
-- tabelas e de colunas dos esquemas da aplicação. Uma linha, coluna "t".
select concat_ws('|',
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('api','operacao','identidade','cadastro','auditoria','auth_privado','bloqueios_auth','public')),
 (select count(*) from pg_policies where schemaname in ('public','api','operacao','identidade','cadastro','auditoria')),
 (select md5(string_agg(n.nspname||'.'||p.proname||md5(p.prosrc)||coalesce(p.proacl::text,'')||p.proowner::regrole::text||coalesce(p.proconfig::text,'')||p.prosecdef::text,',' order by p.oid::regprocedure::text))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('api','operacao','identidade','cadastro','auditoria','auth_privado','bloqueios_auth')),
 (select md5(string_agg(schemaname||tablename||policyname||permissive||cmd||coalesce(qual,'')||coalesce(with_check,'')||roles::text,',' order by schemaname,tablename,policyname))
   from pg_policies where schemaname in ('public','api','operacao','identidade','cadastro','auditoria')),
 (select md5(string_agg(c.oid::regclass::text||coalesce(c.relacl,acldefault('r',c.relowner))::text||c.relowner::regrole::text,',' order by c.oid::regclass::text))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('api','operacao','identidade','cadastro','auditoria','public') and c.relkind in ('r','v','p','S')),
 (select md5(string_agg(a.attrelid::regclass::text||a.attname||a.attacl::text,',' order by a.attrelid::regclass::text,a.attname))
   from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('api','operacao','identidade','cadastro','auditoria','public') and a.attacl is not null)
) t
