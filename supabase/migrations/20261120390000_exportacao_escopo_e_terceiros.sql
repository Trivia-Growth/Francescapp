-- FR-032/FR-033: duas decisões do solicitante de 12/11/2026.
--
-- 1. QUEM PODE EXPORTAR deixa de ser só o Administrador e passa a incluir a profissional do
--    caso. Ela precisa de `acesso_paciente` vigente travado na mesma transação: exportar
--    não pode ser mais frouxo que ler. O Administrador continua alcançando pela exceção já
--    aprovada da carteira completa. Família segue fora, por perfil.
--
-- 2. DADOS DE TERCEIROS entram no pacote com o MÍNIMO IDENTIFICÁVEL — papel e primeiro
--    nome, como "irmã, Ana". Sem contato, sem anotação, sem documento, sem campo livre.
--    Como esses nomes vivem dentro do envelope cifrado e esta fatia não decifra nada (é o
--    controle central da exportação, e ele não é afrouxado por esta migration), a redução
--    acontece no navegador, junto da montagem do pacote. O banco guarda só
--    `terceiros_reduzidos`: a DECLARAÇÃO de que houve omissão. O pacote diz que omitiu,
--    nunca o que omitiu — dizer o que foi omitido seria o vazamento ao contrário.
--
-- A chamada ao derivador acompanha a nova assinatura de `20261120370000`.

alter table cadastro.exportacao_caso
  add column terceiros_reduzidos boolean not null default false;

select set_config('ffcmapp.migrador_exportacao_escopo', current_user, false);

-- O derivador ganhou assinatura nova em `20261120370000`; o execute é do dono dele.
grant ffcmapp_linha_tempo_owner to current_user with inherit false, set true;
set role ffcmapp_linha_tempo_owner;
grant execute on function cadastro.linha_tempo_caso(uuid, uuid, boolean, timestamptz, timestamptz, text[], uuid, timestamptz, uuid, integer, text[], uuid)
  to ffcmapp_exportacao_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_exportacao_escopo'), false);
revoke ffcmapp_linha_tempo_owner from current_user;

grant ffcmapp_exportacao_owner to current_user with inherit false, set true;
grant create on schema api to ffcmapp_exportacao_owner;
set role ffcmapp_exportacao_owner;
create or replace function api.exportacao_operacao_privada(p_transporte jsonb) returns jsonb
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
 -- ESCOPO_PERFIL, decidido pelo solicitante em 12/11/2026: exportar é do Administrador e
 -- da profissional do caso. A profissional precisa de `acesso_paciente` vigente travado na
 -- mesma transação — exportar não pode ser mais frouxo que ler, e a carteira do
 -- Administrador já é a exceção aprovada.
 if autorizado and perfil='profissional' then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
  autorizado:=found;
 elsif autorizado and perfil<>'administrador' then
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
     manifesto:=cadastro.linha_tempo_caso(paciente,ator,false,de,ate,null,null,null,null,200,null,null);
     -- FR-033, decisão de 12/11/2026: dados de terceiros entram no pacote com o mínimo
     -- identificável (papel e primeiro nome). A redução acontece no navegador, junto do
     -- resto do pacote, porque o nome vive dentro do envelope e esta fatia não decifra
     -- nada. O banco guarda apenas a DECLARAÇÃO de que houve omissão — nunca o que foi
     -- omitido, que seria o vazamento ao contrário.
     insert into cadastro.exportacao_caso(id,paciente_id,periodo_de,periodo_ate,finalidade,destinatario_cifrado,proposito_cifrado,terceiros_reduzidos,ator_usuario_id)
      values(registro,paciente,de,ate,finalidade,e->'destinatario_cifrado',e->'proposito_cifrado',
        exists(select 1 from jsonb_array_elements(manifesto->'itens') i where i->>'fonte' in ('rede','contexto')),ator);
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
   'terceiros_reduzidos',x.terceiros_reduzidos,
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
select set_config('role', current_setting('ffcmapp.migrador_exportacao_escopo'), false);
revoke create on schema api from ffcmapp_exportacao_owner;

grant select (terceiros_reduzidos), insert (terceiros_reduzidos)
  on cadastro.exportacao_caso to ffcmapp_exportacao_owner;
revoke ffcmapp_exportacao_owner from current_user;
