-- Apenas banco e cluster descartáveis de fixture; não aplicar em runtime.
\set ON_ERROR_STOP on
do $$
declare socket_dir text := current_setting('unix_socket_directories');
begin
  if current_database() <> 'ffcm_admissao_teste_local'
    or inet_server_addr() is not null
    or socket_dir !~ '^/tmp/ffcm-admissao[.][A-Za-z0-9]+$'
    or current_setting('data_directory') <> socket_dir || '/data' then
    raise exception 'Cluster descartável obrigatório';
  end if;
end $$;
\ir ../drafts/20261031120000_desafio_google.sql
