-- FR-010: leitura e escrita privadas da transcrição de áudio.
-- Owner dedicado (isolamento por fatia, como em ffcmapp_saude_owner): a função só enxerga as
-- colunas necessárias e nenhuma outra fatia herda esses privilégios.
-- Exige prova real e autorização específica antes de qualquer aplicação remota.
--
-- Quatro ações, porque o requisito tem quatro momentos distintos e eles não podem ser
-- fundidos sem perder garantia:
--   api.registrar_audio_transcricao  — guarda o áudio e a transcrição automática
--   api.ler_audio_transcricao        — devolve o original para ouvir durante a revisão
--   api.confirmar_revisao_audio      — ato humano; só aqui a revisão passa a existir
--   api.excluir_audio_transcricao    — apaga o ÁUDIO, preservando texto, autoria e histórico
--
-- Só o autor alcança o próprio áudio: "o autor pode ouvir o original e corrigir o texto,
-- respeitadas suas permissões". Vínculo com o caso continua sendo exigido além disso.
select set_config('ffcmapp.migrador_audio_transcricao_owner', current_user, false);

create role ffcmapp_audio_transcricao_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_audio_transcricao_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_audio_transcricao_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_audio_transcricao_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_audio_transcricao_owner;
grant execute on function cadastro.envelope_audio_valido(jsonb), cadastro.envelope_texto_valido(jsonb) to ffcmapp_audio_transcricao_owner;

-- O verificador do atestado é de outro owner; conceder exige assumir o papel dono.
grant ffcmapp_atestado_verificador_owner to current_user with inherit false, set true;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_audio_transcricao_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_audio_transcricao_owner'), false);
revoke ffcmapp_atestado_verificador_owner from current_user;

-- `for share`/`for update` exigem privilégio de UPDATE além do de SELECT; por isso cada
-- tabela travada recebe update de uma coluna inócua e uma policy de trava que nunca grava.
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_audio_transcricao_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_audio_transcricao_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_audio_transcricao_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_audio_transcricao_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_audio_transcricao_owner;
-- UPDATE só nas colunas do ciclo de vida. O áudio pode ser zerado, a revisão registrada e a
-- exclusão marcada; nada mais. Sem DELETE: o registro não é apagado.
grant select, insert on cadastro.audio_transcricao to ffcmapp_audio_transcricao_owner;
grant update (audio_cifrado, texto_revisado_cifrado, revisao_confirmada_em, exclusao_estado, exclusao_em, exclusao_tentativas) on cadastro.audio_transcricao to ffcmapp_audio_transcricao_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_audio_transcricao_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_audio_transcricao_owner;

create policy audio_transcricao_config on identidade.configuracao_auth_nativo for select to ffcmapp_audio_transcricao_owner using (true);
create policy audio_transcricao_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_audio_transcricao_owner using (true) with check (false);
create policy audio_transcricao_usuario on public.usuario for select to ffcmapp_audio_transcricao_owner using (id = (select auth_privado.uid()));
create policy audio_transcricao_usuario_lock on public.usuario for update to ffcmapp_audio_transcricao_owner using (id = (select auth_privado.uid())) with check (false);
create policy audio_transcricao_concessao on identidade.concessao_equipe for select to ffcmapp_audio_transcricao_owner using (usuario_id = (select auth_privado.uid()));
create policy audio_transcricao_concessao_lock on identidade.concessao_equipe for update to ffcmapp_audio_transcricao_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy audio_transcricao_sessao on identidade.sessao for select to ffcmapp_audio_transcricao_owner using (usuario_id = (select auth_privado.uid()));
create policy audio_transcricao_sessao_lock on identidade.sessao for update to ffcmapp_audio_transcricao_owner using (usuario_id = (select auth_privado.uid())) with check (false);

-- Mesma prova de vínculo exigida na anamnese e na saúde.
create policy audio_transcricao_paciente on cadastro.paciente for select to ffcmapp_audio_transcricao_owner using (
  exists (
    select 1
    from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid())
      and u.ativo
      and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada'
      and c.metodo = 'google_workspace'
      and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt() ->> 'session_id')
      and s.metodo = 'google_workspace'
      and s.revogada_em is null
      and s.encerrada_em is null
      and exists (
        select 1 from auth_privado.sessoes() a
        where a.id = s.session_id and a.user_id = u.id
          and (a.not_after is null or a.not_after > clock_timestamp())
      )
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = cfg.dominio_workspace
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array'
            then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end
        ) m where m ->> 'method' = 'oauth'
      )
  )
);
create policy audio_transcricao_paciente_lock on cadastro.paciente for update to ffcmapp_audio_transcricao_owner using (true) with check (false);

