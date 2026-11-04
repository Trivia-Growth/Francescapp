\set ON_ERROR_STOP on
begin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auditoria;
\ir ../migrations/20261110170000_operador_tecnico.sql
create role operador_teste login;
create role outro_teste login;
grant usage on schema auditoria to operador_teste, outro_teste;
grant execute on function auditoria.operador_tecnico_atual() to operador_teste, outro_teste;
insert into auditoria.operador_tecnico(codigo,papel_oid,papel_nome,ativo)
values ('op_0123456789abcdef0123456789abcdef','operador_teste'::regrole::oid,'operador_teste',true);
do $$ begin
 begin insert into auditoria.operador_tecnico(codigo,papel_oid,papel_nome,ativo) values ('nome pessoal',0,'invalido',false); raise exception 'texto livre aceito'; exception when check_violation then null; end;
end $$;
set local session authorization operador_teste;
do $$ begin
 if auditoria.operador_tecnico_atual() <> 'op_0123456789abcdef0123456789abcdef' then raise exception 'identidade incorreta'; end if;
 begin perform * from auditoria.operador_tecnico; raise exception 'cadastro exposto'; exception when insufficient_privilege then null; end;
end $$;
reset session authorization;
set local session authorization outro_teste;
do $$ begin
 begin perform auditoria.operador_tecnico_atual(); raise exception 'outro login aceito'; exception when insufficient_privilege then null; end;
end $$;
reset session authorization;
update auditoria.operador_tecnico set ativo=false;
set local session authorization operador_teste;
do $$ begin
 begin perform auditoria.operador_tecnico_atual(); raise exception 'operador revogado aceito'; exception when insufficient_privilege then null; end;
end $$;
reset session authorization;
do $$ begin
 if has_table_privilege('anon','auditoria.operador_tecnico','select,insert,update,delete')
 or has_function_privilege('authenticated','auditoria.operador_tecnico_atual()','execute')
 or has_function_privilege('service_role','auditoria.operador_tecnico_atual()','execute') then raise exception 'privilégio indevido'; end if;
end $$;
rollback;
