-- DF-021: habilitação clínica não concede alçada fora do caso liderado.
-- Sem backfill de responsáveis/habilitações; casos sem responsável recusam aprovação.
-- Reversão funcional: restaurar função de 20261118120000 e remover policy restritiva;
-- não remover histórico nem carimbos. Preparação local, nenhuma operação remota.
select set_config('ffcmapp.migrador_crise_caso', current_user, false);
alter table identidade.concessao_equipe drop constraint concessao_habilitacao_perfil_chk;
alter table identidade.concessao_equipe add constraint concessao_habilitacao_perfil_chk
 check ((not habilitado_plano_crise or perfil in ('administrador','profissional')) is true);
alter policy habilitacao_crise_concessao_update on identidade.concessao_equipe
 with check (not habilitado_plano_crise or perfil in ('administrador','profissional'));
alter policy plano_crise_owner_aprovacao_inserir on cadastro.plano_crise_aprovacao with check (
 aprovador_usuario_id = (select auth_privado.uid())
 and exists(select 1 from cadastro.paciente p where p.id=plano_crise_aprovacao.paciente_id)
 and exists(select 1 from identidade.concessao_equipe c
  where c.id=concessao_id and c.usuario_id=(select auth_privado.uid())
   and c.perfil in ('administrador','profissional') and c.estado='vinculada' and c.habilitado_plano_crise)
 and exists(select 1 from cadastro.plano_crise_versao v
  where v.id=registro_id and v.paciente_id=plano_crise_aprovacao.paciente_id)
);
grant select (paciente_id, versao, responsavel_usuario_id) on cadastro.acompanhamento_caso to ffcmapp_plano_crise_owner;
create policy crise_acompanhamento_leitura on cadastro.acompanhamento_caso
 for select to ffcmapp_plano_crise_owner using (
  exists(select 1 from cadastro.paciente p where p.id=acompanhamento_caso.paciente_id)
 );
create policy crise_aprovacao_responsavel_atual on cadastro.plano_crise_aprovacao
 as restrictive for insert to ffcmapp_plano_crise_owner with check (
  (select h.responsavel_usuario_id from cadastro.acompanhamento_caso h
   where h.paciente_id=plano_crise_aprovacao.paciente_id order by h.versao desc limit 1)
  = (select auth_privado.uid())
 );
select set_config('ffcmapp.crise_caso_tinha_set',pg_has_role(current_user,'ffcmapp_plano_crise_owner','SET')::text,false);
select set_config('ffcmapp.crise_caso_tinha_create',exists(
 select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 join pg_roles r on r.oid=a.grantee where n.nspname='api'
 and r.rolname='ffcmapp_plano_crise_owner' and a.privilege_type='CREATE')::text,false);
do $$ begin
 if (select p.proowner from pg_proc p where p.oid='api.plano_crise_operacao_privada(jsonb)'::regprocedure)
  is distinct from 'ffcmapp_plano_crise_owner'::regrole then raise exception 'OWNER_INESPERADO'; end if;
 if current_setting('ffcmapp.crise_caso_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m where m.roleid='ffcmapp_plano_crise_owner'::regrole
   and m.member=current_user::regrole and m.grantor=current_user::regrole) then
   raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_plano_crise_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.crise_caso_tinha_create')='false' then
  grant create on schema api to ffcmapp_plano_crise_owner;
 end if;
