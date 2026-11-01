-- D-04: rascunho ainda não aprovado, fora da sequência de migrações.
-- Rodar somente após aplicar o rascunho em banco isolado de teste.
-- Não prova o runtime real, concorrência ou a integração Auth/Vault.
begin;
do $$
begin
  if has_table_privilege('anon', 'identidade.credencial_sessao', 'select')
     or has_table_privilege('authenticated', 'identidade.credencial_sessao', 'select') then
    raise exception 'credencial exposta';
  end if;
  if has_function_privilege('anon', 'identidade.iniciar_renovacao(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'identidade.iniciar_renovacao(uuid,uuid)', 'execute') then
    raise exception 'renovação exposta';
  end if;
end $$;
insert into auth.users (id) values ('10000000-0000-4000-8000-000000000001');
insert into public.usuario (id, perfil) values ('10000000-0000-4000-8000-000000000001', 'administrador');
insert into auth.users (id) values ('10000000-0000-4000-8000-000000000002');
insert into public.usuario (id, perfil) values ('10000000-0000-4000-8000-000000000002', 'administrador');
insert into identidade.concessao_equipe (id, email_cifrado, email_hmac, perfil, metodo, estado, usuario_id, subject_google, motivo_cifrado, vinculada_em)
values ('20000000-0000-4000-8000-000000000001', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}', 'ficticio', 'administrador', 'google_workspace', 'vinculada', '10000000-0000-4000-8000-000000000001', 'ficticio', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}', clock_timestamp());
insert into identidade.concessao_equipe (id, email_cifrado, email_hmac, perfil, metodo, estado, motivo_cifrado)
values
  ('20000000-0000-4000-8000-000000000002', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}', 'pendente-vincular', 'administrador', 'google_workspace', 'pendente', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'),
  ('20000000-0000-4000-8000-000000000003', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}', 'pendente-revogar', 'administrador', 'google_workspace', 'pendente', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
do $$
begin
  update identidade.concessao_equipe set estado = 'vinculada',
    usuario_id = '10000000-0000-4000-8000-000000000002', subject_google = 'vinculo-ficticio',
    vinculada_em = clock_timestamp() where id = '20000000-0000-4000-8000-000000000002';
  if not found then raise exception 'concessão pendente não vinculada'; end if;
  update identidade.concessao_equipe set estado = 'revogada', revogada_em = clock_timestamp(),
    revogada_por_usuario_id = '10000000-0000-4000-8000-000000000001',
    motivo_revogacao_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
    where id = '20000000-0000-4000-8000-000000000003';
  if not found then raise exception 'concessão pendente não revogada'; end if;
end $$;
insert into identidade.sessao (session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'google_workspace');
insert into identidade.credencial_sessao (session_id, estado, envelope)
values ('30000000-0000-4000-8000-000000000001', 'disponivel', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"session_id":"30000000-0000-4000-8000-000000000001"}', true);
-- Sem RPC autorizada com motivo e auditoria, uma alteração direta não pode
-- deixar sessão ativa recuperável após reativação.
do $$
begin
  begin
    update public.usuario set ativo = false where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'desativação sem revogação aceita';
  exception when check_violation then null;
  end;
  begin
    update identidade.concessao_equipe set estado = 'revogada', revogada_em = clock_timestamp(),
      revogada_por_usuario_id = '10000000-0000-4000-8000-000000000001',
      motivo_revogacao_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
      where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'revogação de concessão sem revogação das sessões aceita';
  exception when check_violation then null;
  end;
  if not identidade.sessao_atual_valida() then raise exception 'sessão alterada após desativação recusada'; end if;
