-- Fixtures fictícias e claims simulados; não comprovam JWT, HTTP ou políticas de RPC.
begin;

insert into auth.users (id) values
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002');
insert into public.usuario (id, perfil) values
  ('91000000-0000-4000-8000-000000000001', 'administrador'),
  ('91000000-0000-4000-8000-000000000002', 'profissional');

do $bloco$
declare
  v_admin constant uuid := '91000000-0000-4000-8000-000000000001';
  v_profissional constant uuid := '91000000-0000-4000-8000-000000000002';
  v_paciente constant uuid := '92000000-0000-4000-8000-000000000001';
  v_outro_paciente constant uuid := '92000000-0000-4000-8000-000000000002';
  v_concessao constant uuid := '93000000-0000-4000-8000-000000000001';
  v_concessao_admin constant uuid := '93000000-0000-4000-8000-000000000002';
  v_sessao constant uuid := '94000000-0000-4000-8000-000000000001';
  v_sessao_admin constant uuid := '94000000-0000-4000-8000-000000000003';
  v_acesso constant uuid := '95000000-0000-4000-8000-000000000001';
  v_envelope constant jsonb := '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2U","ciphertext":"Y2lwaGVy","tag":"dGFn"}';
begin
  insert into cadastro.paciente (id, nome_cifrado, criado_por_usuario_id)
  values (v_paciente, v_envelope, v_admin), (v_outro_paciente, v_envelope, v_admin);
  insert into identidade.concessao_equipe (
    id, email_cifrado, email_hmac, perfil, metodo, estado, usuario_id,
    subject_google, vinculada_em, criado_por_usuario_id, motivo_cifrado
  ) values (
    v_concessao, v_envelope, 'hmac-ficticio-s02', 'profissional',
    'google_workspace', 'vinculada', v_profissional, 'subject-ficticio-s02',
    clock_timestamp(), v_admin, v_envelope
  );
  insert into identidade.sessao (session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo)
  values (v_sessao, v_profissional, v_concessao, 1, 'google_workspace');
  insert into identidade.concessao_equipe (
    id, email_cifrado, email_hmac, perfil, metodo, estado, usuario_id,
    subject_google, vinculada_em, criado_por_usuario_id, motivo_cifrado
  ) values (
    v_concessao_admin, v_envelope, 'hmac-ficticio-admin-s02', 'administrador',
    'google_workspace', 'vinculada', v_admin, 'subject-ficticio-admin-s02',
    clock_timestamp(), v_admin, v_envelope
  );
  insert into identidade.sessao (session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo)
  values (v_sessao_admin, v_admin, v_concessao_admin, 1, 'google_workspace');
  insert into cadastro.acesso_paciente (id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado)
  values (v_acesso, v_paciente, v_profissional, v_admin, v_envelope);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'session_id', v_sessao_admin)::text, true);
  if not identidade.sessao_atual_valida() or not cadastro.possui_acesso_paciente(v_paciente)
    or not cadastro.possui_acesso_paciente(v_outro_paciente) then
    raise exception 'FALHA: administrador ativo perdeu acesso à carteira';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profissional, 'session_id', v_sessao)::text, true);
  if not identidade.sessao_atual_valida() or not cadastro.possui_acesso_paciente(v_paciente)
    or cadastro.possui_acesso_paciente(v_outro_paciente) then
    raise exception 'FALHA: sessão ou vínculo de paciente incorreto';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profissional, 'session_id', 'identificador-invalido')::text, true);
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: identificador de sessão inválido obteve acesso';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'identificador-invalido', 'session_id', v_sessao)::text, true);
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: identificador de usuário inválido obteve acesso';
  end if;

  -- auth.uid() prioriza o claim individual e, em seguida, o JSON claims.
  perform set_config('request.jwt.claim.sub', 'identificador-invalido', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profissional, 'session_id', v_sessao)::text, true);
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: claim individual inválido obteve acesso';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', jsonb_build_object('sub', v_profissional, 'session_id', v_sessao)::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'identificador-invalido', 'session_id', v_sessao)::text, true);
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: fontes divergentes aceitaram usuário inválido';
  end if;
  perform set_config('request.jwt.claim', '', true);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profissional, 'session_id', v_sessao_admin)::text, true);
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: sessão de outro usuário foi aceita';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profissional)::text, true);
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: sessão ausente foi aceita';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profissional, 'session_id', '94000000-0000-4000-8000-000000000002')::text, true);
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: sessão não admitida obteve acesso';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_profissional, 'session_id', v_sessao)::text, true);

  update identidade.concessao_equipe set estado = 'revogada', revogada_em = clock_timestamp(),
    revogada_por_usuario_id = v_admin, motivo_revogacao_cifrado = v_envelope where id = v_concessao;
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: concessão revogada mantém acesso';
  end if;
  update identidade.concessao_equipe set estado = 'vinculada', revogada_em = null,
    revogada_por_usuario_id = null, motivo_revogacao_cifrado = null where id = v_concessao;

  update cadastro.acesso_paciente set revogada_em = clock_timestamp(), revogado_por_usuario_id = v_admin,
    motivo_revogacao_cifrado = v_envelope where id = v_acesso;
  if cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: vínculo revogado mantém acesso';
  end if;

  update public.usuario set ativo = false where id = v_profissional;
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: usuário inativo mantém acesso';
  end if;
  update public.usuario set ativo = true where id = v_profissional;
  update identidade.sessao set revogada_em = clock_timestamp(), revogada_por_usuario_id = v_admin,
    motivo_revogacao_cifrado = v_envelope where session_id = v_sessao;
  if identidade.sessao_atual_valida() or cadastro.possui_acesso_paciente(v_paciente) then
    raise exception 'FALHA: sessão revogada mantém acesso';
  end if;
end
$bloco$;

rollback;
