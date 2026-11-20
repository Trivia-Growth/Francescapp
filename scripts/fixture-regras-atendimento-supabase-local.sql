-- Fixture fictícia para a prova de ponta a ponta de `api.consultar_regras_atendimento`
-- contra o Supabase local (tarefas 0.2 e 2.3). Nenhum dado real: identificadores fixos,
-- e-mails @exemplo.invalido e chave de atestado de 32 bytes constantes.
--
-- Só cria o que a RPC exige: conta Auth, sessão Auth, usuário da aplicação, sessão da
-- aplicação e a chave de atestado no Vault. Não concede nada além do que as migrations já
-- concederam — em particular, não mexe na ACL de `api.consultar_regras_atendimento`, que
-- já foi aberta a `authenticated` pela migration 20261119330000.
do $$ begin
 if current_database() <> 'postgres' or inet_server_port() <> 5432 then
  raise exception 'ALVO_LOCAL_OBRIGATORIO';
 end if;
end $$;

-- Idempotente sem apagar: a trilha `auditoria.evento` é append-only e referencia o usuário.

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000f001', 'authenticated', 'authenticated',
  'prova.edge@exemplo.invalido', clock_timestamp(), clock_timestamp(), clock_timestamp(), '{}'::jsonb, '{}'::jsonb)
 on conflict (id) do nothing;

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values ('20000000-0000-4000-8000-00000000f001', '10000000-0000-4000-8000-00000000f001', clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '1 hour')
 on conflict (id) do update set not_after = excluded.not_after;

insert into public.usuario (id, perfil, ativo) values ('10000000-0000-4000-8000-00000000f001', 'profissional', true)
 on conflict (id) do update set ativo = true;

insert into identidade.sessao (session_id, usuario_id, metodo, admitida_em)
values ('20000000-0000-4000-8000-00000000f001', '10000000-0000-4000-8000-00000000f001', 'familia', clock_timestamp())
 on conflict (session_id) do update set revogada_em = null, revogada_por_usuario_id = null, motivo_revogacao_cifrado = null, encerrada_em = null;

-- Chave de atestado fictícia (32 bytes 0x07), igual à usada pelo roteiro em TypeScript.
delete from vault.secrets where name = 'ffcmapp.atestado.teste';
select case when true then (select vault.create_secret(encode(decode(repeat('07', 32), 'hex'), 'base64'), 'ffcmapp.atestado.teste')) end as segredo_criado;
-- A tabela de referências pertence a `ffcmapp_atestado_vault_owner` e nem o migrador escreve
-- nela por herança: é preciso assumir o papel, como as próprias migrations fazem. Isto é
-- caminho de FIXTURE, não caminho da aplicação — a RPC nunca escreve aqui.
do $$ declare migrador text := current_user; tinha boolean; begin
 tinha := pg_has_role(migrador, 'ffcmapp_atestado_vault_owner', 'SET');
 if not tinha then
  execute format('grant ffcmapp_atestado_vault_owner to %I with inherit false, set true granted by %I', migrador, migrador);
 end if;
 perform set_config('role', 'ffcmapp_atestado_vault_owner', true);
 insert into identidade.referencias_atestado_vault (referencia, ativa) values ('ffcmapp.atestado.teste', true)
  on conflict (referencia) do update set ativa = true;
 perform set_config('role', migrador, true);
 if not tinha then execute format('revoke ffcmapp_atestado_vault_owner from %I granted by %I', migrador, migrador); end if;
end $$;

-- Chave de exposição 'servidor' usada como negativa: não pode aparecer na resposta pública.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao)
values (gen_random_uuid(), 'ffcm.prova.interruptor_fixture', 'false'::jsonb, 'booleano',
  'Interruptor fictício da prova', 'Só existe para provar que exposicao=servidor não vaza.', 'servidor')
 on conflict (chave) do nothing;
