-- FR-026/FR-028: carteira filtrável por responsável, situação, revisão e pendências, com
-- sinal operacional por caso.
--
-- O que muda em `identidade.listar_carteira_privada`:
--
-- 1. A entrada aceita `filtros` (objeto opcional com `responsavel`, `situacao`, `revisao` e
--    `pendencia`). Filtrar passa a acontecer no banco, antes da paginação. Até aqui a
--    interface só sabia buscar por nome dentro da página já carregada, o que nunca foi um
--    filtro de carteira.
-- 2. Cada item passa a trazer `sinal`: estado operacional e os motivos visíveis que o
--    produziram. O cálculo é o mesmo de `cadastro.sinal_operacional_caso`, usado também
--    pela fatia de pendências — uma definição só, dois chamadores.
-- 3. `responsavel` e `situacao` só existem no ramo do Administrador, porque é só ali que a
--    policy `acompanhamento_leitura_carteira` libera `cadastro.acompanhamento_caso`. No
--    ramo do Profissional os dois filtros são recusados como entrada inválida, em vez de
--    serem silenciosamente ignorados e devolverem uma lista que não corresponde ao pedido.
--
-- FR-028 no modelo: `sinal.estado` só resume compromisso operacional. 'em_dia' significa
-- compromisso operacional em dia e nunca ausência de risco clínico; 'informacao_insuficiente'
-- é o estado de quem ainda não tem periodicidade acordada, e tem motivo visível como os
-- demais. Nenhuma sinalização clínica entra neste cálculo.
--
-- Custo: o sinal é calculado por caso avaliado na página. Com filtro de revisão ou de
-- pendência a avaliação alcança mais linhas do que a página devolve. É aceitável no volume
-- atual de uma carteira; se deixar de ser, a materialização do sinal é a saída, e ela exige
-- medição antes, não suposição.
--
-- Reversão: reaplicar a definição de 20261113110000 e revogar o grant abaixo.

grant select (responsavel_usuario_id) on cadastro.acompanhamento_caso to ffcmapp_carteira_owner;

grant ffcmapp_sinal_operacional_owner to current_user with inherit false, set true;
set role ffcmapp_sinal_operacional_owner;
grant execute on function cadastro.sinal_operacional_caso(uuid) to ffcmapp_carteira_owner;
reset role;
revoke ffcmapp_sinal_operacional_owner from current_user;

select set_config('ffcmapp.migrador_carteira_filtros', current_user, false);
select set_config('ffcmapp.carteira_filtros_tinha_owner', pg_has_role(current_user, 'ffcmapp_carteira_owner', 'SET')::text, false);
select set_config('ffcmapp.carteira_filtros_tinha_create', has_schema_privilege('ffcmapp_carteira_owner','identidade','CREATE')::text, false);
do $$ begin
 if current_setting('ffcmapp.carteira_filtros_tinha_owner')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_carteira_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_carteira_owner to %I with inherit false, set true granted by %I', current_user, current_user);
 end if;
 if current_setting('ffcmapp.carteira_filtros_tinha_create')='false' then grant create on schema identidade to ffcmapp_carteira_owner; end if;
end $$;
set role ffcmapp_carteira_owner;
-- Resumo do sinal para a lista: estado e, no máximo, três motivos visíveis. A lista não
-- recebe a pendência inteira — quem precisa do detalhe abre o caso, onde a fatia de
-- pendências autoriza de novo. Sem motivo não há sinal: FR-026 exige motivo visível.
create or replace function identidade.resumir_sinal_carteira(p_sinal jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'estado', p_sinal->>'estado',
  'motivos', coalesce((select jsonb_agg(m order by m) from (
    select p->>'motivo' m from jsonb_array_elements(p_sinal->'pendencias') p
    where p->>'estado' <> 'resolvida' order by p->>'motivo' limit 3) t),
   case when p_sinal->>'estado'='informacao_insuficiente'
    then jsonb_build_array('Periodicidade de acompanhamento ainda não acordada para este caso.')
    else jsonb_build_array('Nenhum compromisso operacional em atraso.') end));
$$;
revoke all on function identidade.resumir_sinal_carteira(jsonb) from public, anon, authenticated, service_role;

