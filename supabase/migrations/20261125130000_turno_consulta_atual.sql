-- FR-055: consulta do turno aberto próprio sem guardar ID no navegador.
-- Preparação local; NÃO aplicada nem validada nesta passagem.
-- CREATE OR REPLACE mantém owner, ACL e assinatura: sem GRANT/ALTER OWNER/membership.
-- Executar como owner da função ou migrador com SET previamente autorizado.
-- Rollback de exposição: desligar ffcm.turno.ativo; não remover registros.
create or replace function operacao.turno_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; turno uuid; reserva uuid; geracao bigint; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; codigo text; parametros jsonb; duracao text; tolerancia text; tratamento text;
 b operacao.barreira_turno; r operacao.reserva_turno; anterior operacao.requisicao; t cadastro.turno; novo boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e-array['request_id','paciente_id','turno_id','reserva_id','geracao_reserva','versao_esperada','sintese_registro_id','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid; turno:=(e->>'turno_id')::uuid;
  reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz; acao:=a->>'operacao';
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or (turno is null and acao is distinct from 'api.consultar_turno') or inicio is null or fim is null
  or acao is null or acao not in ('api.abrir_turno','api.encerrar_turno','api.consultar_turno')
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
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
   if found and perfil = 'profissional' and sujeito=google.provider_id then
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
 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and valor='true'::jsonb for share;
 autorizado:=autorizado and found;
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
 perform 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=ator and ap.revogada_em is null for share;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- Vínculo e identidade foram travados antes do paciente/barreira.
 perform 1 from cadastro.paciente where id=paciente for update;
 if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 if acao='api.consultar_turno' then
  if not (e ? 'turno_id') then
   -- Consulta atual: só esta forma estrita dispensa UUID. Autor vem do Auth;
   -- identidade, vínculo, flag e locks já foram conferidos antes da consulta.
   if e-array['request_id','paciente_id','atestado']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
   select * into t from cadastro.turno where paciente_id=paciente and profissional_usuario_id=ator and situacao='aberto';
  else
   if turno is null or e-array['request_id','paciente_id','turno_id','atestado']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
   select * into t from cadastro.turno where id=turno and paciente_id=paciente and profissional_usuario_id=ator;
  end if;
  -- Ausente e turno alheio retornam a mesma resposta, sem expor existência.
 elsif acao='api.encerrar_turno' then
  -- Grupo 3 ainda não prova publicação/caso/autoria da síntese. Nunca fechar sem FR-057.
  codigo:='conflito';
 else
  if e-array['request_id','paciente_id','turno_id','reserva_id','geracao_reserva','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb
   or reserva is null or geracao is null or geracao<1 or geracao>9007199254740991
   or jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','')!~'^[1-9][0-9]*$'
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  select * into b from operacao.barreira_turno where ator_usuario_id=ator for update;
  select * into r from operacao.reserva_turno re where re.id=reserva and re.ator_usuario_id=ator and re.epoca=geracao
   and re.paciente_reservado_id=paciente and re.turno_reservada_id=turno and re.versao_esperada=0 for update;
  if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva or b.resultado_pendente is not null
   or r.estado not in ('aberta','confirmada') then codigo:='conflito';
  elsif r.estado='confirmada' and (r.chave_idempotencia is distinct from e->>'chave_idempotencia' or r.digest_idempotencia is distinct from e->>'digest_idempotencia') then codigo:='conflito_idempotencia';
  else
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',turno,1)
    on conflict(ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   novo:=found;
   if not novo then
    select * into anterior from operacao.requisicao re where re.ator_usuario_id=ator and re.operacao=acao and re.chave_idempotencia=e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.resultado_id is distinct from turno or anterior.estado<>'concluida' then codigo:='conflito_idempotencia';
    else
     select * into t from cadastro.turno where id=turno and paciente_id=paciente and profissional_usuario_id=ator;
     if not found then codigo:='conflito_idempotencia'; end if;
    end if;
   else
    -- Ler e travar as três linhas em ordem estável evita snapshot misturado com edição.
    perform 1 from identidade.configuracao_sistema where chave in ('ffcm.turno.duracao_padrao_minutos','ffcm.turno.tolerancia_atraso_minutos','ffcm.turno.tratamento_nao_encerrado') order by chave for share;
    select valor#>>'{}' into duracao from identidade.configuracao_sistema where chave='ffcm.turno.duracao_padrao_minutos';
    select valor#>>'{}' into tolerancia from identidade.configuracao_sistema where chave='ffcm.turno.tolerancia_atraso_minutos';
    select valor#>>'{}' into tratamento from identidade.configuracao_sistema where chave='ffcm.turno.tratamento_nao_encerrado';
    if coalesce(duracao,'')!~'^[1-9][0-9]{0,8}$' or coalesce(tolerancia,'')!~'^(0|[1-9][0-9]{0,8})$' or tratamento is distinct from 'sinalizar_pendencia' then codigo:='conflito';
    else
     parametros:=jsonb_build_object('duracao_padrao_minutos',duracao::integer,'tolerancia_atraso_minutos',tolerancia::integer,'tratamento_nao_encerrado',tratamento);
     begin
      insert into cadastro.turno(id,paciente_id,profissional_usuario_id,parametros) values(turno,paciente,ator,parametros) returning * into t;
     exception when unique_violation then codigo:='conflito'; end;
    end if;
    if codigo is not null then delete from operacao.requisicao where id=anterior.id; end if;
   end if;
   if codigo is null and r.estado='aberta' then
    update operacao.reserva_turno set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,turno_resultado_id=turno where id=reserva;
    if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
   end if;
  end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,acao,'paciente',paciente,case when codigo is null then 'permitido' else 'negado' end,req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA'; end if;
 if codigo is not null then return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req); end if;
 resultado:=case when t.id is null then null else jsonb_build_object('turno_id',t.id,'paciente_id',t.paciente_id,'profissional_usuario_id',t.profissional_usuario_id,'aberto_em',t.aberto_em,'encerrado_em',t.encerrado_em,'situacao',t.situacao,'versao',t.versao,'parametros',t.parametros) end;
 return jsonb_build_object('ok',true,'repeticao',acao='api.abrir_turno' and not novo,'dados',resultado,'request_id',req);
end $$;
