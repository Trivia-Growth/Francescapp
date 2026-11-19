-- FR-072 (19/11/2026): avisos no aplicativo, como PROJEÇÃO dos quatro eventos confirmados
-- em 0.5 de `openspec/changes/pwa-e-avisos-no-app/tasks.md`. Não existe tabela de
-- notificação com título ou corpo gravados (design D6): o único dado persistido aqui é a
-- marca de leitura por pessoa (design D7), que não é ciência e não encerra pendência.
--
-- Origens projetadas, todas já existentes no banco:
--   FR-057 passagem pendente de ciência -> cadastro.diario_turno_destinatario sem linha
--          correspondente em cadastro.diario_ciencia_turno (20261125140000).
--   FR-027 pendência por atraso        -> cadastro.sinal_operacional_caso(uuid), campo
--          `pendencias` com estado <> 'resolvida' (20261118300000).
--   FR-028 sinalização                 -> cadastro.sinal_operacional_caso(uuid), campo
--          `estado` = 'atencao_operacional' (20261118300000).
--   FR-014 relato marcado como atenção -> última versão de cadastro.diario_registro_versao
--          com atencao, publicada/retificada e ainda sem tarefa (20261118200000).
--
-- ACHADO REGISTRADO (não corrigido aqui): 0.5 chama FR-028 de "sinalização clínica", mas
-- 20261118300000 declara explicitamente que o sinal é OPERACIONAL e que nenhuma
-- sinalização clínica entra no cálculo. Esta migração projeta o que existe — o sinal
-- operacional — e não inventa classificação clínica.
--
-- SUPOSIÇÃO CONSERVADORA (não decidida pelo solicitante): o aviso NÃO carrega texto de
-- conteúdo do caso. O único texto projetado é o `motivo` da pendência de FR-027, que o
-- próprio derivador gera a partir de datas e já é exibido na carteira para a mesma
-- audiência. Relato em atenção e passagem viajam só como referência (tipo, caso, chave,
-- instante): o teor fica na origem, onde a autorização é verificada de novo.
--
-- SUPOSIÇÃO CONSERVADORA: o repasse por substituição (FR-037) alcança os avisos cujo
-- destinatário é o titular do caso, inclusive passagem de turno dirigida a ele. Substituir
-- NÃO concede acesso: o filtro de audiência (cadastro.acesso_paciente vigente) é aplicado
-- ao leitor antes de qualquer projeção, então quem não tem acesso ao caso não vê nada.
--
-- Reversão: remover api.avisos_privado, operacao.avisos_privada, cadastro.avisos_pessoa,
-- cadastro.aviso_leitura e o papel ffcmapp_avisos_owner. Nenhum objeto de outra fatia é
-- redefinido aqui. Preparação local, sem operação remota.

-- Marca de leitura: por pessoa, append-only, separada de qualquer registro de ciência.
-- Não tem texto, não tem conteúdo e não guarda o aviso — guarda só que alguém já o viu.
create table cadastro.aviso_leitura (
  usuario_id uuid not null references public.usuario (id) on delete no action,
  tipo text not null check (tipo in (
    'passagem_sem_ciencia', 'pendencia_operacional', 'sinal_atencao_operacional', 'relato_em_atencao'
  )),
  chave_origem text not null check (length(chave_origem) between 1 and 200),
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  lido_em timestamptz not null default clock_timestamp(),
  primary key (usuario_id, tipo, chave_origem)
);
alter table cadastro.aviso_leitura enable row level security;
alter table cadastro.aviso_leitura force row level security;
revoke all on cadastro.aviso_leitura from public, anon, authenticated, service_role;

create function cadastro.aviso_leitura_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'REGISTRO_IMUTAVEL';
end $$;
revoke all on function cadastro.aviso_leitura_imutavel() from public, anon, authenticated, service_role;
create trigger aviso_leitura_imutavel before update or delete on cadastro.aviso_leitura
  for each row execute function cadastro.aviso_leitura_imutavel();