-- O áudio é do autor: nem outro profissional vinculado ao caso ouve a gravação alheia.
create policy audio_transcricao_proprio on cadastro.audio_transcricao for select to ffcmapp_audio_transcricao_owner
  using (criado_por_usuario_id = (select auth_privado.uid()) and exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy audio_transcricao_inserir on cadastro.audio_transcricao for insert to ffcmapp_audio_transcricao_owner
  with check (criado_por_usuario_id = (select auth_privado.uid()) and exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy audio_transcricao_atualizar on cadastro.audio_transcricao for update to ffcmapp_audio_transcricao_owner
  using (criado_por_usuario_id = (select auth_privado.uid()) and exists (select 1 from cadastro.paciente p where p.id = paciente_id))
  with check (criado_por_usuario_id = (select auth_privado.uid()));

create policy audio_transcricao_requisicao on operacao.requisicao to ffcmapp_audio_transcricao_owner
  using (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_audio_transcricao', 'api.confirmar_revisao_audio'))
  with check (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_audio_transcricao', 'api.confirmar_revisao_audio'));
create policy audio_transcricao_auditoria on auditoria.evento for insert to ffcmapp_audio_transcricao_owner
  with check (ator_usuario_id = (select auth_privado.uid()));
-- Identidade Auth sem perfil fica auditada sem criar usuário; os dois atores nunca coexistem.
create policy audio_transcricao_ator_exclusivo on auditoria.evento as restrictive for insert to ffcmapp_audio_transcricao_owner
  with check (ator_usuario_id is null or ator_auth_id is null);
create policy audio_transcricao_auth_nao_admitido on auditoria.evento for insert to ffcmapp_audio_transcricao_owner
  with check (
    ator_usuario_id is null and operador_restrito is null
    and ator_auth_id = (select auth_privado.uid())
    and resultado = 'negado'
    and acao in ('api.registrar_audio_transcricao', 'api.ler_audio_transcricao',
      'api.confirmar_revisao_audio', 'api.excluir_audio_transcricao')
    and tipo_objeto = 'paciente'
    and not exists (select 1 from public.usuario u where u.id = (select auth_privado.uid()))
  );

set role ffcmapp_audio_transcricao_owner;
create function api.transcricao_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; anterior operacao.requisicao; repeticao boolean:=false;
 linha cadastro.audio_transcricao; mutacao boolean;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','audio','transcricao','mime',
    'duracao_segundos','modelo','texto_revisado','aad','atestado','chave_idempotencia',
    'digest_idempotencia'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  registro:=(e->>'registro_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 mutacao:=acao in ('api.registrar_audio_transcricao','api.confirmar_revisao_audio');
 if ator is null or sessao is null or req is null or paciente is null or registro is null
  or inicio is null or fim is null or acao is null
  or acao not in ('api.registrar_audio_transcricao','api.ler_audio_transcricao',
    'api.confirmar_revisao_audio','api.excluir_audio_transcricao')
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
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
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
 -- Entrada específica de cada ação. Chave a mais é recusada: a assinatura cobre a entrada
 -- inteira, então aceitar campo desconhecido seria aceitar comando que ninguém revisou.
 if acao='api.registrar_audio_transcricao' then
  if e - array['request_id','paciente_id','registro_id','audio','transcricao','mime',
    'duracao_segundos','modelo','aad','atestado','chave_idempotencia','digest_idempotencia'] <> '{}'::jsonb
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string'
   or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string'
   or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or coalesce(e->>'mime','') not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav')
   or jsonb_typeof(e->'duracao_segundos') is distinct from 'number'
   or coalesce(e->>'duracao_segundos','') !~ '^[1-9][0-9]{0,2}$'
   or (e->>'duracao_segundos')::integer not between 1 and 300
   or jsonb_typeof(e->'modelo') is distinct from 'string'
   or coalesce(length(btrim(e->>'modelo')) between 1 and 160,false) is not true
   or cadastro.envelope_audio_valido(e->'audio') is not true or e->'audio' is null
   or jsonb_typeof(e->'audio') is distinct from 'array'
   or cadastro.envelope_texto_valido(e->'transcricao') is not true or e->'transcricao' is null
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.audio_transcricao',
     'paciente_id',paciente::text,'registro_id',registro::text,'parte',0,'campo','transcricao','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 elsif acao='api.confirmar_revisao_audio' then
  if e - array['request_id','paciente_id','registro_id','texto_revisado','aad','atestado',
    'chave_idempotencia','digest_idempotencia'] <> '{}'::jsonb
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string'
   or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string'
   or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or cadastro.envelope_texto_valido(e->'texto_revisado') is not true or e->'texto_revisado' is null
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.audio_transcricao',
     'paciente_id',paciente::text,'registro_id',registro::text,'parte',0,'campo','texto_revisado','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 else
  if e - array['request_id','paciente_id','registro_id','atestado'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 end if;
 -- Vínculo com o caso. Mutação trava o paciente; leitura não precisa.
 if mutacao or acao='api.excluir_audio_transcricao' then
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 else
  perform 1 from cadastro.paciente p where p.id=paciente;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;

 if acao='api.registrar_audio_transcricao' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    begin
     insert into cadastro.audio_transcricao(id,paciente_id,audio_cifrado,mime,duracao_segundos,
       transcricao_cifrada,modelo,expira_em,criado_por_usuario_id)
      values(registro,paciente,e->'audio',e->>'mime',(e->>'duracao_segundos')::integer,
        e->'transcricao',btrim(e->>'modelo'),clock_timestamp()+interval '30 days',ator);
    exception when unique_violation then
     -- Mesmo `registro_id` reaproveitado com outra chave: conflito, nunca sobrescrita.
     delete from operacao.requisicao where id=anterior.id;
     insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
      values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
    end;
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.audio_transcricao t where t.id=anterior.resultado_id and t.paciente_id=paciente) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select * into linha from cadastro.audio_transcricao t where t.id=anterior.resultado_id;
 else
  select * into linha from cadastro.audio_transcricao t where t.id=registro and t.paciente_id=paciente
   for update;
  if not found then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',req);
  end if;
 end if;

 if acao='api.confirmar_revisao_audio' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   -- Revisão já confirmada antes, por outro caminho: não reescreve, não duplica.
   if linha.revisao_confirmada_em is not null then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',linha.id,1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    -- Confirmar a revisão é o ato que autoriza pedir o descarte do original: o estado passa
    -- a `pendente`, nunca a `confirmada`. Quem apaga é a ação de exclusão.
    update cadastro.audio_transcricao
     set texto_revisado_cifrado=e->'texto_revisado',
       revisao_confirmada_em=clock_timestamp(),
       exclusao_estado=case when audio_cifrado is null then exclusao_estado else 'pendente' end
     where id=linha.id;
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or anterior.resultado_id is distinct from linha.id then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select * into linha from cadastro.audio_transcricao t where t.id=linha.id;
 elsif acao='api.excluir_audio_transcricao' then
  -- Sem recibo de idempotência de propósito: o alvo é um estado terminal determinado pela
  -- linha, não pelo pedido. Repetir converge e é seguro, inclusive com chave nova — que é
  -- exatamente o que uma ação de "regularizar exclusão" precisa.
  if linha.revisao_confirmada_em is null then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  if linha.exclusao_estado <> 'confirmada' then
   update cadastro.audio_transcricao
    set audio_cifrado=null, exclusao_estado='confirmada', exclusao_em=clock_timestamp(),
      exclusao_tentativas=least(exclusao_tentativas+1,1000)
    where id=linha.id;
   select * into linha from cadastro.audio_transcricao t where t.id=linha.id;
  else
   repeticao:=true;
  end if;
 end if;

 -- O áudio só volta quando é pedido para ouvir: nenhuma outra resposta carrega meio mega
 -- de gravação, e a mutação não devolve o que não mudou.
 resultado:=jsonb_build_object(
   'audio_id',linha.id,'paciente_id',linha.paciente_id,'mime',linha.mime,
   'duracao_segundos',linha.duracao_segundos,'transcricao',linha.transcricao_cifrada,
   'modelo',linha.modelo,'texto_revisado',linha.texto_revisado_cifrado,
   'revisao_confirmada_em',linha.revisao_confirmada_em,'exclusao_estado',linha.exclusao_estado,
   'exclusao_em',linha.exclusao_em,'expira_em',linha.expira_em,
   'audio',case when acao='api.ler_audio_transcricao' then linha.audio_cifrado else null end);
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
revoke all on function api.transcricao_operacao_privada(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_audio_transcricao_owner'), false);

revoke create on schema api from ffcmapp_audio_transcricao_owner;
revoke ffcmapp_audio_transcricao_owner from current_user;
