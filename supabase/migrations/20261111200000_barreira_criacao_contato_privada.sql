-- Preparação privada: contratos, autorização e provas integradas ainda pendentes. Não ativar.
-- Contrato privado: chamador deve autorizar e auditar reserva/reconciliação na mesma transação. Sem grants de aplicação.
-- Núcleo privado da barreira de criação de contato. Não é endpoint nem autorização:
-- o chamador futuro deve verificar JWT/Auth nativo, concessão, atestado e
-- auditar a operação na mesma transação. Sem grants até revisão S-02.
create table operacao.barreira_criacao_contato (
  ator_usuario_id uuid primary key references public.usuario(id),
  epoca bigint not null default 1 check (epoca > 0),
  reserva_atual uuid,
  resultado_pendente uuid
);
create table operacao.reserva_criacao_contato (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  estado text not null check (estado in ('aberta','confirmada','cancelada')),
  chave_idempotencia text,
  digest_idempotencia text,
  paciente_id uuid references cadastro.paciente(id),
  contato_resultado_id uuid references cadastro.contato_paciente(id),
  paciente_reservado_id uuid not null references cadastro.paciente(id),
  check ((estado = 'confirmada') = (contato_resultado_id is not null)),
  check ((estado = 'confirmada' and chave_idempotencia is not null and digest_idempotencia is not null)
    or (estado <> 'confirmada' and chave_idempotencia is null and digest_idempotencia is null))
);
create table operacao.recibo_barreira_criacao_contato (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  reserva_id uuid,
  resultado text not null check (resultado in ('vazia','cancelada','confirmada'))
);
alter table operacao.barreira_criacao_contato enable row level security;
alter table operacao.reserva_criacao_contato enable row level security;
alter table operacao.recibo_barreira_criacao_contato enable row level security;
revoke all on operacao.barreira_criacao_contato, operacao.reserva_criacao_contato, operacao.recibo_barreira_criacao_contato from public, anon, authenticated, service_role;