-- Papel dono da fatia: nologin, nobypassrls, noinherit, sem membros.
create role ffcmapp_avisos_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_avisos_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_avisos_owner;
grant usage on schema public, cadastro, identidade, operacao, auditoria, auth_privado, bloqueios_auth
  to ffcmapp_avisos_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(),
  auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_avisos_owner;
-- Regra de liderança: fonte única de FR-037, concedida pelo dono da função.
grant execute on function cadastro.case_manager_atual(uuid) to ffcmapp_avisos_owner;
-- Derivador do sinal operacional: pertence a outro papel, exige assumi-lo para conceder.
grant ffcmapp_sinal_operacional_owner to current_user with inherit false, set true;
set role ffcmapp_sinal_operacional_owner;
grant execute on function cadastro.sinal_operacional_caso(uuid) to ffcmapp_avisos_owner;
reset role;
revoke ffcmapp_sinal_operacional_owner from current_user;

-- `for share`/`for update` exigem UPDATE além de SELECT; a coluna inócua vem acompanhada
-- de policy `_lock` com `with check (false)`, que impede escrita real.
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace)
  on identidade.configuracao_auth_nativo to ffcmapp_avisos_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_avisos_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao)
  on identidade.concessao_equipe to ffcmapp_avisos_owner;
grant select (usuario_id, concessao_id), update (concessao_id)
  on identidade.excecao_tecnica to ffcmapp_avisos_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em),
  update (revogada_em) on identidade.sessao to ffcmapp_avisos_owner;
grant select (id) on cadastro.paciente to ffcmapp_avisos_owner;
grant select (paciente_id, usuario_id, revogada_em) on cadastro.acesso_paciente to ffcmapp_avisos_owner;
grant select (turno_destinatario_id, turno_origem_id, versao_passagem_origem, paciente_id, usuario_id)
  on cadastro.diario_turno_destinatario to ffcmapp_avisos_owner;
grant select (turno_destinatario_id) on cadastro.diario_ciencia_turno to ffcmapp_avisos_owner;
grant select (turno_id, versao_passagem, publicado_em) on cadastro.diario_turno_passagem to ffcmapp_avisos_owner;
grant select (id, paciente_id) on cadastro.diario_registro to ffcmapp_avisos_owner;
-- Nenhuma coluna de conteúdo: `conteudo_cifrado` e `justificativa_cifrada` ficam de fora
-- de propósito, e é isso que impede o aviso de carregar teor clínico.
grant select (id, diario_registro_id, versao, estado, audiencia, atencao, tarefa_id, criado_em)
  on cadastro.diario_registro_versao to ffcmapp_avisos_owner;
grant select, insert, delete on operacao.requisicao to ffcmapp_avisos_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id)
  on auditoria.evento to ffcmapp_avisos_owner;
grant select (usuario_id, tipo, chave_origem, paciente_id, lido_em),
  insert (usuario_id, tipo, chave_origem, paciente_id)
  on cadastro.aviso_leitura to ffcmapp_avisos_owner;

create policy avisos_config_select on identidade.configuracao_auth_nativo for select to ffcmapp_avisos_owner using (true);
create policy avisos_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_avisos_owner using (true) with check (false);
create policy avisos_usuario_select on public.usuario for select to ffcmapp_avisos_owner using (true);
create policy avisos_usuario_lock on public.usuario for update to ffcmapp_avisos_owner using (true) with check (false);
create policy avisos_concessao_select on identidade.concessao_equipe for select to ffcmapp_avisos_owner using (true);
create policy avisos_concessao_lock on identidade.concessao_equipe for update to ffcmapp_avisos_owner using (true) with check (false);
create policy avisos_excecao_select on identidade.excecao_tecnica for select to ffcmapp_avisos_owner using (usuario_id = (select auth_privado.uid()));
create policy avisos_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_avisos_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy avisos_sessao_select on identidade.sessao for select to ffcmapp_avisos_owner using (usuario_id = (select auth_privado.uid()));
create policy avisos_sessao_lock on identidade.sessao for update to ffcmapp_avisos_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy avisos_paciente_select on cadastro.paciente for select to ffcmapp_avisos_owner using (true);
-- FILTRO DE AUDIÊNCIA NO BANCO: este papel só enxerga concessões vigentes de quem está
-- autenticado. Revogar apaga a linha do leitor da visão, sem precisar apagar aviso nenhum.
create policy avisos_acesso_select on cadastro.acesso_paciente for select to ffcmapp_avisos_owner
  using (revogada_em is null);