end $$;
set role ffcmapp_plano_crise_owner;
create or replace function api.plano_crise_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; esperada integer; alvo_versao integer; atual integer;
 inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text; google record;
 dominio text; autorizado boolean:=false; habilitado boolean:=false; aprovacao uuid;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','versao_esperada','versao','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_plano_crise' then
   registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  elsif acao='api.aprovar_plano_crise' then
   registro:=(e->>'registro_id')::uuid; alvo_versao:=(e->>'versao')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_plano_crise','api.gravar_plano_crise','api.aprovar_plano_crise') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
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
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google,c.habilitado_plano_crise into concessao,perfil,sujeito,habilitado
    from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
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
 end if;
 -- DF-021: habilitação explícita e liderança atual do caso; perfil sozinho não autoriza.
 if acao='api.aprovar_plano_crise' and not (perfil in ('administrador','profissional') and habilitado is true) then
  autorizado:=false;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_plano_crise' then
  if e - array['request_id','paciente_id','atestado'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 elsif acao='api.aprovar_plano_crise' then
  if e - array['request_id','paciente_id','registro_id','versao','chave_idempotencia','digest_idempotencia','atestado'] <> '{}'::jsonb
   or registro is null or alvo_versao is null or alvo_versao<1 or alvo_versao=2147483647
   or jsonb_typeof(e->'versao') is distinct from 'number'
   or coalesce(e->>'versao','') !~ '^[1-9][0-9]*$'
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.plano_crise_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- DF-021: paciente já está travado FOR UPDATE, assim como na edição do responsável.
 -- Revalidar inclusive replay: trocar/remover responsável impede novos atos, sem apagar carimbos.
 if acao='api.aprovar_plano_crise' and (
   select h.responsavel_usuario_id from cadastro.acompanhamento_caso h
   where h.paciente_id=paciente order by h.versao desc limit 1
 ) is distinct from ator then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.gravar_plano_crise' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao into atual from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    insert into cadastro.plano_crise_versao(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
     values(registro,paciente,esperada+1,nullif(esperada,0),envelope,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.plano_crise_versao v where v.id=anterior.resultado_id and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  registro:=anterior.resultado_id;
 elsif acao='api.aprovar_plano_crise' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   -- Aprova-se a versão corrente e nomeada: se o plano mudou entre a leitura e o clique,
   -- a aprovação recai sobre um texto que já não é o que a pessoa leu.
   select v.versao into atual from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if atual is null or atual<>alvo_versao
    or not exists(select 1 from cadastro.plano_crise_versao v where v.id=registro and v.paciente_id=paciente and v.versao=alvo_versao) then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   aprovacao:=gen_random_uuid();
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',aprovacao,alvo_versao)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    begin
     insert into cadastro.plano_crise_aprovacao(id,registro_id,paciente_id,aprovador_usuario_id,concessao_id)
      values(aprovacao,registro,paciente,ator,concessao);
    exception when unique_violation then
     -- Esta pessoa já aprovou esta versão: o carimbo original continua valendo.
     delete from operacao.requisicao where id=anterior.id;
     insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
      values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
     if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
    end;
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.plano_crise_aprovacao ap where ap.id=anterior.resultado_id
     and ap.registro_id=registro and ap.paciente_id=paciente and ap.aprovador_usuario_id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
 end if;
 if acao='api.ler_plano_crise' then
  select v.id into registro from cadastro.plano_crise_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
 end if;
 select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado,
   'aprovacao',(select jsonb_build_object('aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em)
     from cadastro.plano_crise_aprovacao ap where ap.registro_id=v.id order by ap.aprovado_em,ap.id limit 1))
  into resultado from cadastro.plano_crise_versao v where v.id=registro and v.paciente_id=paciente;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_crise_caso'), false);
do $$ begin
 if current_setting('ffcmapp.crise_caso_tinha_create')='false' then
  revoke create on schema api from ffcmapp_plano_crise_owner;
 end if;
 if current_setting('ffcmapp.crise_caso_tinha_set')='false' then
  execute format('revoke ffcmapp_plano_crise_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;

create or replace function operacao.habilitacao_plano_crise_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; alvo uuid; auditoria_id uuid;
  inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
  google record; autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text; atual integer;
  alvo_perfil text; alvo_estado text;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'concessao_id', 'habilitado', 'versao_esperada',
      'chave_idempotencia', 'digest_idempotencia', 'auditoria_id', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid; alvo := (e->>'concessao_id')::uuid;
    auditoria_id := (e->>'auditoria_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_habilitacao_plano_crise', 'api.gravar_habilitacao_plano_crise')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica', p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
      select i.provider_id, i.identity_data into google from auth_privado.identidades() i where i.user_id = ator and i.provider = 'google'
        and bloqueios_auth.travar(ator, sessao)
        and exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp()))
        and (select count(*) from auth_privado.identidades() j where j.user_id = ator and j.provider = 'google') = 1;
      if google.identity_data->>'sub' = google.provider_id and google.identity_data->>'email_verified' = 'true' and google.identity_data#>>'{custom_claims,hd}' = dominio then
        select c.id, c.subject_google into concessao, sujeito from identidade.concessao_equipe c
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.perfil = 'administrador' for share;
        if found and sujeito = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
      select c.id into concessao from identidade.concessao_equipe c
        where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'tecnica' and c.perfil = 'administrador' for share;
      if found then
        perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil = 'administrador' for share;
        if found then
          perform 1 from identidade.excecao_tecnica x where x.usuario_id = ator and x.concessao_id = concessao for share;
          if found then
            perform 1 from identidade.sessao s where s.session_id = sessao and s.usuario_id = ator and s.concessao_id = concessao
              and s.metodo = 'tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
            if found then
              perform 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp());
              autorizado := found;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'concessao_equipe', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_habilitacao_plano_crise' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    -- Limite fixo: a equipe da clínica cabe muito abaixo disso, e um teto explícito evita
    -- devolver uma página arbitrariamente grande se a tabela crescer por outro caminho.
    select coalesce(jsonb_agg(jsonb_build_object(
        'concessao_id', c.id, 'usuario_id', c.usuario_id, 'email', c.email_cifrado,
        'perfil', c.perfil, 'estado', c.estado,
        'habilitado', c.habilitado_plano_crise, 'versao', c.habilitacao_versao)
      order by c.criada_em, c.id), '[]'::jsonb)
      into resultado
      from (select q.id, q.usuario_id, q.email_cifrado, q.perfil, q.estado,
          q.habilitado_plano_crise, q.habilitacao_versao, q.criada_em
        from identidade.concessao_equipe q order by q.criada_em, q.id limit 500) c;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'concessao_equipe', null, 'permitido', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
  end if;
  -- acao = 'api.gravar_habilitacao_plano_crise'
  if alvo is null or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada', '') !~ '^(0|[1-9][0-9]*)$'
    or (e->>'versao_esperada')::integer = 2147483647
    or jsonb_typeof(e->'habilitado') is distinct from 'boolean'
    or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
    or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$'
    or auditoria_id is null then
    raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
  end if;
  insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado, resultado_id, resultado_versao)
    values(gen_random_uuid(), ator, 'api.gravar_habilitacao_plano_crise', e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida', alvo, (e->>'versao_esperada')::integer + 1)
    on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
  if not found then
    select * into anterior from operacao.requisicao r where r.ator_usuario_id = ator
      and r.operacao = 'api.gravar_habilitacao_plano_crise' and r.chave_idempotencia = e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
      or anterior.resultado_id is distinct from alvo or anterior.resultado_versao is distinct from (e->>'versao_esperada')::integer + 1
      or not exists(select 1 from identidade.concessao_equipe c where c.id = alvo and c.habilitacao_versao = (e->>'versao_esperada')::integer + 1) then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'concessao_equipe', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
    repeticao := true;
  else
    select c.habilitacao_versao, c.perfil, c.estado into atual, alvo_perfil, alvo_estado
      from identidade.concessao_equipe c where c.id = alvo for update;
    -- Marcar exige concessão de colaborador ainda vinculada; desmarcar continua possível
    -- em qualquer estado, para que retirar a habilitação nunca fique bloqueado.
    if not found or atual <> (e->>'versao_esperada')::integer
      or ((e->'habilitado')::boolean and (alvo_perfil not in ('administrador','profissional') or alvo_estado <> 'vinculada')) then
      delete from operacao.requisicao where id = anterior.id;
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'concessao_equipe', alvo, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito'), 'request_id', req);
    end if;
    update identidade.concessao_equipe
      set habilitado_plano_crise = (e->'habilitado')::boolean,
        habilitacao_versao = atual + 1,
        habilitacao_por_usuario_id = ator,
        habilitacao_em = clock_timestamp()
      where id = alvo and habilitacao_versao = atual;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(case when repeticao then gen_random_uuid() else auditoria_id end, ator, acao, 'concessao_equipe', alvo, 'permitido', req);
  if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  select jsonb_build_object(
      'concessao_id', c.id, 'usuario_id', c.usuario_id, 'email', c.email_cifrado,
      'perfil', c.perfil, 'estado', c.estado,
      'habilitado', c.habilitado_plano_crise, 'versao', c.habilitacao_versao)
    into resultado from identidade.concessao_equipe c where c.id = alvo;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req);
end $$;
