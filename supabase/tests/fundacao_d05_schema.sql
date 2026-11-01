-- Fundação FFCMApp — testes locais da tarefa 2.1 / D-05.
-- Executar após aplicar as migrações em banco local Supabase. Com psql, passe
-- -v ON_ERROR_STOP=1; a API de consulta remota não interpreta metacomandos.
-- Todos os IDs e envelopes abaixo são sintéticos; não são contas, nomes ou
-- segredos reais.

begin;

do $bloco$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.usuario'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'a'
  ) then
    raise exception 'FALHA: usuario deve referenciar auth.users sem cascade';
  end if;

  if exists (
    select 1
    from pg_constraint
    where confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
      and conrelid in (
        'public.usuario'::regclass,
        'identidade.concessao_equipe'::regclass,
        'identidade.excecao_tecnica'::regclass
      )
  ) then
    raise exception 'FALHA: uma FK de Auth usa cascade';
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and (
        pg_get_triggerdef(t.oid) ilike '%public.usuario%'
        or pg_get_functiondef(p.oid) ilike '%public.usuario%'
        or pg_get_triggerdef(t.oid) ilike '%identidade.concessao_equipe%'
        or pg_get_functiondef(p.oid) ilike '%identidade.concessao_equipe%'
      )
  ) then
    raise exception 'FALHA: trigger de auth.users promove/cria acesso local';
  end if;
end
$bloco$;

-- Identidades Auth fictícias pré-existentes. A migração apenas as referencia.
insert into auth.users (id)
values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');

insert into public.usuario (id, perfil)
values
  ('10000000-0000-4000-8000-000000000001', 'administrador'),
  ('10000000-0000-4000-8000-000000000002', 'profissional');

do $bloco$
begin
  begin
    insert into public.usuario (id, perfil)
    values ('10000000-0000-4000-8000-000000000003', 'administrador,profissional');
    raise exception 'FALHA: mais de um perfil em um usuário foi aceito';
  exception
    when check_violation then null;
  end;

  begin
    update public.usuario set versao = 0 where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'FALHA: versão zero foi aceita';
  exception
    when check_violation then null;
  end;

  if exists (select 1 from public.usuario where id = '10000000-0000-4000-8000-000000000003') then
    raise exception 'FALHA: novo Auth recebeu autopromoção';
  end if;
end
$bloco$;

insert into operacao.lote_teste (id, identificacao, responsavel_usuario_id)
values (
  '20000000-0000-4000-8000-000000000001',
  'lote-ficticio-d05',
  '10000000-0000-4000-8000-000000000001'
);

-- Mesmo envelope sintético representa homônimos deliberados: o ID, não o nome,
-- separa históricos. Nenhum dado pessoal aparece na fixture.
insert into cadastro.paciente (id, nome_cifrado, lote_teste_id, criado_por_usuario_id)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2Ux","ciphertext":"Y2lwaGVydGV4dDE","tag":"dGFnMQ"}',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2Uy","ciphertext":"Y2lwaGVydGV4dDE","tag":"dGFnMg"}',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );

do $bloco$
declare
  v_pessoa_id constant uuid := '40000000-0000-4000-8000-000000000001';
begin
  if not exists (
    select 1 from public.usuario
    where id = '10000000-0000-4000-8000-000000000001'
      and perfil = 'administrador'
      and ativo
  ) or exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuario'
      and column_name in ('lote_teste_id', 'descartavel', 'origem_teste')
  ) then
    raise exception 'FALHA: proveniência de teste alterou ou marcou o administrador válido';
  end if;

  if (select count(*) from cadastro.paciente where lote_teste_id = '20000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FALHA: homônimos não foram preservados por IDs distintos';
  end if;

  insert into cadastro.pessoa_relacionada (id, nome_cifrado, criado_por_usuario_id)
  values (
    v_pessoa_id,
    '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2Uz","ciphertext":"Y2lwaGVydGV4dDI","tag":"dGFnMw"}',
    '10000000-0000-4000-8000-000000000001'
  );
  insert into cadastro.relacao_paciente (id, paciente_id, pessoa_relacionada_id, descricao_relacao_cifrada)
  values (
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    v_pessoa_id,
    '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2U0","ciphertext":"Y2lwaGVydGV4dDM","tag":"dGFnNA"}'
  );

  if exists (select 1 from auth.users where id = v_pessoa_id) then
    raise exception 'FALHA: relação pessoal criou conta Auth';
  end if;

  begin
    insert into cadastro.paciente (id, nome_cifrado, criado_por_usuario_id)
    values (
      '30000000-0000-4000-8000-000000000003',
      '"texto-em-claro"'::jsonb,
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'FALHA: campo protegido aceitou texto em claro';
  exception
    when check_violation then null;
  end;
end
$bloco$;

insert into identidade.concessao_equipe (
  id, email_cifrado, email_hmac, perfil, metodo, estado, criado_por_usuario_id, motivo_cifrado
)
values (
  '50000000-0000-4000-8000-000000000001',
  '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2U1","ciphertext":"Y2lwaGVydGV4dDQ","tag":"dGFnNQ"}',
  'aG1hYy1maWN0aWNpby0x',
  'profissional',
  'google_workspace',
  'pendente',
  '10000000-0000-4000-8000-000000000001',
  '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2U2","ciphertext":"Y2lwaGVydGV4dDU","tag":"dGFnNg"}'
);

do $bloco$
begin
  begin
    insert into identidade.concessao_equipe (
      id, email_cifrado, email_hmac, perfil, metodo, estado, criado_por_usuario_id, motivo_cifrado
    ) values (
      '50000000-0000-4000-8000-000000000002',
      '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2U3","ciphertext":"Y2lwaGVydGV4dDY","tag":"dGFnNw"}',
      'aG1hYy1maWN0aWNpby0x',
      'profissional',
      'google_workspace',
      'pendente',
      '10000000-0000-4000-8000-000000000001',
      '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2U4","ciphertext":"Y2lwaGVydGV4dDc","tag":"dGFnOA"}'
    );
    raise exception 'FALHA: concessão ativa duplicada foi aceita';
  exception
    when unique_violation then null;
  end;

  insert into cadastro.acesso_paciente (
    id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado
  ) values (
    '60000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2U5","ciphertext":"Y2lwaGVydGV4dDg","tag":"dGFnOQ"}'
  );
  begin
    insert into cadastro.acesso_paciente (
      id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado
    ) values (
      '60000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '{"formato":1,"key_id":"teste-v1","nonce":"bm9uY2UxMA","ciphertext":"Y2lwaGVydGV4dDk","tag":"dGFnMTA"}'
    );
    raise exception 'FALHA: vínculo ativo duplicado foi aceito';
  exception
    when unique_violation then null;
  end;

  if not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA: identidade Auth fictícia pré-existente não foi preservada';
  end if;
end
$bloco$;

rollback;
