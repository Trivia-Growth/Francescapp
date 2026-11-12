-- FR-032/FR-033: operações de exportação. Owner dedicado, como nas demais fatias.
--
-- AUTORIZAÇÃO — decisão provisória que precisa de confirmação do solicitante: exportar é
-- restrito ao ADMINISTRADOR. FR-032 diz "exportação autorizada" sem fixar por quem, e esta
-- é a leitura mais restritiva, alinhada ao precedente da fatia de governança (FR-040).
-- Se a decisão for abrir ao profissional vinculado, muda só o bloco marcado ESCOPO_PERFIL
-- abaixo — nada mais nesta migration depende disso.
--
-- O OWNER NÃO RECEBE PRIVILÉGIO SOBRE NENHUMA COLUNA CIFRADA DE NENHUMA FATIA. Ele só lê o
-- manifesto já derivado por `cadastro.linha_tempo_caso`, que por sua vez também não lê
-- envelope algum. Isso é o que impede a exportação de virar um ponto único de decifragem; o
-- teste afirma a ausência desses privilégios.
--
-- `registrar` grava a exportação, o destinatário e o propósito ANTES de devolver o
-- manifesto: não existe caminho em que o conteúdo seja reunido sem rastro.
--
-- Exige prova real e autorização específica antes de qualquer aplicação remota.
select set_config('ffcmapp.migrador_exportacao', current_user, false);

create role ffcmapp_exportacao_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_exportacao_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_exportacao_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_exportacao_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_exportacao_owner;

grant ffcmapp_atestado_verificador_owner to current_user with inherit false, set true;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_exportacao_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_exportacao'), false);
revoke ffcmapp_atestado_verificador_owner from current_user;

grant ffcmapp_linha_tempo_owner to current_user with inherit false, set true;
set role ffcmapp_linha_tempo_owner;
grant execute on function cadastro.linha_tempo_caso(uuid, uuid, boolean, timestamptz, timestamptz, text[], uuid, timestamptz, uuid, integer)
  to ffcmapp_exportacao_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_exportacao'), false);
revoke ffcmapp_linha_tempo_owner from current_user;

grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_exportacao_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_exportacao_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_exportacao_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_exportacao_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_exportacao_owner;
grant select (usuario_id, paciente_id, revogada_em), update (revogada_em) on cadastro.acesso_paciente to ffcmapp_exportacao_owner;
grant select (id, paciente_id, finalidade, criado_em, ator_usuario_id), insert on cadastro.exportacao_caso to ffcmapp_exportacao_owner;
grant select (id, exportacao_id, fonte, registro_id, versao_item, tipo_evento, autor_usuario_id, registrado_em, aconteceu_em, disponibilidade, motivo_indisponibilidade), insert on cadastro.exportacao_item to ffcmapp_exportacao_owner;
grant select (id, exportacao_id, ato, ator_usuario_id, criado_em), insert on cadastro.exportacao_entrega to ffcmapp_exportacao_owner;
grant select, insert on operacao.requisicao to ffcmapp_exportacao_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_exportacao_owner;

create policy exportacao_config on identidade.configuracao_auth_nativo for select to ffcmapp_exportacao_owner using (true);
create policy exportacao_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_exportacao_owner using (true) with check (false);
create policy exportacao_usuario on public.usuario for select to ffcmapp_exportacao_owner using (true);
create policy exportacao_usuario_lock on public.usuario for update to ffcmapp_exportacao_owner using (id = (select auth_privado.uid())) with check (false);
create policy exportacao_concessao on identidade.concessao_equipe for select to ffcmapp_exportacao_owner using (usuario_id = (select auth_privado.uid()));
create policy exportacao_concessao_lock on identidade.concessao_equipe for update to ffcmapp_exportacao_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy exportacao_sessao on identidade.sessao for select to ffcmapp_exportacao_owner using (usuario_id = (select auth_privado.uid()));
create policy exportacao_sessao_lock on identidade.sessao for update to ffcmapp_exportacao_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy exportacao_acesso on cadastro.acesso_paciente for select to ffcmapp_exportacao_owner using (usuario_id = (select auth_privado.uid()));
create policy exportacao_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_exportacao_owner using (usuario_id = (select auth_privado.uid())) with check (false);

