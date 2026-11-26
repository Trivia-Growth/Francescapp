-- Corrige colisão entre nome da tabela e variável em reserva de contato.
-- Composição interna: S-02 e prova da concorrência Auth precedem ativação.
create or replace function operacao.contato_barreira_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid();
 sessao uuid; req uuid; reserva uuid; comando uuid; paciente uuid; epoca bigint;
 inicio timestamptz; fim timestamptz; dominio text; sujeito text; concessao uuid;
 google record; acao text; resposta text; dados jsonb; autorizado boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
  or e - array['request_id','operacao','epoca','reserva_id','comando_id','paciente_id','atestado'] <> '{}'::jsonb then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  epoca:=(e->>'epoca')::bigint; reserva:=(e->>'reserva_id')::uuid; comando:=(e->>'comando_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 acao:=e->>'operacao';
 if ator is null or sessao is null or req is null or inicio is null or fim is null
  or acao not in ('api.reservar_criacao_contato','api.encerrar_criacao_contato','api.consultar_barreira_criacao_contato','api.reconhecer_barreira_criacao_contato')
  or acao is null or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from acao
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if (acao='api.reservar_criacao_contato' and (epoca is null or epoca<1 or reserva is null or comando is not null or paciente is null))
  or (acao='api.encerrar_criacao_contato' and (epoca is null or epoca<1 or comando is null or paciente is not null))
  or (acao='api.consultar_barreira_criacao_contato' and (epoca is not null or reserva is not null or comando is not null or paciente is not null))
  or (acao='api.reconhecer_barreira_criacao_contato' and (epoca is not null or reserva is not null or comando is null or paciente is not null)) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
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
 -- Exceção individual: mesma ordem de bloqueios das demais operações privadas.
 if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id into concessao from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.metodo='tecnica' and c.perfil='administrador' for share;
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
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- Reserva bloqueia paciente antes da barreira, como a criação de contato.
 if acao='api.reservar_criacao_contato' then
  perform 1 from cadastro.paciente p where p.id=paciente for key share;
 end if;
 -- A espera pelo bloqueio não pode estender a validade do atestado.
 insert into operacao.barreira_criacao_contato(ator_usuario_id) values(ator) on conflict do nothing;
 perform 1 from operacao.barreira_criacao_contato where ator_usuario_id=ator for update;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.consultar_barreira_criacao_contato' then
  dados:=operacao.consultar_barreira_criacao_contato_privado(req);
 elsif acao='api.reconhecer_barreira_criacao_contato' then
  resposta:=operacao.reconhecer_barreira_criacao_contato_privado(comando,req);
 elsif acao='api.reservar_criacao_contato' then
  resposta:=operacao.reservar_criacao_contato_privado(ator,epoca,reserva,paciente);
 else
  resposta:=operacao.encerrar_criacao_contato_privado(ator,epoca,reserva,comando);
 end if;
 if acao in ('api.reservar_criacao_contato','api.encerrar_criacao_contato') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'requisicao',null,case when resposta in ('aberta','confirmada','cancelada','vazia') then 'permitido' else 'negado' end,req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',coalesce(dados,jsonb_build_object('estado',resposta)),'request_id',req);
end $$;
