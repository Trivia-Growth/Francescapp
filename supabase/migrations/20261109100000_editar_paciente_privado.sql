-- Preparação privada local. Nenhum privilégio concedido à aplicação.
-- Preparação requer revisão independente e integração Auth real antes de liberação.
-- D-14 admite término de operação já autorizada após revogação externa Auth;
-- revogações locais exigem coordenação via bloqueios_auth.travar. Fixture não
-- comprova concorrência ou integração real com Supabase Auth.
alter table auditoria.evento add column motivo_cifrado jsonb;
alter table auditoria.evento add constraint evento_motivo_cifrado_formato_chk check (
 motivo_cifrado is null or (jsonb_typeof(motivo_cifrado) = 'object'
 and motivo_cifrado - array['formato','key_id','nonce','ciphertext','tag'] = '{}'::jsonb
 and motivo_cifrado->'formato' = '1'::jsonb
 and jsonb_typeof(motivo_cifrado->'key_id') = 'string' and length(motivo_cifrado->>'key_id') between 1 and 128
 and jsonb_typeof(motivo_cifrado->'nonce') = 'string' and motivo_cifrado->>'nonce' ~ '^[A-Za-z0-9_-]{16}$'
 and jsonb_typeof(motivo_cifrado->'tag') = 'string' and motivo_cifrado->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
 and jsonb_typeof(motivo_cifrado->'ciphertext') = 'string' and length(motivo_cifrado->>'ciphertext') between 1 and 32768
 and motivo_cifrado->>'ciphertext' ~ '^[A-Za-z0-9_-]+$') is true
);
create or replace function operacao.editar_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; reserva uuid; auditoria_id uuid; epoca bigint;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record;
 anterior operacao.requisicao; campo text; autorizado boolean:=false; repeticao boolean:=false; resultado jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','versao_esperada','auditoria_id','chave_idempotencia','digest_idempotencia','nome','nome_preferencia','data_nascimento','motivo','aad','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  epoca:=(e->>'versao_esperada')::bigint; auditoria_id:=(e->>'auditoria_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or auditoria_id is null or epoca is null or epoca<1 or epoca>=2147483647
  or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.editar_paciente'
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true' and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.subject_google into concessao,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil='administrador' for share;
   if found and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 -- A exceção individual depende da concessão, usuário e sessão ainda ativos.
 -- A ordem de bloqueios segue concessão, usuário, exceção e sessão.
 if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id into concessao from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.perfil='administrador' for share;
  if found then
   perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
   if found then
    perform 1 from identidade.excecao_tecnica x where x.usuario_id=ator and x.concessao_id=concessao for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.editar_paciente','paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'versao_esperada') is distinct from 'number' or coalesce(e->>'versao_esperada','') !~ '^[1-9][0-9]*$'
  or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
  or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
  or jsonb_typeof(e->'aad') is distinct from 'object' or (e->'aad') - array['nome','nome_preferencia','data_nascimento','motivo'] <> '{}'::jsonb
  or not e ? 'motivo' or not (e ? 'nome' or e ? 'nome_preferencia' or e ? 'data_nascimento') then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 foreach campo in array array['nome','nome_preferencia','data_nascimento','motivo'] loop
  if e ? campo and e->campo='null'::jsonb and campo in ('nome_preferencia','data_nascimento') then
   if e->'aad' ? campo then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
  elsif (e ? campo) is distinct from (e->'aad' ? campo) or (e ? campo and (
    e->'aad'->campo is distinct from jsonb_build_object('tabela',case when campo='motivo' then 'auditoria.evento' else 'cadastro.paciente' end,'registro_id',case when campo='motivo' then auditoria_id::text else paciente::text end,'campo',campo,'formato',1)
    or jsonb_typeof(e->campo) is distinct from 'object' or (e->campo) - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
    or e->campo->'formato' is distinct from '1'::jsonb or jsonb_typeof(e->campo->'key_id') is distinct from 'string'
    or coalesce(length(e->campo->>'key_id') between 1 and 128,false) is not true
    or jsonb_typeof(e->campo->'nonce') is distinct from 'string' or coalesce(e->campo->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
    or jsonb_typeof(e->campo->'tag') is distinct from 'string' or coalesce(e->campo->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
    or jsonb_typeof(e->campo->'ciphertext') is distinct from 'string' or coalesce(length(e->campo->>'ciphertext') between 1 and 32768 and e->campo->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true)) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 end loop;
 perform 1 from cadastro.paciente p where p.id=paciente for update;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.editar_paciente','paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.editar_paciente' and r.chave_idempotencia=e->>'chave_idempotencia';
 repeticao:=found;
 if not repeticao then
  if not exists(select 1 from cadastro.paciente p where p.id=paciente and p.versao=epoca) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.editar_paciente','paciente',paciente,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
   values(gen_random_uuid(),ator,'api.editar_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',paciente,epoca+1)
   on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
  if found then
   update cadastro.paciente set nome_cifrado=case when e ? 'nome' then e->'nome' else nome_cifrado end,
    nome_preferencia_cifrado=case when e ? 'nome_preferencia' then nullif(e->'nome_preferencia','null'::jsonb) else nome_preferencia_cifrado end,
    data_nascimento_cifrada=case when e ? 'data_nascimento' then nullif(e->'data_nascimento','null'::jsonb) else data_nascimento_cifrada end,
    versao=versao+1, atualizado_em=clock_timestamp() where id=paciente;
  else
   repeticao:=true;
   select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.editar_paciente' and r.chave_idempotencia=e->>'chave_idempotencia';
  end if;
 end if;
 if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida' or anterior.resultado_id is distinct from paciente or anterior.resultado_versao is distinct from (epoca+1)::integer then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.editar_paciente','paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
 end if;
 if repeticao then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.editar_paciente','paciente',paciente,'permitido',req);
 else
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado) values(auditoria_id,ator,'api.editar_paciente','paciente',paciente,'permitido',req,e->'motivo');
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('paciente_id',paciente,'versao',anterior.resultado_versao),'request_id',req,'repeticao',repeticao);
end $$;
revoke all on function operacao.editar_paciente_privado(jsonb) from public;
