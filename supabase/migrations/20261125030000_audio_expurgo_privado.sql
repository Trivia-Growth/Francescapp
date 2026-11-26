-- FR-010/6.1: expurgo independente da abertura da tela, sem ler conteúdo clínico.
select set_config('ffcmapp.audio_expurgo_migrador', current_user, false);
grant usage on schema operacao to current_user;
insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,descricao,exposicao)
 values(gen_random_uuid(),'ffcm.transcricao.expurgo_ativo','false'::jsonb,'booleano',
 'Expurgo de áudios abandonados','Habilita descarte de áudios abandonados vencidos após 30 dias. Ative somente após conferir os dados e autorizar a limpeza.','servidor');
create role ffcmapp_audio_expurgo_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_audio_expurgo_owner to current_user with inherit false, set true;
grant usage on schema cadastro, operacao, auditoria to ffcmapp_audio_expurgo_owner;
grant usage on schema identidade to ffcmapp_audio_expurgo_owner;
grant select(chave,valor) on identidade.configuracao_sistema to ffcmapp_audio_expurgo_owner;
create policy audio_expurgo_configuracao on identidade.configuracao_sistema for select to ffcmapp_audio_expurgo_owner
 using(chave='ffcm.transcricao.expurgo_ativo');
grant execute on function cadastro.envelope_audio_valido(jsonb), cadastro.envelope_texto_valido(jsonb) to ffcmapp_audio_expurgo_owner;
alter table cadastro.audio_transcricao add column exclusao_por_expiracao boolean not null default false;
alter table cadastro.audio_transcricao drop constraint audio_transcricao_exclusao_depois_revisao_chk;
alter table cadastro.audio_transcricao add constraint audio_transcricao_exclusao_depois_revisao_chk check (
  exclusao_estado = 'nao_solicitada' or revisao_confirmada_em is not null or
  (exclusao_por_expiracao and exclusao_estado = 'confirmada' and exclusao_em >= expira_em)
);
-- Só o job recebe escrita no marcador; o owner da API não pode forjar expiração.
grant select (id, expira_em, audio_cifrado, revisao_confirmada_em, exclusao_estado) on cadastro.audio_transcricao to ffcmapp_audio_expurgo_owner;
grant update (audio_cifrado, exclusao_estado, exclusao_em, exclusao_por_expiracao) on cadastro.audio_transcricao to ffcmapp_audio_expurgo_owner;
create policy audio_expurgo_ler on cadastro.audio_transcricao for select to ffcmapp_audio_expurgo_owner
 using (expira_em <= statement_timestamp() and revisao_confirmada_em is null);
create policy audio_expurgo_atualizar on cadastro.audio_transcricao for update to ffcmapp_audio_expurgo_owner
 using (expira_em <= statement_timestamp() and revisao_confirmada_em is null and audio_cifrado is not null)
 with check (exclusao_por_expiracao and exclusao_estado = 'confirmada' and audio_cifrado is null and revisao_confirmada_em is null);
grant insert (id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_audio_expurgo_owner;
create policy audio_expurgo_auditoria on auditoria.evento for insert to ffcmapp_audio_expurgo_owner
 with check (operador_restrito = 'pg_cron.audio_expurgo' and ator_usuario_id is null and ator_auth_id is null
  and acao = 'audio_expirado' and tipo_objeto = 'audio_transcricao' and resultado = 'permitido');
-- Recibo operacional sem dados de paciente. Falha por linha preserva áudio e marca pendência.
create table operacao.audio_expurgo_execucao (
 id uuid primary key, executado_em timestamptz not null default clock_timestamp(),
 apagados integer not null check (apagados >= 0), falhas integer not null check (falhas >= 0)
);
alter table operacao.audio_expurgo_execucao enable row level security;
revoke all on operacao.audio_expurgo_execucao from public, anon, authenticated, service_role;
grant insert on operacao.audio_expurgo_execucao to ffcmapp_audio_expurgo_owner;
create policy audio_expurgo_recibo on operacao.audio_expurgo_execucao for insert to ffcmapp_audio_expurgo_owner with check (true);
grant create on schema operacao to ffcmapp_audio_expurgo_owner;
set role ffcmapp_audio_expurgo_owner;
create function operacao.expurgar_audio_abandonado() returns void
language plpgsql security definer set search_path = '' as $$
declare registro record; apagados integer := 0; falhas integer := 0;
begin
 if not exists(select 1 from identidade.configuracao_sistema where chave='ffcm.transcricao.expurgo_ativo' and valor='true'::jsonb) then return; end if;
 for registro in select id from cadastro.audio_transcricao
   where expira_em <= statement_timestamp() and revisao_confirmada_em is null and audio_cifrado is not null
   order by expira_em limit 500 for update skip locked
 loop
  begin
   update cadastro.audio_transcricao set audio_cifrado = null, exclusao_estado = 'confirmada',
     exclusao_em = clock_timestamp(), exclusao_por_expiracao = true where id = registro.id;
   insert into auditoria.evento(id, operador_restrito, acao, tipo_objeto, objeto_id, resultado, request_id)
     values(gen_random_uuid(), 'pg_cron.audio_expurgo', 'audio_expirado', 'audio_transcricao', registro.id, 'permitido', gen_random_uuid());
   apagados := apagados + 1;
  exception when others then
   -- Subtransação desfaz também o UPDATE se auditoria falhar. Sem conteúdo/erro bruto no log.
   falhas := falhas + 1;
  end;
 end loop;
 insert into operacao.audio_expurgo_execucao(id, apagados, falhas) values(gen_random_uuid(), apagados, falhas);
end $$;
revoke all on function operacao.expurgar_audio_abandonado() from public, anon, authenticated, service_role;
-- pg_cron executa como quem agenda. Permissão direta e estreita sobrevive à
-- retirada da membership temporária; nenhum papel da aplicação recebe EXECUTE.
do $$ begin
 execute format('grant execute on function operacao.expurgar_audio_abandonado() to %I', current_setting('ffcmapp.audio_expurgo_migrador'));
end $$;
reset role;
revoke create on schema operacao from ffcmapp_audio_expurgo_owner;
revoke ffcmapp_audio_expurgo_owner from current_user;
