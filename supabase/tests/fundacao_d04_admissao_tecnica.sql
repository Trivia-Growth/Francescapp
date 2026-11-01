-- Somente banco isolado, após os rascunhos D-04; nenhuma prova de Auth/Vault.
begin;
insert into auth.users (id) values ('41000000-0000-4000-8000-000000000001');
insert into public.usuario (id, perfil) values ('41000000-0000-4000-8000-000000000001', 'administrador');
insert into identidade.concessao_equipe (id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('42000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-tecnica','administrador','google_workspace','vinculada','41000000-0000-4000-8000-000000000001','fixture-tecnica','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica (usuario_id,concessao_id,motivo_cifrado) values ('41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare entrada jsonb := '{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000001","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000001","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; saida jsonb;
begin
  saida := identidade.admitir_sessao_tecnica(entrada);
  if saida->>'ok' <> 'true' or saida->'dados'->>'perfil' <> 'administrador' then raise exception 'admissão válida negada'; end if;
  if not exists (select 1 from identidade.credencial_sessao where session_id = '43000000-0000-4000-8000-000000000001' and estado='disponivel') then raise exception 'credencial ausente'; end if;
  if not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000001' and resultado='permitido') then raise exception 'auditoria ausente'; end if;
end $$;
-- A validade da autoridade é reavaliada, mesmo com exceção previamente criada.
savepoint antes_revogacao;
do $$
declare entrada jsonb := '{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000004","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000005","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; saida jsonb;
begin
  update identidade.sessao set revogada_em=clock_timestamp(),
    revogada_por_usuario_id='41000000-0000-4000-8000-000000000001',
    motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
    where session_id='43000000-0000-4000-8000-000000000001';
  update public.usuario set ativo=false where id='41000000-0000-4000-8000-000000000001';
  saida := identidade.admitir_sessao_tecnica(entrada);
  if saida->>'ok' <> 'false' or exists (select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000004') then raise exception 'usuário inativo admitido'; end if;
  if not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000005' and resultado='negado') then raise exception 'negação de usuário inativo não auditada'; end if;
  update public.usuario set ativo=true where id='41000000-0000-4000-8000-000000000001';
  entrada := jsonb_set(entrada,'{identidade,session_id}',to_jsonb('43000000-0000-4000-8000-000000000001'::text));
  entrada := jsonb_set(entrada,'{request_id}',to_jsonb('44000000-0000-4000-8000-000000000006'::text));
  saida := identidade.admitir_sessao_tecnica(entrada);
  if saida->>'ok' <> 'false' or not exists (select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000001' and revogada_em is not null) then raise exception 'tombstone reaberto'; end if;
  if not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000006' and resultado='negado') then raise exception 'negação de tombstone não auditada'; end if;
  update identidade.concessao_equipe set estado='revogada', revogada_em=clock_timestamp(),
    revogada_por_usuario_id='41000000-0000-4000-8000-000000000001',
    motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
    where id='42000000-0000-4000-8000-000000000001';
  entrada := jsonb_set(entrada,'{identidade,session_id}',to_jsonb('43000000-0000-4000-8000-000000000005'::text));
  entrada := jsonb_set(entrada,'{request_id}',to_jsonb('44000000-0000-4000-8000-000000000007'::text));
  saida := identidade.admitir_sessao_tecnica(entrada);
  if saida->>'ok' <> 'false' or exists (select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000005') then raise exception 'concessão revogada admitida'; end if;
  if not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000007' and resultado='negado') then raise exception 'negação de concessão revogada não auditada'; end if;
end $$;
rollback to savepoint antes_revogacao;
insert into auth.users(id) values ('41000000-0000-4000-8000-000000000003');
insert into public.usuario(id,perfil) values ('41000000-0000-4000-8000-000000000003','profissional');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
values ('42000000-0000-4000-8000-000000000003','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','fixture-tecnica-outra','profissional','google_workspace','vinculada','41000000-0000-4000-8000-000000000003','fixture-tecnica-outra','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado) values ('41000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000003','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
declare entrada jsonb := '{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000003","session_id":"43000000-0000-4000-8000-000000000001","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000008","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"alterado","tag":"t"}}'; saida jsonb;
begin
  saida := identidade.admitir_sessao_tecnica(entrada);
  if saida->>'ok' <> 'false' then raise exception 'replay entre usuários admitido'; end if;
  if not exists (select 1 from identidade.sessao s join identidade.credencial_sessao c using (session_id) where s.session_id='43000000-0000-4000-8000-000000000001' and s.usuario_id='41000000-0000-4000-8000-000000000001' and c.envelope->>'ciphertext'='c') then raise exception 'replay alterou sessão ou credencial'; end if;
  if not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000008' and resultado='negado') then raise exception 'replay entre usuários não auditado'; end if;
end $$;
do $$
declare entrada jsonb := '{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000001","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000002","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}'; saida jsonb;
begin
  -- Mesmo session_id jamais substitui a credencial anterior.
  saida := identidade.admitir_sessao_tecnica(entrada);
  if saida->>'ok' <> 'false' then raise exception 'replay admitido'; end if;
  if not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000002' and resultado='negado') then raise exception 'negativa não auditada'; end if;
  entrada := jsonb_set(entrada,'{identidade,usuario_id}',to_jsonb('41000000-0000-4000-8000-000000000002'::text));
  entrada := jsonb_set(entrada,'{identidade,session_id}',to_jsonb('43000000-0000-4000-8000-000000000002'::text));
  entrada := jsonb_set(entrada,'{request_id}',to_jsonb('44000000-0000-4000-8000-000000000003'::text));
  saida := identidade.admitir_sessao_tecnica(entrada);
  if saida->>'ok' <> 'false' or exists (select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000002') then raise exception 'outra identidade admitida'; end if;
  if not exists (select 1 from auditoria.evento where request_id='44000000-0000-4000-8000-000000000003' and resultado='negado') then raise exception 'negativa de outra identidade não auditada'; end if;
  if has_function_privilege('anon','identidade.admitir_sessao_tecnica(jsonb)','execute') or has_function_privilege('authenticated','identidade.admitir_sessao_tecnica(jsonb)','execute') then raise exception 'admissão exposta'; end if;
end $$;
-- Falha de auditoria reverte a sessão e a credencial, mesmo se o chamador captura erro.
create function pg_temp.rejeitar_evento() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$;
create trigger teste_auditoria before insert on auditoria.evento for each row execute function pg_temp.rejeitar_evento();
do $$
declare entrada jsonb := '{"identidade":{"usuario_id":"41000000-0000-4000-8000-000000000001","session_id":"43000000-0000-4000-8000-000000000003","metodo":"tecnica"},"request_id":"44000000-0000-4000-8000-000000000004","credencial_refresh":{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}}';
begin
  begin
    perform identidade.admitir_sessao_tecnica(entrada);
    raise exception 'falha de auditoria ignorada';
  exception when raise_exception then
    if sqlerrm <> 'falha simulada' then raise; end if;
  end;
  if exists (select 1 from identidade.sessao where session_id='43000000-0000-4000-8000-000000000003') then raise exception 'sessão sobreviveu falha de auditoria'; end if;
  if exists (select 1 from identidade.credencial_sessao where session_id='43000000-0000-4000-8000-000000000003') then raise exception 'credencial sobreviveu falha de auditoria'; end if;
end $$;
rollback;