create or replace function identidade.listar_carteira_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text; google record;
 dominio text; limite integer; cursor_id uuid; cursor_criado timestamptz; pagina jsonb; autorizado boolean:=false;
 filtros jsonb; f_responsavel text; f_situacao text; f_revisao text; f_pendencia text; f_responsavel_id uuid;
 -- Sem filtro, a página é cortada antes de calcular o sinal e o custo é o de hoje. Com
 -- filtro, `limit null` desliga o corte antecipado porque a página só é conhecida depois.
 corte integer;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
   or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
   or jsonb_typeof(e) is distinct from 'object' or e - array['request_id','limite','cursor','filtros','atestado'] <> '{}'::jsonb
   or jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(e->'limite') is distinct from 'number'
   or coalesce(e->>'limite','') !~ '^(100|[1-9][0-9]?)$'
   or (e ? 'cursor' and jsonb_typeof(e->'cursor') is distinct from 'string')
   or (e ? 'filtros' and jsonb_typeof(e->'filtros') is distinct from 'object') then
   raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 filtros:=coalesce(e->'filtros','{}'::jsonb);
 if filtros - array['responsavel','situacao','revisao','pendencia'] <> '{}'::jsonb then
   raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 f_responsavel:=filtros->>'responsavel'; f_situacao:=filtros->>'situacao';
 f_revisao:=filtros->>'revisao'; f_pendencia:=filtros->>'pendencia';
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  limite:=(e->>'limite')::integer; if e ? 'cursor' then cursor_id:=(e->>'cursor')::uuid; end if;
  if f_responsavel is not null and f_responsavel<>'nenhum' then f_responsavel_id:=f_responsavel::uuid; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or inicio is null or fim is null
   or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
   or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from 'api.listar_pacientes'
   or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
   or (f_situacao is not null and f_situacao not in ('entrada','ativo','pausado','encerrado','transferido','a_completar'))
   or (f_revisao is not null and f_revisao not in ('vencida','proxima','sem_data'))
   or (f_pendencia is not null and f_pendencia not in ('abertas','nenhuma'))
   or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id,c.perfil into concessao,perfil from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.metodo='tecnica' and c.subject_google is null for share;
  if found and perfil in ('administrador','profissional') then
   perform 1 from identidade.excecao_tecnica x where x.usuario_id=ator and x.concessao_id=concessao for share;
   if found then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
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
 else
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
 end if;
 -- Responsável e situação vivem em cadastro.acompanhamento_caso, que só o ramo do
 -- Administrador enxerga. Pedir esses filtros fora dele é entrada inválida, nunca um
 -- resultado silenciosamente diferente do pedido.
 if autorizado and perfil<>'administrador' and (f_responsavel is not null or f_situacao is not null) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if autorizado and cursor_id is not null then
  if perfil='profissional' then
   perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=cursor_id and x.revogada_em is null for share;
   autorizado:=found;
  end if;
  if autorizado then
   select p.criado_em into cursor_criado from cadastro.paciente p where p.id=cursor_id;
   autorizado:=found;
  end if;
 end if;
 corte:=case when f_responsavel is null and f_situacao is null and f_revisao is null and f_pendencia is null
   then limite+1 end;
 if autorizado and perfil='administrador' then
  with s as (select p.id,p.criado_em,p.nome_cifrado,p.nome_preferencia_cifrado,p.versao from cadastro.paciente p
    where cursor_id is null or (p.criado_em,p.id)>(cursor_criado,cursor_id) order by p.criado_em,p.id limit corte),
   c as (select s.*,v.situacao,v.responsavel_usuario_id from s left join lateral (select ac.situacao,ac.responsavel_usuario_id from cadastro.acompanhamento_caso ac
    where ac.paciente_id=s.id order by ac.versao desc limit 1) v on true),
   g as (select c.*,cadastro.sinal_operacional_caso(c.id) sinal from c
    where (f_situacao is null
      or (f_situacao='a_completar' and c.situacao is null)
      or c.situacao=f_situacao)
     and (f_responsavel is null
      or (f_responsavel='nenhum' and c.responsavel_usuario_id is null)
      or c.responsavel_usuario_id=f_responsavel_id)),
   d as (select g.*,
     (select min((p->>'desde')::date) from jsonb_array_elements(g.sinal->'pendencias') p
       where p->>'tipo'='revisao_proxima' and p->>'estado'<>'resolvida') revisao_aberta,
     (g.sinal#>>'{acordo,proxima_revisao_em}')::date revisao_acordada,
     exists(select 1 from jsonb_array_elements(g.sinal->'pendencias') p where p->>'estado'<>'resolvida') tem_pendencia
    from g),
   fl as (select d.* from d
    where (f_pendencia is null or (f_pendencia='abertas')=d.tem_pendencia)
     and (f_revisao is null
      or (f_revisao='sem_data' and d.revisao_acordada is null)
      or (f_revisao='vencida' and d.revisao_acordada is not null and d.revisao_acordada<current_date)
      or (f_revisao='proxima' and d.revisao_acordada is not null and d.revisao_acordada>=current_date and d.revisao_aberta is not null))
    order by d.criado_em,d.id limit limite+1),
   n as (select *,row_number() over(order by criado_em,id) ordem from fl)
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('paciente_id',id,'nome',nome_cifrado,'nome_preferencia',nome_preferencia_cifrado,'versao',versao,'situacao',situacao,'responsavel_usuario_id',responsavel_usuario_id,'sinal',identidade.resumir_sinal_carteira(sinal)) order by criado_em,id) filter(where ordem<=limite),'[]'::jsonb),
   'proximo_cursor',case when count(*)>limite then max(id::text) filter(where ordem=limite) end) into pagina from n;
 elsif autorizado then
  with s as (select p.id,p.criado_em,p.nome_cifrado,p.nome_preferencia_cifrado,p.versao from cadastro.paciente p join cadastro.acesso_paciente x on x.paciente_id=p.id
    where x.usuario_id=ator and x.revogada_em is null and (cursor_id is null or (p.criado_em,p.id)>(cursor_criado,cursor_id))
    order by p.criado_em,p.id limit corte for share of x),
   g as (select s.*,cadastro.sinal_operacional_caso(s.id) sinal from s),
   d as (select g.*,
     (select min((p->>'desde')::date) from jsonb_array_elements(g.sinal->'pendencias') p
       where p->>'tipo'='revisao_proxima' and p->>'estado'<>'resolvida') revisao_aberta,
     (g.sinal#>>'{acordo,proxima_revisao_em}')::date revisao_acordada,
     exists(select 1 from jsonb_array_elements(g.sinal->'pendencias') p where p->>'estado'<>'resolvida') tem_pendencia
    from g),
   fl as (select d.* from d
    where (f_pendencia is null or (f_pendencia='abertas')=d.tem_pendencia)
     and (f_revisao is null
      or (f_revisao='sem_data' and d.revisao_acordada is null)
      or (f_revisao='vencida' and d.revisao_acordada is not null and d.revisao_acordada<current_date)
      or (f_revisao='proxima' and d.revisao_acordada is not null and d.revisao_acordada>=current_date and d.revisao_aberta is not null))
    order by d.criado_em,d.id limit limite+1),
   n as (select *,row_number() over(order by criado_em,id) ordem from fl)
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('paciente_id',id,'nome',nome_cifrado,'nome_preferencia',nome_preferencia_cifrado,'versao',versao,'sinal',identidade.resumir_sinal_carteira(sinal)) order by criado_em,id) filter(where ordem<=limite),'[]'::jsonb),
   'proximo_cursor',case when count(*)>limite then max(id::text) filter(where ordem=limite) end) into pagina from n;
 end if;
 autorizado:=autorizado and fim>clock_timestamp() and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()));
 -- Usuário Auth ainda não admitido não possui perfil na aplicação. Mantém sua
 -- identidade real na auditoria, sem inventar usuário ou operador de serviço.
 if exists(select 1 from public.usuario u where u.id = ator) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,case when autorizado then 'permitido' else 'negado' end,req);
 else
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',req);
 end if;
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if not autorizado then return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req); end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',pagina,'request_id',req);
end $$;

reset role;
select set_config('role',current_setting('ffcmapp.migrador_carteira_filtros'),false);
do $$ begin
 if current_setting('ffcmapp.carteira_filtros_tinha_create')='false' then revoke create on schema identidade from ffcmapp_carteira_owner; end if;
 if current_setting('ffcmapp.carteira_filtros_tinha_owner')='false' then execute format('revoke ffcmapp_carteira_owner from %I granted by %I', current_user, current_user); end if;
end $$;