-- Primitivas SECURITY INVOKER, sem privilégios para aplicação. O ator deve vir
-- de auth_privado.uid() e ser autorizado pelo chamador, nunca de entrada do navegador.
create function operacao.reservar_criacao_contato_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_paciente uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_criacao_contato; r operacao.reserva_criacao_contato;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_reserva is null or p_paciente is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 -- Mesma ordem da gravação: paciente antes da barreira. A FK posterior não pode inverter locks.
 perform 1 from cadastro.paciente where id=p_paciente for key share;
 if not found then return 'negada'; end if;
 insert into operacao.barreira_criacao_contato(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_criacao_contato where ator_usuario_id=p_ator for update;
 select * into r from operacao.reserva_criacao_contato where id=p_reserva;
 if found then
  if r.ator_usuario_id=p_ator and r.epoca=p_epoca and r.paciente_reservado_id=p_paciente then return r.estado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca then return 'epoca_antiga'; end if;
 if b.reserva_atual is not null or b.resultado_pendente is not null then return 'bloqueada'; end if;
 insert into operacao.reserva_criacao_contato(id,ator_usuario_id,epoca,estado,paciente_reservado_id) values(p_reserva,p_ator,p_epoca,'aberta',p_paciente) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 update operacao.barreira_criacao_contato set reserva_atual=p_reserva where ator_usuario_id=p_ator;
 return 'aberta';
end $$;

create function operacao.encerrar_criacao_contato_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_comando uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_criacao_contato; r operacao.reserva_criacao_contato; c operacao.recibo_barreira_criacao_contato; resultado text;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_comando is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_criacao_contato(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_criacao_contato where ator_usuario_id=p_ator for update;
 select * into c from operacao.recibo_barreira_criacao_contato where id=p_comando;
 if found then
  if c.ator_usuario_id=p_ator and c.epoca=p_epoca and c.reserva_id is not distinct from p_reserva then return c.resultado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca or b.reserva_atual is distinct from p_reserva or b.resultado_pendente is not null then return 'conflito'; end if;
 if p_reserva is null then resultado:='vazia';
 else
  select * into r from operacao.reserva_criacao_contato where id=p_reserva and ator_usuario_id=p_ator and epoca=p_epoca for update;
  if not found or r.estado not in ('aberta','confirmada') then return 'conflito'; end if;
  resultado:=case when r.estado='aberta' then 'cancelada' else 'confirmada' end;
 end if;
 insert into operacao.recibo_barreira_criacao_contato values(p_comando,p_ator,p_epoca,p_reserva,resultado) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 if p_reserva is not null then
  update operacao.reserva_criacao_contato set estado=resultado where id=p_reserva;
 end if;
 update operacao.barreira_criacao_contato set epoca=epoca+1,reserva_atual=null,
   resultado_pendente=case when p_reserva is null then null else p_comando end where ator_usuario_id=p_ator;
 return resultado;
end $$;
revoke all on function operacao.reservar_criacao_contato_privado(uuid,bigint,uuid,uuid), operacao.encerrar_criacao_contato_privado(uuid,bigint,uuid,uuid) from public, anon, authenticated, service_role;

-- Primitivas privadas: o chamador deve validar sessão e autorização vigentes
-- na mesma transação. auth_privado.uid() identifica o ator, mas não autoriza acesso.
create function operacao.consultar_barreira_criacao_contato_privado(p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_criacao_contato; r operacao.reserva_criacao_contato; c operacao.recibo_barreira_criacao_contato; resultado jsonb;
begin
 if ator is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 -- Serializa consulta inicial com primeira reserva ainda não confirmada.
 insert into operacao.barreira_criacao_contato(ator_usuario_id) values(ator) on conflict do nothing;
 select * into b from operacao.barreira_criacao_contato where ator_usuario_id=ator for update;
 if not found then resultado:=jsonb_build_object('epoca',1,'reserva',null,'resultado_pendente',null);
 else
  if b.reserva_atual is not null and b.resultado_pendente is not null then raise exception 'BARREIRA_INVALIDA'; end if;
  if b.reserva_atual is not null then
   select * into strict r from operacao.reserva_criacao_contato where id=b.reserva_atual and ator_usuario_id=ator and epoca=b.epoca;
  end if;
  if b.resultado_pendente is not null then
   select * into strict c from operacao.recibo_barreira_criacao_contato where id=b.resultado_pendente and ator_usuario_id=ator and epoca=b.epoca-1;
   if c.reserva_id is null or c.resultado not in ('cancelada','confirmada') then raise exception 'RECIBO_INVALIDO'; end if;
   select * into strict r from operacao.reserva_criacao_contato where id=c.reserva_id and ator_usuario_id=ator and epoca=c.epoca and estado=c.resultado;
  end if;
  resultado:=jsonb_build_object('epoca',b.epoca,
   'reserva',case when b.reserva_atual is null then null else jsonb_build_object('id',r.id,'estado',r.estado) end,
   'resultado_pendente',case when b.resultado_pendente is null then null else jsonb_build_object('recibo_id',c.id,'reserva_id',r.id,'resultado',c.resultado,'paciente_id',r.paciente_reservado_id,'contato_id',r.contato_resultado_id) end);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.consultar_barreira_criacao_contato','requisicao',null,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return resultado;
end $$;

create function operacao.reconhecer_barreira_criacao_contato_privado(p_recibo uuid,p_request uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_criacao_contato; c operacao.recibo_barreira_criacao_contato;
begin
 if ator is null or p_recibo is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 select * into b from operacao.barreira_criacao_contato where ator_usuario_id=ator for update;
 select * into c from operacao.recibo_barreira_criacao_contato where id=p_recibo and ator_usuario_id=ator and reserva_id is not null and resultado in ('cancelada','confirmada');
 if not found or b.ator_usuario_id is null or c.epoca>=b.epoca then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,'api.reconhecer_barreira_criacao_contato','requisicao',null,'negado',p_request);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return 'conflito';
 end if;
 if b.resultado_pendente=p_recibo then
  update operacao.barreira_criacao_contato set resultado_pendente=null where ator_usuario_id=ator;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.reconhecer_barreira_criacao_contato','requisicao',p_recibo,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return 'reconhecido';
end $$;
revoke all on function operacao.consultar_barreira_criacao_contato_privado(uuid), operacao.reconhecer_barreira_criacao_contato_privado(uuid,uuid) from public,anon,authenticated,service_role;


-- A escrita valida e confirma a reserva na mesma transação, após bloquear o paciente.
-- Preparação privada. Sem grants de aplicação; exige revisão S-02 e provas reais antes de exposição.
create or replace function operacao.criar_contato_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; contato uuid; auditoria_id uuid; reserva uuid; geracao bigint;
 b operacao.barreira_criacao_contato; reserva_atual operacao.reserva_criacao_contato;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false; anterior operacao.requisicao; resultado jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','contato_id','reserva_id','geracao_reserva','auditoria_id','chave_idempotencia','digest_idempotencia','tipo','valor','aad','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  contato:=(e->>'contato_id')::uuid; reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint; auditoria_id:=(e->>'auditoria_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or contato is null or auditoria_id is null
  or reserva is null or geracao is null or geracao<1 or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.criar_contato_paciente'
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
    values(gen_random_uuid(),ator,'api.criar_contato_paciente','contato',contato,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','') !~ '^[1-9][0-9]*$'
  or e->>'tipo' not in ('email','telefone') or e->>'tipo' is null
  or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',contato::text,'campo','valor','formato',1)
  or jsonb_typeof(e->'valor') is distinct from 'object' or (e->'valor')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
  or e->'valor'->'formato' is distinct from '1'::jsonb
  or jsonb_typeof(e->'valor'->'key_id') is distinct from 'string' or coalesce(length(e->'valor'->>'key_id') between 1 and 128,false) is not true
  or jsonb_typeof(e->'valor'->'nonce') is distinct from 'string' or coalesce(e->'valor'->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
  or jsonb_typeof(e->'valor'->'tag') is distinct from 'string' or coalesce(e->'valor'->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
  or jsonb_typeof(e->'valor'->'ciphertext') is distinct from 'string' or coalesce(length(e->'valor'->>'ciphertext') between 1 and 32768 and e->'valor'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256,false) is not true
  or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 perform 1 from cadastro.paciente where id=paciente for update;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.criar_contato_paciente','contato',contato,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 select * into b from operacao.barreira_criacao_contato where ator_usuario_id=ator for update;
 select * into reserva_atual from operacao.reserva_criacao_contato re where re.id=reserva and re.ator_usuario_id=ator and re.epoca=geracao and re.paciente_reservado_id=paciente for update;
 if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva
  or b.resultado_pendente is not null or reserva_atual.estado not in ('aberta','confirmada') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.criar_contato_paciente','contato',contato,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.criar_contato_paciente' and r.chave_idempotencia=e->>'chave_idempotencia';
 repeticao:=found;
 if (reserva_atual.estado='aberta' and repeticao) or (reserva_atual.estado='confirmada' and
  (not repeticao or reserva_atual.chave_idempotencia is distinct from e->>'chave_idempotencia' or reserva_atual.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_atual.contato_resultado_id is distinct from anterior.resultado_id)) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.criar_contato_paciente','contato',contato,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
 end if;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values(gen_random_uuid(),ator,'api.criar_contato_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','registrada',contato,1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
 if not found then
  select * into anterior from operacao.requisicao where ator_usuario_id=ator and operacao='api.criar_contato_paciente' and chave_idempotencia=e->>'chave_idempotencia';
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
   or not exists(select 1 from cadastro.contato_paciente c where c.id=anterior.resultado_id and c.paciente_id=paciente) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_contato_paciente','contato',contato,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  contato:=anterior.resultado_id;
  repeticao:=true;
 else
  insert into cadastro.contato_paciente(id,paciente_id,tipo,valor_cifrado) values(contato,paciente,e->>'tipo',e->'valor');
  update operacao.requisicao set estado='concluida' where id=anterior.id and estado='registrada';
  if not found then raise exception using errcode='P0002',message='LEDGER_NAO_FINALIZADO'; end if;
 end if;
 if reserva_atual.estado='aberta' then
  update operacao.reserva_criacao_contato set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,contato_resultado_id=contato where id=reserva;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.criar_contato_paciente','contato',contato,'permitido',req);
 select jsonb_build_object('paciente_id',p.id,'nome',p.nome_cifrado,'nome_preferencia',p.nome_preferencia_cifrado,'data_nascimento',p.data_nascimento_cifrada,'versao',p.versao,
  'contatos',coalesce((select jsonb_agg(jsonb_build_object('contato_id',c.id,'tipo',c.tipo,'valor',c.valor_cifrado,'versao',c.versao) order by c.criado_em,c.id) from cadastro.contato_paciente c where c.paciente_id=p.id),'[]'::jsonb))
  into resultado from cadastro.paciente p where p.id=paciente;
 if resultado is null then raise exception using errcode='P0002',message='PACIENTE_NAO_PROJETADO'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;
revoke all on function operacao.criar_contato_paciente_privado(jsonb) from public,anon,authenticated,service_role;

-- Somente o wrapper privado de criação recebe acesso às próprias reservas.
-- UPDATE na barreira é necessário ao SELECT FOR UPDATE; a policy impede alteração.
grant select, update (epoca) on operacao.barreira_criacao_contato to ffcmapp_contato_owner;
grant select, update (estado, chave_idempotencia, digest_idempotencia, paciente_id, contato_resultado_id)
 on operacao.reserva_criacao_contato to ffcmapp_contato_owner;
create policy contato_barreira_select on operacao.barreira_criacao_contato for select to ffcmapp_contato_owner
 using (ator_usuario_id=(select auth_privado.uid()));
create policy contato_barreira_lock on operacao.barreira_criacao_contato for update to ffcmapp_contato_owner
 using (ator_usuario_id=(select auth_privado.uid())) with check (false);
create policy contato_reserva_select on operacao.reserva_criacao_contato for select to ffcmapp_contato_owner
 using (ator_usuario_id=(select auth_privado.uid()));
create policy contato_reserva_update on operacao.reserva_criacao_contato for update to ffcmapp_contato_owner
 using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
