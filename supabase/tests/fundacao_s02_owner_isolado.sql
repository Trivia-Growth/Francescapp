-- Experimento transacional de ownership; não provisiona identidade operacional.
-- Se a role ou a função já existirem, falha sem alterá-las.
begin;

create role ffcmapp_teste_owner_s02 nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_teste_owner_s02 to postgres with inherit false, set true;
grant usage, create on schema identidade to ffcmapp_teste_owner_s02;
set local role ffcmapp_teste_owner_s02;
alter default privileges revoke execute on functions from public;
create function identidade.teste_owner_s02() returns boolean language sql as $$ select true $$;
reset role;

do $bloco$
begin
  if has_function_privilege('anon', 'identidade.teste_owner_s02()'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'identidade.teste_owner_s02()'::regprocedure, 'execute') then
    raise exception 'FALHA: owner isolado permite EXECUTE por padrão';
  end if;
end
$bloco$;

rollback;
