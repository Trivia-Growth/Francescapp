\set ON_ERROR_STOP on
do $$ declare s text:=current_setting('unix_socket_directories'); begin
 if current_database()<>'ffcm_admissao_teste_local' or inet_server_addr() is not null
 or s !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$' or current_setting('data_directory')<>s||'/data'
 then raise exception 'cluster descartável obrigatório'; end if;
end $$;
\ir ../drafts/20261104170000_google_vinculo_experimento.sql