create policy avisos_destinatario_select on cadastro.diario_turno_destinatario for select to ffcmapp_avisos_owner
  using (exists(select 1 from cadastro.acesso_paciente a
    where a.paciente_id = diario_turno_destinatario.paciente_id
      and a.usuario_id = (select auth_privado.uid()) and a.revogada_em is null));
create policy avisos_ciencia_select on cadastro.diario_ciencia_turno for select to ffcmapp_avisos_owner using (true);
create policy avisos_passagem_select on cadastro.diario_turno_passagem for select to ffcmapp_avisos_owner
  using (exists(select 1 from cadastro.acesso_paciente a
    where a.paciente_id = diario_turno_passagem.paciente_id
      and a.usuario_id = (select auth_privado.uid()) and a.revogada_em is null));
create policy avisos_registro_select on cadastro.diario_registro for select to ffcmapp_avisos_owner
  using (exists(select 1 from cadastro.acesso_paciente a
    where a.paciente_id = diario_registro.paciente_id
      and a.usuario_id = (select auth_privado.uid()) and a.revogada_em is null));
create policy avisos_registro_versao_select on cadastro.diario_registro_versao for select to ffcmapp_avisos_owner
  using (exists(select 1 from cadastro.diario_registro r
    join cadastro.acesso_paciente a on a.paciente_id = r.paciente_id
    where r.id = diario_registro_versao.diario_registro_id
      and a.usuario_id = (select auth_privado.uid()) and a.revogada_em is null));