end $$;
do $$
declare g bigint;
begin
  if not identidade.sessao_atual_valida() then raise exception 'sessão inicial negada'; end if;
  select r.geracao into g from identidade.iniciar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001') r;
  if g is distinct from 1 or identidade.sessao_atual_valida() then raise exception 'início não fechou sessão'; end if;
  if exists (select 1 from identidade.iniciar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')) then raise exception 'troca simultânea admitida'; end if;
  if identidade.finalizar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 0, '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}') then raise exception 'geração antiga admitida'; end if;
  if identidade.finalizar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', g, '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}') then raise exception 'outro usuário admitido'; end if;
  if not identidade.finalizar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', g, '{"formato":1,"key_id":"teste","nonce":"novo","ciphertext":"c","tag":"t"}') then raise exception 'renovação válida negada'; end if;
end $$;
-- Mudanças de autoridade anteriores à finalização devem ser observadas novamente.
do $$
declare g bigint;
begin
  select r.geracao into g from identidade.iniciar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001') r;
  if g is distinct from 2 then raise exception 'troca não iniciada'; end if;
  if not identidade.finalizar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', g, '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}') then raise exception 'renovação de fixture negada'; end if;
end $$;
do $$
declare g bigint;
begin
  if not identidade.sessao_atual_valida() then raise exception 'sessão renovada negada'; end if;
  select r.geracao into g from identidade.iniciar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001') r;
  if g is distinct from 3 then raise exception 'geração não avançou'; end if;
  if not identidade.invalidar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', g) then raise exception 'incerteza não registrada'; end if;
  if identidade.finalizar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', g, '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}') or identidade.sessao_atual_valida() then raise exception 'incerteza revertida'; end if;
end $$;
-- Simula a sequência interna da futura RPC, sem alegar autorização/auditoria.
-- A revogação persiste após reativar o usuário e não é sobrescrita pela troca.
do $$
begin
  perform 1 from identidade.concessao_equipe where id = '20000000-0000-4000-8000-000000000001' for update;
  perform 1 from public.usuario where id = '10000000-0000-4000-8000-000000000001' for update;
  update identidade.sessao set revogada_em = clock_timestamp(),
    revogada_por_usuario_id = '10000000-0000-4000-8000-000000000001',
    motivo_revogacao_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
    where session_id = '30000000-0000-4000-8000-000000000001';
  update public.usuario set ativo = false where id = '10000000-0000-4000-8000-000000000001';
  update public.usuario set ativo = true where id = '10000000-0000-4000-8000-000000000001';
  begin
    update identidade.sessao set revogada_em = null, revogada_por_usuario_id = null,
      motivo_revogacao_cifrado = null where session_id = '30000000-0000-4000-8000-000000000001';
    raise exception 'tombstone reaberto';
  exception when check_violation then null;
  end;
  begin
    delete from identidade.sessao where session_id = '30000000-0000-4000-8000-000000000001';
    raise exception 'tombstone removido';
  exception when check_violation then null;
  end;
  if identidade.sessao_atual_valida() or exists (
    select 1 from identidade.iniciar_renovacao('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')
  ) then raise exception 'reativação ressuscitou sessão revogada'; end if;
  update identidade.concessao_equipe set estado = 'revogada', revogada_em = clock_timestamp(),
    revogada_por_usuario_id = '10000000-0000-4000-8000-000000000001',
    motivo_revogacao_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
    where id = '20000000-0000-4000-8000-000000000001';
  begin
    update identidade.concessao_equipe set estado = 'vinculada', revogada_em = null,
      revogada_por_usuario_id = null, motivo_revogacao_cifrado = null
      where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'concessão revogada reaberta como vinculada';
  exception when check_violation then null;
  end;
  begin
    update identidade.concessao_equipe set estado = 'pendente', usuario_id = null,
      subject_google = null, vinculada_em = null, revogada_em = null,
      revogada_por_usuario_id = null, motivo_revogacao_cifrado = null
      where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'concessão revogada reaberta como pendente';
  exception when check_violation then null;
  end;
  begin
    update identidade.concessao_equipe set revogada_em = revogada_em + interval '1 second'
      where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'histórico de revogação alterado';
  exception when check_violation then null;
  end;
end $$;
rollback;
