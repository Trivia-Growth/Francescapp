\set ON_ERROR_STOP on
set session authorization audio_cron_fixture;
\ir audio_transcricao_operacoes_local.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261125030000_audio_expurgo_privado.sql
-- Fixtures fictícias isoladas. Trigger continua protegendo dados e prazos imutáveis.
insert into cadastro.audio_transcricao(id, paciente_id, audio_cifrado, mime, duracao_segundos,
 transcricao_cifrada, modelo, expira_em, criado_por_usuario_id)
select ('90000000-0000-4000-8000-00000000000' || n)::uuid,
 (select id from cadastro.paciente limit 1), jsonb_build_array(public.envelope_fixture('YQ')),
 'audio/webm', 7, public.envelope_fixture('dHh0'), 'ficticio',
 case when n = 1 then clock_timestamp() - interval '1 day' else clock_timestamp() + interval '1 day' end,
 (select id from public.usuario limit 1) from generate_series(1,2) n;
select operacao.expurgar_audio_abandonado();
do $$ begin
 if (select audio_cifrado is null from cadastro.audio_transcricao where id='90000000-0000-4000-8000-000000000001') then raise exception 'FLAG_FALSE_APAGOU'; end if;
end $$;
update identidade.configuracao_sistema set valor='true'::jsonb where chave='ffcm.transcricao.expurgo_ativo';
-- Mesmo usuário que agenda o cron, agora sem bypass superuser ou membership owner.
do $$ begin execute format('alter role %I nosuperuser', current_user); end $$;
do $$ begin
 if (select rolsuper from pg_roles where rolname=current_user)
   or pg_has_role(current_user,'ffcmapp_audio_expurgo_owner','MEMBER')
   or not has_function_privilege(current_user,'operacao.expurgar_audio_abandonado()','EXECUTE') then
  raise exception 'USUARIO_CRON_NAO_RESTRITO';
 end if;
end $$;
select operacao.expurgar_audio_abandonado();
reset session authorization;
do $$ declare papel text; begin
 if (select audio_cifrado is not null or exclusao_estado <> 'confirmada' or not exclusao_por_expiracao
 from cadastro.audio_transcricao where id='90000000-0000-4000-8000-000000000001') then raise exception 'EXPURGO_NAO_CONFIRMADO'; end if;
 if not exists(select 1 from auditoria.evento where objeto_id='90000000-0000-4000-8000-000000000001' and acao='audio_expirado') then raise exception 'AVISO_AUSENTE'; end if;
 if (select audio_cifrado is null from cadastro.audio_transcricao where id='90000000-0000-4000-8000-000000000002') then raise exception 'PRAZO_VIGENTE_APAGADO'; end if;
 foreach papel in array array['anon','authenticated','service_role','ffcmapp_audio_transcricao_owner'] loop
  if has_function_privilege(papel,'operacao.expurgar_audio_abandonado()','execute') or
   has_column_privilege(papel,'cadastro.audio_transcricao','exclusao_por_expiracao','update') then raise exception 'EXPURGO_ACESSO_INDEVIDO: %', papel; end if;
 end loop;
end $$;
-- Falha auditada não pode apagar silenciosamente o original.
create function public.recusar_aviso_expurgo_fixture() returns trigger language plpgsql as $$ begin
 if new.acao='audio_expirado' then raise exception 'FALHA_FICTICIA'; end if; return new; end $$;
create trigger recusar_aviso_expurgo_fixture before insert on auditoria.evento for each row execute function public.recusar_aviso_expurgo_fixture();
insert into cadastro.audio_transcricao(id, paciente_id, audio_cifrado, mime, duracao_segundos,
 transcricao_cifrada, modelo, expira_em, criado_por_usuario_id)
select '90000000-0000-4000-8000-000000000003', (select id from cadastro.paciente limit 1),
 jsonb_build_array(public.envelope_fixture('YQ')), 'audio/webm', 7,
 public.envelope_fixture('dHh0'), 'ficticio', clock_timestamp()-interval '1 day', (select id from public.usuario limit 1);
select operacao.expurgar_audio_abandonado();
do $$ begin
 if (select audio_cifrado is null from cadastro.audio_transcricao where id='90000000-0000-4000-8000-000000000003') then raise exception 'DESCARTE_SEM_AVISO'; end if;
 if not exists(select 1 from operacao.audio_expurgo_execucao where falhas > 0) then raise exception 'PENDENCIA_AUSENTE'; end if;
 raise notice 'AUDIO_EXPURGO_OK';
end $$;