create policy avisos_requisicao_todos on operacao.requisicao for all to ffcmapp_avisos_owner
  using (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.marcar_aviso_lido')
  with check (ator_usuario_id = (select auth_privado.uid()) and operacao = 'api.marcar_aviso_lido');
create policy avisos_auditoria_insert on auditoria.evento for insert to ffcmapp_avisos_owner with check (true);
-- Lido é do leitor e de mais ninguém: nem leitura nem escrita alcançam a marca de outra pessoa.
create policy avisos_leitura_select on cadastro.aviso_leitura for select to ffcmapp_avisos_owner
  using (usuario_id = (select auth_privado.uid()));
create policy avisos_leitura_insert on cadastro.aviso_leitura for insert to ffcmapp_avisos_owner
  with check (usuario_id = (select auth_privado.uid())
    and exists(select 1 from cadastro.acesso_paciente a
      where a.paciente_id = aviso_leitura.paciente_id
        and a.usuario_id = (select auth_privado.uid()) and a.revogada_em is null));

-- PROJEÇÃO. Não grava nada, não autoriza nada e não decifra nada: devolve referências aos
-- quatro eventos de origem para a pessoa autenticada. Executa como `invoker`, então as
-- policies acima — inclusive o filtro de audiência — valem de verdade dentro dela.
create function cadastro.avisos_pessoa(p_usuario uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
with acesso as (
  select distinct a.paciente_id
  from cadastro.acesso_paciente a
  where a.usuario_id = p_usuario and a.revogada_em is null
), papel as (
  select ac.paciente_id, c.papel
  from acesso ac cross join lateral cadastro.case_manager_atual(ac.paciente_id) c
  where c.usuario_id = p_usuario
), titular as (
  select ac.paciente_id, c.usuario_id as titular_id
  from acesso ac cross join lateral cadastro.case_manager_atual(ac.paciente_id) c
  where c.papel = 'titular'
), destinatario as (
  -- A própria pessoa, sempre; e o titular ausente quando ela substitui, enquanto vigorar.
  select ac.paciente_id, p_usuario as destinatario_usuario_id, false as por_substituicao from acesso ac
  union
  select t.paciente_id, t.titular_id, true
  from titular t join papel p on p.paciente_id = t.paciente_id and p.papel = 'substituto'
  where t.titular_id is distinct from p_usuario
), lideranca as (
  select d.paciente_id, d.destinatario_usuario_id, d.por_substituicao
  from destinatario d
  join titular t on t.paciente_id = d.paciente_id and t.titular_id = d.destinatario_usuario_id
), passagem as (
  select d.paciente_id, d.destinatario_usuario_id, d.por_substituicao,
    'passagem_sem_ciencia'::text as tipo,
    'passagem:' || td.turno_destinatario_id::text as chave_origem,
    tp.publicado_em as instante, null::text as motivo
  from destinatario d
  join cadastro.diario_turno_destinatario td
    on td.paciente_id = d.paciente_id and td.usuario_id = d.destinatario_usuario_id
  join cadastro.diario_turno_passagem tp
    on tp.turno_id = td.turno_origem_id and tp.versao_passagem = td.versao_passagem_origem
  where not exists (select 1 from cadastro.diario_ciencia_turno c
    where c.turno_destinatario_id = td.turno_destinatario_id)
), sinal as (
  select l.paciente_id, l.destinatario_usuario_id, l.por_substituicao,
    cadastro.sinal_operacional_caso(l.paciente_id) as s
  from lideranca l
), pendencia as (
  select s.paciente_id, s.destinatario_usuario_id, s.por_substituicao,
    'pendencia_operacional'::text as tipo,
    'pendencia:' || (p->>'tipo') || ':' || (p->>'chave_origem') as chave_origem,
    nullif(p->>'desde', '')::date::timestamptz as instante,
    p->>'motivo' as motivo
  from sinal s cross join lateral jsonb_array_elements(s.s->'pendencias') p
  where p->>'estado' is distinct from 'resolvida'
), atencao_operacional as (
  select s.paciente_id, s.destinatario_usuario_id, s.por_substituicao,
    'sinal_atencao_operacional'::text as tipo,
    'sinal:' || s.paciente_id::text || ':atencao_operacional' as chave_origem,
    (select max(nullif(p->>'desde', '')::date) from jsonb_array_elements(s.s->'pendencias') p
      where p->>'estado' is distinct from 'resolvida')::timestamptz as instante,
    null::text as motivo
  from sinal s where s.s->>'estado' = 'atencao_operacional'
), relato as (
  -- Audiência explícita: rascunho é privado do autor e nunca vira aviso; `equipe` e
  -- `equipe_e_familia` alcançam quem tem acesso vigente ao caso, que é o destinatário aqui.
  select l.paciente_id, l.destinatario_usuario_id, l.por_substituicao,
    'relato_em_atencao'::text as tipo,
    'relato:' || v.id::text as chave_origem, v.criado_em as instante, null::text as motivo
  from lideranca l
  join cadastro.diario_registro r on r.paciente_id = l.paciente_id
  join lateral (select w.id, w.estado, w.audiencia, w.atencao, w.tarefa_id, w.criado_em
    from cadastro.diario_registro_versao w
    where w.diario_registro_id = r.id order by w.versao desc limit 1) v on true
  where v.atencao and v.estado in ('publicado', 'retificado') and v.tarefa_id is null
    and v.audiencia in ('equipe', 'equipe_e_familia')
), todos as (
  select * from passagem
  union all select * from pendencia
  union all select * from atencao_operacional
  union all select * from relato
), marcados as (
  select t.*, exists(select 1 from cadastro.aviso_leitura al
    where al.usuario_id = p_usuario and al.tipo = t.tipo and al.chave_origem = t.chave_origem) as lido
  from todos t
)
select jsonb_build_object(
  'itens', coalesce((select jsonb_agg(jsonb_build_object(
      'tipo', m.tipo, 'paciente_id', m.paciente_id, 'chave_origem', m.chave_origem,
      'instante', m.instante, 'destinatario_usuario_id', m.destinatario_usuario_id,
      'por_substituicao', m.por_substituicao, 'lido', m.lido, 'motivo', m.motivo)
      order by m.lido, m.instante desc nulls last, m.tipo, m.chave_origem)
    from (select * from marcados order by lido, instante desc nulls last, tipo, chave_origem limit 200) m
  ), '[]'::jsonb),
  'nao_lidos', (select count(*) from marcados where not lido));
$$;
revoke all on function cadastro.avisos_pessoa(uuid) from public, anon, authenticated, service_role;
grant execute on function cadastro.avisos_pessoa(uuid) to ffcmapp_avisos_owner;

-- Operação privada dos avisos. Profissional e Administrador com concessão vinculada e
-- sessão vigente; família nunca. A auditoria é obrigatória na mesma transação, inclusive
-- na negação, e NUNCA grava conteúdo clínico: só ação, tipo de objeto e identificadores.
create function operacao.avisos_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_variable
declare
  e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
  ator uuid; sessao uuid; req uuid; paciente uuid; tipo text; chave text;
  inicio timestamptz; fim timestamptz;
  concessao uuid; dominio text; sujeito text; google record;
  autorizado boolean := false; repeticao boolean := false;
  anterior operacao.requisicao; resultado jsonb; acao text; existe boolean;
begin
  if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['entrada', 'entrada_canonica', 'dados_canonicos'] <> '{}'::jsonb
    or jsonb_typeof(e) is distinct from 'object'
    or e - array['request_id', 'paciente_id', 'tipo', 'chave_origem',
      'chave_idempotencia', 'digest_idempotencia', 'atestado'] <> '{}'::jsonb
    or jsonb_typeof(a) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  begin
    ator := auth_privado.uid(); sessao := (auth_privado.jwt()->>'session_id')::uuid;
    req := (e->>'request_id')::uuid;
    inicio := (a->>'emitido_em')::timestamptz; fim := (a->>'expira_em')::timestamptz;
    acao := a->>'operacao';
    paciente := (e->>'paciente_id')::uuid;
    tipo := e->>'tipo'; chave := e->>'chave_origem';
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end;
  if ator is null or sessao is null or req is null or inicio is null or fim is null
    or acao not in ('api.listar_avisos', 'api.marcar_aviso_lido')
    or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
    or a->>'request_id' is distinct from req::text
    or inicio > clock_timestamp() or fim <= clock_timestamp() or fim <= inicio
    or fim - inicio > interval '30 seconds'
    or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',
      p_transporte->>'dados_canonicos', e - 'atestado', a - 'mac', a->>'mac') is distinct from true then
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
          where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'google_workspace'
            and c.perfil in ('administrador', 'profissional') for share;
        if found and sujeito = google.provider_id then
          perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil in ('administrador', 'profissional') for share;
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
        where c.usuario_id = ator and c.estado = 'vinculada' and c.metodo = 'tecnica'
          and c.perfil in ('administrador', 'profissional') for share;
      if found then
        perform 1 from public.usuario u where u.id = ator and u.ativo and u.perfil in ('administrador', 'profissional') for share;
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
        values(gen_random_uuid(), ator, acao, 'aviso', paciente, 'negado', req);
    else
      insert into auditoria.evento(id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'aviso', paciente, 'negado', req);
    end if;
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end if;
  if acao = 'api.listar_avisos' then
    if e - array['request_id', 'atestado'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
  else
    if paciente is null or tipo is null or chave is null
      or tipo not in ('passagem_sem_ciencia', 'pendencia_operacional', 'sinal_atencao_operacional', 'relato_em_atencao')
      or coalesce(length(chave) between 1 and 200, false) is not true
      or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256, false) is not true
      or coalesce(e->>'digest_idempotencia', '') !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using errcode = '22023', message = 'ENTRADA_INVALIDA';
    end if;
    select * into anterior from operacao.requisicao r
      where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
    repeticao := found;
    if not found then
      -- Marcar como lido não é ciência (design D7) e não encerra origem nenhuma: só grava
      -- que esta pessoa já viu. Exige que o aviso exista HOJE na projeção dela.
      select exists(select 1 from jsonb_array_elements(cadastro.avisos_pessoa(ator)->'itens') i
        where i->>'tipo' = tipo and i->>'chave_origem' = chave and i->>'paciente_id' = paciente::text)
        into existe;
      if not existe then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'aviso', paciente, 'negado', req);
        if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
        return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
      end if;
      insert into operacao.requisicao(id, ator_usuario_id, operacao, chave_idempotencia, digest_entrada, estado)
        values(gen_random_uuid(), ator, acao, e->>'chave_idempotencia', e->>'digest_idempotencia', 'concluida')
        on conflict (ator_usuario_id, operacao, chave_idempotencia) do nothing returning * into anterior;
      if found then
        insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
          values(gen_random_uuid(), ator, acao, 'aviso', paciente, 'permitido', req);
        insert into cadastro.aviso_leitura(usuario_id, tipo, chave_origem, paciente_id)
          values(ator, tipo, chave, paciente) on conflict do nothing;
      else
        repeticao := true;
        select * into anterior from operacao.requisicao r
          where r.ator_usuario_id = ator and r.operacao = acao and r.chave_idempotencia = e->>'chave_idempotencia';
      end if;
    end if;
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida' then
      insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
        values(gen_random_uuid(), ator, acao, 'aviso', paciente, 'negado', req);
      if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
      return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'conflito_idempotencia'), 'request_id', req);
    end if;
  end if;
  resultado := cadastro.avisos_pessoa(ator);
  -- FR-039: a consulta da lista é auditada. Nada do conteúdo entra no registro.
  if acao = 'api.listar_avisos' or repeticao then
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), ator, acao, 'aviso', paciente, 'permitido', req);
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  if fim <= clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s
    where s.id = sessao and s.user_id = ator and (s.not_after is null or s.not_after > clock_timestamp())) then
    raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
  end if;
  return jsonb_build_object('ok', true, 'dados', resultado, 'request_id', req, 'repeticao', repeticao);
