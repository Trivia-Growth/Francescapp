-- Complemento apenas para cluster de integração isolado.
\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null or s !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$' or current_setting('data_directory')<>s||'/data' or current_setting('ffcm_fixture.token_servidor',true) is distinct from split_part(s,'/',3) then raise exception 'cluster descartável obrigatório'; end if;
end $$;
\ir ../drafts/20261031120000_desafio_google.sql
