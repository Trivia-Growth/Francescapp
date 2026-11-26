-- pg_cron é nativo; ausência/limite da extensão bloqueia aplicação, nunca substitui job.
create extension if not exists pg_cron;
do $$ begin
 if not has_schema_privilege(current_user, 'operacao', 'USAGE')
   or not has_function_privilege(current_user, 'operacao.expurgar_audio_abandonado()', 'EXECUTE') then
  raise exception 'USUARIO_CRON_SEM_PERMISSAO_EXPURGO';
 end if;
end $$;
-- O usuário de migração agenda a função privada. Nenhum login da aplicação recebe EXECUTE.
select cron.schedule('ffcm-audio-abandonado', '*/15 * * * *',
  'select operacao.expurgar_audio_abandonado()');