end $$;
revoke all on function operacao.avisos_privada(jsonb) from public, anon, authenticated, service_role;
grant execute on function operacao.avisos_privada(jsonb) to ffcmapp_avisos_owner;

create function api.avisos_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
declare req uuid; alvo uuid; acao text;
begin
  begin
    return operacao.avisos_privada(p_transporte);
  exception when sqlstate 'PZ001' then
    req := (p_transporte#>>'{entrada,request_id}')::uuid;
    alvo := (p_transporte#>>'{entrada,paciente_id}')::uuid;
    acao := p_transporte#>>'{entrada,atestado,operacao}';
    if acao is null or acao not in ('api.listar_avisos', 'api.marcar_aviso_lido') then
      acao := 'api.listar_avisos';
    end if;
    insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
      values(gen_random_uuid(), auth_privado.uid(), acao, 'aviso', alvo, 'negado', req);
    return jsonb_build_object('ok', false, 'erro', jsonb_build_object('codigo', 'sem_permissao'), 'request_id', req);
  end;
end $$;
revoke all on function api.avisos_privado(jsonb) from public, anon, authenticated, service_role;
alter function api.avisos_privado(jsonb) owner to ffcmapp_avisos_owner;
select set_config('ffcmapp.avisos_migrador', current_user, false);
set role ffcmapp_avisos_owner;
revoke all on function api.avisos_privado(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.avisos_migrador'), false);
revoke create on schema api from ffcmapp_avisos_owner;

-- O verificador do atestado é de outro owner; conceder exige assumir o papel dono.
select set_config('ffcmapp.avisos_tinha_verificador', pg_has_role(current_user, 'ffcmapp_atestado_verificador_owner', 'SET')::text, false);
do $$ begin
  if current_setting('ffcmapp.avisos_tinha_verificador') = 'false' then
    if exists(select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor
      where r.rolname = 'ffcmapp_atestado_verificador_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_avisos_owner;
reset role;
select set_config('role', current_setting('ffcmapp.avisos_migrador'), false);
do $$ begin
  if current_setting('ffcmapp.avisos_tinha_verificador') = 'false' then
    execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I', current_user, current_user);
  end if;
end $$;
revoke ffcmapp_avisos_owner from current_user;