-- Mesma prova de vínculo das demais fatias de colaborador. O recorte de perfil fica na
-- função, com trava na mesma transação.
create policy exportacao_paciente on cadastro.paciente for select to ffcmapp_exportacao_owner using (
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
);
create policy exportacao_paciente_lock on cadastro.paciente for update to ffcmapp_exportacao_owner using (true) with check (false);
create policy exportacao_caso_select on cadastro.exportacao_caso for select to ffcmapp_exportacao_owner
  using (exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy exportacao_caso_insert on cadastro.exportacao_caso for insert to ffcmapp_exportacao_owner
  with check (ator_usuario_id = (select auth_privado.uid()) and exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy exportacao_item_select on cadastro.exportacao_item for select to ffcmapp_exportacao_owner
  using (exists (select 1 from cadastro.exportacao_caso x where x.id = exportacao_id));
create policy exportacao_item_insert on cadastro.exportacao_item for insert to ffcmapp_exportacao_owner
  with check (exists (select 1 from cadastro.exportacao_caso x where x.id = exportacao_id));
create policy exportacao_entrega_select on cadastro.exportacao_entrega for select to ffcmapp_exportacao_owner
  using (exists (select 1 from cadastro.exportacao_caso x where x.id = exportacao_id));
create policy exportacao_entrega_insert on cadastro.exportacao_entrega for insert to ffcmapp_exportacao_owner
  with check (ator_usuario_id = (select auth_privado.uid()) and exists (select 1 from cadastro.exportacao_caso x where x.id = exportacao_id));
create policy exportacao_requisicao on operacao.requisicao for select to ffcmapp_exportacao_owner
  using (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_exportacao','api.confirmar_entrega_exportacao'));
create policy exportacao_requisicao_insert on operacao.requisicao for insert to ffcmapp_exportacao_owner
  with check (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.registrar_exportacao','api.confirmar_entrega_exportacao'));
create policy exportacao_auditoria on auditoria.evento for insert to ffcmapp_exportacao_owner
  with check (ator_usuario_id = (select auth_privado.uid()));
create policy exportacao_ator_exclusivo on auditoria.evento as restrictive for insert to ffcmapp_exportacao_owner
  with check (ator_usuario_id is null or ator_auth_id is null);
create policy exportacao_auth_nao_admitido on auditoria.evento for insert to ffcmapp_exportacao_owner
  with check (
    ator_usuario_id is null and operador_restrito is null
    and ator_auth_id = (select auth_privado.uid())
    and resultado = 'negado'
    and acao in ('api.registrar_exportacao','api.confirmar_entrega_exportacao','api.listar_exportacoes')
    and tipo_objeto = 'paciente'
    and not exists (select 1 from public.usuario u where u.id = (select auth_privado.uid()))
  );

set role ffcmapp_exportacao_owner;
create function api.exportacao_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; inicio timestamptz; fim timestamptz; concessao uuid; perfil text;
 sujeito text; google record; dominio text; autorizado boolean:=false; acao text;
 anterior operacao.requisicao; repeticao boolean:=false; resultado jsonb; manifesto jsonb;
 de timestamptz; ate timestamptz; finalidade text; ato text; exportacao uuid; itens jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','atestado','chave_idempotencia','digest_idempotencia','periodo_de','periodo_ate','finalidade','destinatario_cifrado','proposito_cifrado','exportacao_id','ato','observacao_cifrada'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao<>'api.listar_exportacoes' then registro:=(e->>'registro_id')::uuid; end if;
  if jsonb_typeof(e->'periodo_de')='string' then de:=(e->>'periodo_de')::timestamptz; end if;
  if jsonb_typeof(e->'periodo_ate')='string' then ate:=(e->>'periodo_ate')::timestamptz; end if;
  if jsonb_typeof(e->'exportacao_id')='string' then exportacao:=(e->>'exportacao_id')::uuid; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao is null or acao not in ('api.registrar_exportacao','api.confirmar_entrega_exportacao','api.listar_exportacoes')
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
 -- ESCOPO_PERFIL: exportar é do Administrador. Decisão provisória; abrir ao profissional
 -- vinculado é trocar esta condição e acrescentar a trava de `acesso_paciente`.
 if autorizado and perfil<>'administrador' then autorizado:=false; end if;
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
 if acao='api.listar_exportacoes' then
  if e - array['request_id','paciente_id','atestado'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  if acao='api.registrar_exportacao' then
   finalidade:=e->>'finalidade';
   if e - array['request_id','paciente_id','registro_id','atestado','chave_idempotencia','digest_idempotencia','periodo_de','periodo_ate','finalidade','destinatario_cifrado','proposito_cifrado'] <> '{}'::jsonb
    or finalidade is null or finalidade not in ('acompanhamento','portabilidade_titular','encerramento_uso')
    or jsonb_typeof(e->'destinatario_cifrado') is distinct from 'object'
    or jsonb_typeof(e->'proposito_cifrado') is distinct from 'object'
    or ((de is null) <> (ate is null))
    or (de is not null and ate<=de) then
    raise exception using errcode='22023',message='ENTRADA_INVALIDA';
   end if;
  else
   ato:=e->>'ato';
   if e - array['request_id','paciente_id','registro_id','atestado','chave_idempotencia','digest_idempotencia','exportacao_id','ato','observacao_cifrada'] <> '{}'::jsonb
    or exportacao is null or ato is null or ato not in ('entregue','conferida')
    or jsonb_typeof(e->'observacao_cifrada') not in ('object','null','undefined') then
    raise exception using errcode='22023',message='ENTRADA_INVALIDA';
   end if;
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.confirmar_entrega_exportacao' then
  perform 1 from cadastro.exportacao_caso x where x.id=exportacao and x.paciente_id=paciente;
  if not found then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao<>'api.listar_exportacoes' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    if acao='api.registrar_exportacao' then
     -- O manifesto sai da MESMA função da linha do tempo: a exportação não alcança o que a
     -- leitura comum não alcança, e não existe segunda regra de audiência.
     manifesto:=cadastro.linha_tempo_caso(paciente,ator,false,de,ate,null,null,null,null,200);
     insert into cadastro.exportacao_caso(id,paciente_id,periodo_de,periodo_ate,finalidade,destinatario_cifrado,proposito_cifrado,ator_usuario_id)
      values(registro,paciente,de,ate,finalidade,e->'destinatario_cifrado',e->'proposito_cifrado',ator);
     insert into cadastro.exportacao_item(id,exportacao_id,fonte,registro_id,versao_item,tipo_evento,autor_usuario_id,registrado_em,aconteceu_em,disponibilidade,motivo_indisponibilidade)
      select gen_random_uuid(),registro,i->>'fonte',(i->>'id')::uuid,(i->>'versao')::integer,i->>'tipo_evento',
        (i->>'autor_usuario_id')::uuid,(i->>'registrado_em')::timestamptz,
        case when jsonb_typeof(i->'aconteceu_em')='string' then (i->>'aconteceu_em')::date end,
        case when i#>>'{detalhe,estado}'='indisponivel' then 'indisponivel' else 'incluido' end,
        case when i#>>'{detalhe,estado}'='indisponivel' then 'documento_indisponivel' end
      from jsonb_array_elements(manifesto->'itens') i;
    else
     insert into cadastro.exportacao_entrega(id,exportacao_id,ato,observacao_cifrada,ator_usuario_id)
      values(registro,exportacao,ato,
        case when jsonb_typeof(e->'observacao_cifrada')='object' then e->'observacao_cifrada' end,ator);
    end if;
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or (acao='api.registrar_exportacao' and not exists(select 1 from cadastro.exportacao_caso x where x.id=anterior.resultado_id and x.paciente_id=paciente))
   or (acao='api.confirmar_entrega_exportacao' and not exists(select 1 from cadastro.exportacao_entrega d where d.id=anterior.resultado_id)) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',x.id,'finalidade',x.finalidade,'criado_em',x.criado_em,'ator_usuario_id',x.ator_usuario_id,
   'itens',(select coalesce(jsonb_agg(jsonb_build_object(
      'fonte',it.fonte,'registro_id',it.registro_id,'versao',it.versao_item,'tipo_evento',it.tipo_evento,
      'autor_usuario_id',it.autor_usuario_id,'registrado_em',it.registrado_em,'aconteceu_em',it.aconteceu_em,
      'disponibilidade',it.disponibilidade,'motivo_indisponibilidade',it.motivo_indisponibilidade)
      order by it.registrado_em desc),'[]'::jsonb) from cadastro.exportacao_item it where it.exportacao_id=x.id),
   'entregas',(select coalesce(jsonb_agg(jsonb_build_object('ato',d.ato,'criado_em',d.criado_em,'ator_usuario_id',d.ator_usuario_id)
      order by d.criado_em),'[]'::jsonb) from cadastro.exportacao_entrega d where d.exportacao_id=x.id)
 ) order by x.criado_em desc),'[]'::jsonb) into itens
 from cadastro.exportacao_caso x where x.paciente_id=paciente;
 resultado:=jsonb_build_object('paciente_id',paciente,'exportacoes',itens);
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
revoke all on function api.exportacao_operacao_privada(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_exportacao'), false);

revoke create on schema api from ffcmapp_exportacao_owner;
revoke ffcmapp_exportacao_owner from current_user;
