begin;
-- FR-078/FR-081 (diario-de-plantao, achado A4): o campo que o Administrador acrescenta ao
-- modelo da ficha passa a ter ONDE GRAVAR a resposta.
--
-- Até aqui `cadastro.turno_plantao_versao` só tinha `atividades` e `observacoes`, e o
-- conjunto de chaves do `conteudo` da RPC era fechado. A tela era honesta — declarava o
-- limite em vez de oferecer campo que não persiste —, mas "formulário configurável" sem
-- gravar resposta não é a funcionalidade que a cliente pediu por escrito.
--
-- O mecanismo é o MESMO já provado no catálogo de campos extras do Plano de cuidado
-- (20261125190000_plano_campos_extras.sql e 20261127100000_campo_extra_catalogo_generalizado.sql):
--  * a resposta vive em envelope CIFRADO próprio, em tabela append-only amarrada a
--    `(registro_id, versao)` da ficha — mudar o catálogo depois não toca resposta antiga,
--    porque não existe caminho de escrita do catálogo até esta tabela e porque UPDATE e
--    DELETE são bloqueados por trigger e por ausência de grant;
--  * a gravação nova manda o retrato id->versão do catálogo e o banco REVALIDA sob
--    `for share` por `operacao.campo_extra_revalidar_snapshot`, a MESMA função que o Plano
--    chama, recusando com `conflito` quando o modelo mudou — nunca ajustando em silêncio;
--  * cada resposta carrega `fonte` e `visibilidade` próprios (FR-081), como `atividades` e
--    `observacoes` já carregam;
--  * campo desativado mantém a resposta antiga legível: a projeção faz LEFT JOIN no
--    catálogo e devolve a resposta com o estado do campo, em vez de escondê-la.
--
-- AAD na forma genérica do repositório: {tabela, registro_id, campo, formato}, com
-- `registro_id` no `id` da LINHA, exatamente como as outras tabelas da ficha, o financeiro
-- e a substituição de case manager. Nenhuma convenção nova de AAD é criada aqui.
--
-- PREPARAÇÃO LOCAL. Nenhuma execução remota, nenhuma ativação, nenhum dado real.
-- Rollback: drop da tabela e das policies/grants criados abaixo, e restauração do corpo
-- anterior de operacao.ficha_plantao_operacao_privada e de operacao.projetar_ficha_plantao.

-- 1. Tabela append-only das respostas, uma linha por (ficha, versão, campo).
-- A chave estrangeira composta para `cadastro.turno_plantao_versao(registro_id, versao)` é
-- o que faz "append-only por versão" ser estrutura e não convenção: a versão 2 da ficha
-- grava linhas novas e as da versão 1 continuam exatamente onde estavam.
-- `campo_versao` guarda a versão do campo no catálogo no instante da resposta, para que a
-- leitura posterior não dependa do estado corrente do modelo.
create table cadastro.turno_plantao_resposta_versao(
 id uuid not null unique,
 registro_id uuid not null,
 versao integer not null check(versao>0),
 campo_id uuid not null,
 campo_versao integer not null check(campo_versao>0),
 paciente_id uuid not null references cadastro.paciente(id),
 turno_id uuid not null references cadastro.turno(id),
 conteudo jsonb not null,
 -- FR-081: fonte e visibilidade são POR RESPOSTA, em conjunto fechado pelo banco.
 fonte text not null check(fonte in ('observacao_direta','relato_paciente','relato_familiar','documento')),
 visibilidade text not null check(visibilidade in ('interna','compartilhavel')),
 autor_usuario_id uuid not null references public.usuario(id),
 registrado_em timestamptz not null default clock_timestamp(),
 primary key(registro_id,versao,campo_id),
 foreign key(registro_id,versao) references cadastro.turno_plantao_versao(registro_id,versao)
);
alter table cadastro.turno_plantao_resposta_versao enable row level security;
alter table cadastro.turno_plantao_resposta_versao force row level security;
revoke all on cadastro.turno_plantao_resposta_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_plantao_resposta_versao to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_resposta on cadastro.turno_plantao_resposta_versao to ffcmapp_ficha_plantao_owner using(true) with check(true);
create trigger turno_plantao_resposta_versao_imutavel before update or delete on cadastro.turno_plantao_resposta_versao for each row execute function cadastro.turno_grupo3_imutavel();

-- 2. Acesso do owner da ficha ao catálogo administrado, no MOLDE EXATO do Plano
-- (`grant select (id, versao, ativo), update (versao)` + policy de lock com
-- `with check(false)`): o `for share` da revalidação exige UPDATE além de SELECT, e a
-- policy de UPDATE recusa qualquer gravação. A barreira é estrutural: as duas policies são
-- restritas a `escopo='ficha_plantao'`, então esta fatia não enxerga nem trava uma linha
-- sequer do catálogo do Plano de cuidado.
grant select(id,escopo,nome,tipo,ativo,ordem,versao),update(versao) on cadastro.campo_extra_plano_catalogo to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_campo_extra_select on cadastro.campo_extra_plano_catalogo for select to ffcmapp_ficha_plantao_owner using(escopo='ficha_plantao');
create policy ficha_plantao_campo_extra_lock on cadastro.campo_extra_plano_catalogo for update to ffcmapp_ficha_plantao_owner using(escopo='ficha_plantao') with check(false);
grant execute on function operacao.campo_extra_revalidar_snapshot(text,jsonb) to ffcmapp_ficha_plantao_owner;

-- 3. Projeção: a resposta volta junto da ficha, com o estado do campo no catálogo. O LEFT
-- JOIN é deliberado — a resposta é legível mesmo que o campo tenha sido desativado, e
-- continuaria legível se a linha do catálogo sumisse. Nada aqui deriva leitura clínica.
create or replace function operacao.projetar_ficha_plantao(p_paciente uuid,p_turno uuid,p_registro uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'ficha',(select jsonb_build_object('registro_id',f.registro_id,'paciente_id',f.paciente_id,'turno_id',f.turno_id,'versao',f.versao,
     'periodo',t.periodo,'papel_declarado',f.papel_declarado,
     'atividades',f.atividades,'atividades_fonte',f.atividades_fonte,'atividades_visibilidade',f.atividades_visibilidade,
     'observacoes',f.observacoes,'observacoes_fonte',f.observacoes_fonte,'observacoes_visibilidade',f.observacoes_visibilidade,
     'respostas',(select coalesce(jsonb_agg(jsonb_build_object('campo_id',rp.campo_id,'campo_nome',c.nome,'campo_tipo',c.tipo,
        'campo_ativo',coalesce(c.ativo,false),'campo_versao',rp.campo_versao,'conteudo',rp.conteudo,'fonte',rp.fonte,'visibilidade',rp.visibilidade)
        order by coalesce(c.ordem,0),rp.campo_id),'[]'::jsonb)
       from cadastro.turno_plantao_resposta_versao rp left join cadastro.campo_extra_plano_catalogo c on c.id=rp.campo_id
       where rp.registro_id=f.registro_id and rp.versao=f.versao),
     'autor_usuario_id',f.autor_usuario_id,'registrado_em',f.registrado_em,
     'retroativo',t.janela_declarada_inicio is not null)
    from cadastro.turno_plantao_versao f join cadastro.turno t on t.id=f.turno_id
    where f.registro_id=p_registro and f.paciente_id=p_paciente and f.versao=(select max(z.versao) from cadastro.turno_plantao_versao z where z.registro_id=f.registro_id)),
  'pendencias',(select coalesce(jsonb_agg(jsonb_build_object('pendencia_id',p.registro_id,'paciente_id',p.paciente_id,'turno_id',p.turno_id,'versao',p.versao,
     'origem',p.origem,'situacao',p.situacao,'conteudo',p.conteudo,'fonte',p.fonte,'visibilidade',p.visibilidade,
     'declarado_por_usuario_id',p.declarado_por_usuario_id,'autor_usuario_id',p.autor_usuario_id,'registrado_em',p.registrado_em,
     'resolvido_por_usuario_id',p.resolvido_por_usuario_id,'resolvido_em',p.resolvido_em) order by p.registrado_em,p.registro_id),'[]'::jsonb)
    from cadastro.turno_plantao_pendencia_versao p
    where p.paciente_id=p_paciente and (p_turno is null or p.turno_id=p_turno) and p.versao=(select max(z.versao) from cadastro.turno_plantao_pendencia_versao z where z.registro_id=p.registro_id)),
  'rascunho',null::jsonb)
$$;

-- 4. Corpo da RPC da ficha, por substituição de âncora única — o mesmo mecanismo que
-- 20261125190000 e 20261127100000 usam para alterar função já existente sem reescrevê-la
-- inteira. Falha fechada: âncora não única aborta a migração, e owner, ACL, SECURITY,
-- search_path e assinatura são conferidos depois.
create function pg_temp.ficha_plantao_respostas(p_assinatura text,p_patches jsonb) returns void
 language plpgsql as $guard$
declare
 oid_alvo oid:=to_regprocedure(p_assinatura); antes record; depois record; definicao text;
 migrador text:=current_user; dono text; esquema text; tinha_set boolean; tinha_create boolean;
 novo_corpo text; patch jsonb; antigo text; novo text;
begin
 if oid_alvo is null then raise exception 'CONSUMIDOR_AUSENTE: %',p_assinatura;end if;
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prorettype,p.proargtypes
  into antes from pg_proc p where p.oid=oid_alvo;
 select r.rolname,n.nspname into dono,esquema from pg_proc p
  join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace
  where p.oid=oid_alvo and (not antes.prosecdef or (not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin));
 if dono is null or not ('search_path=""'=any(antes.proconfig)) then raise exception 'OWNER_CONFIG_INESPERADO: %',p_assinatura;end if;
 novo_corpo:=antes.prosrc;
 for patch in select value from jsonb_array_elements(p_patches) loop
  antigo:=patch->>'antes';novo:=patch->>'depois';
  if antigo is null or antigo='' or novo is null
   or (length(novo_corpo)-length(replace(novo_corpo,antigo,'')))/length(antigo)<>1 then
   raise exception 'ANCORA_NAO_UNICA: % / %',p_assinatura,left(antigo,60);
  end if;
  novo_corpo:=replace(novo_corpo,antigo,novo);
  if (length(novo_corpo)-length(replace(novo_corpo,novo,'')))/greatest(length(novo),1)<1 then
   raise exception 'SUBSTITUICAO_NAO_APLICADA: %',p_assinatura;
  end if;
 end loop;
 if antes.prosecdef then
  tinha_set:=pg_has_role(migrador,dono,'SET');
  tinha_create:=has_schema_privilege(dono,esquema,'CREATE');
  if not tinha_set then
   if exists(select 1 from pg_auth_members where roleid=dono::regrole and member=migrador::regrole and grantor=migrador::regrole) then
    raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
   end if;
   execute format('grant %I to %I with inherit false, set true granted by %I',dono,migrador,migrador);
  end if;
  if not tinha_create then execute format('grant create on schema %I to %I',esquema,dono);end if;
  definicao:=pg_get_functiondef(oid_alvo);
  perform set_config('role',dono,true);
  execute replace(definicao,antes.prosrc,novo_corpo);
  perform set_config('role',migrador,true);
  if not tinha_create then execute format('revoke create on schema %I from %I',esquema,dono);end if;
  if not tinha_set then execute format('revoke %I from %I granted by %I',dono,migrador,migrador);end if;
 else
  if not pg_has_role(migrador,dono,'USAGE') then raise exception 'OWNERSHIP_INVOKER_INDISPONIVEL: %',p_assinatura;end if;
  definicao:=pg_get_functiondef(oid_alvo);
  execute replace(definicao,antes.prosrc,novo_corpo);
 end if;
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prorettype,p.proargtypes
  into depois from pg_proc p where p.oid=oid_alvo;
 if depois.proowner<>antes.proowner or depois.proacl is distinct from antes.proacl
  or depois.proconfig is distinct from antes.proconfig or depois.prosecdef<>antes.prosecdef
  or depois.prorettype<>antes.prorettype or depois.proargtypes<>antes.proargtypes
  or depois.prosrc<>novo_corpo then
  raise exception 'CONSUMIDOR_NAO_PRESERVADO: %',p_assinatura;
 end if;
end $guard$;

select pg_temp.ficha_plantao_respostas('operacao.ficha_plantao_operacao_privada(jsonb)',jsonb_build_array(
-- 4.1 Declarações locais novas.
jsonb_build_object('antes',$f1$ emocional jsonb;medida uuid;instante timestamptz;inicio timestamptz;fim timestamptz;tolerancia integer;rascunho uuid;$f1$,
 'depois',$f1$ emocional jsonb;medida uuid;instante timestamptz;inicio timestamptz;fim timestamptz;tolerancia integer;rascunho uuid;campo_resposta jsonb;$f1$),
-- 4.2 O retrato id->versão do catálogo entra no conjunto FECHADO de chaves do pedido.
jsonb_build_object('antes',$f2$'conteudo','pendencias','canonicos','motivo','aad','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;$f2$,
 'depois',$f2$'conteudo','pendencias','canonicos','campos_extras_catalogo','motivo','aad','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;$f2$),
-- 4.3 `respostas` entra no conjunto FECHADO de chaves do conteúdo. Continua fechado: o
--     que não está aqui segue sendo recusado pelo banco.
jsonb_build_object('antes',$f3$   or conteudo-array['periodo','janela_declarada','papel_declarado','atividades','observacoes','estado_emocional']<>'{}'::jsonb$f3$,
 'depois',$f3$   or conteudo-array['periodo','janela_declarada','papel_declarado','atividades','observacoes','estado_emocional','respostas']<>'{}'::jsonb$f3$),
-- 4.4 Revalidação do modelo SOB LOCK, antes de qualquer gravação desta ficha.
jsonb_build_object('antes',$f4$   -- Período declarado, nunca inferido do relógio; valor fora do conjunto administrado cai$f4$,
 'depois',$f4$   -- FR-078/D2. O modelo da ficha é revalidado SOB LOCK contra o retrato id->versão que o
   -- cliente enviou: a MESMA `operacao.campo_extra_revalidar_snapshot` do Plano, o mesmo
   -- `for share` e a mesma recusa com `conflito`. Modelo alterado durante o preenchimento
   -- NUNCA é ajustado em silêncio, e nada foi gravado quando a recusa acontece.
   if operacao.campo_extra_revalidar_snapshot('ficha_plantao',e->'campos_extras_catalogo') is not true then raise exception using errcode='PZ064',message='conflito';end if;
   -- Período declarado, nunca inferido do relógio; valor fora do conjunto administrado cai$f4$),
-- 4.5 Gravação das respostas, logo depois da linha da ficha a que elas pertencem.
jsonb_build_object('antes',$f5$     conteudo#>'{observacoes,conteudo}',conteudo#>>'{observacoes,fonte}',conteudo#>>'{observacoes,visibilidade}',e->'motivo',ator);$f5$,
 'depois',$f5$     conteudo#>'{observacoes,conteudo}',conteudo#>>'{observacoes,fonte}',conteudo#>>'{observacoes,visibilidade}',e->'motivo',ator);
   -- FR-078/FR-081. Resposta de campo ACRESCENTADO pelo Administrador: envelope cifrado
   -- próprio, com `fonte` e `visibilidade` por resposta, amarrada a (registro, versao) desta
   -- ficha. Só responde campo que esteja no retrato revalidado acima — isto é, ativo, do
   -- escopo da ficha e na versão que o cliente viu. A tabela é append-only e o catálogo não
   -- tem caminho de escrita até ela: mudar o modelo depois não toca resposta já gravada.
   if conteudo ? 'respostas' then
    if jsonb_typeof(conteudo->'respostas') is distinct from 'array' or jsonb_array_length(conteudo->'respostas')>50 then raise invalid_parameter_value;end if;
    for campo_resposta in select v from jsonb_array_elements(conteudo->'respostas') v loop
     if campo_resposta-array['campo_id','id','conteudo','fonte','visibilidade','aad']<>'{}'::jsonb
      or (campo_resposta->>'campo_id')::uuid is null or (campo_resposta->>'id')::uuid is null
      or jsonb_typeof(e#>array['campos_extras_catalogo',campo_resposta->>'campo_id']) is distinct from 'number'
      or not operacao.validar_cifra_ficha_plantao(campo_resposta->'conteudo',campo_resposta->'aad',(campo_resposta->>'id')::uuid,'cadastro.turno_plantao_resposta_versao','conteudo') then raise invalid_parameter_value;end if;
     insert into cadastro.turno_plantao_resposta_versao(id,registro_id,versao,campo_id,campo_versao,paciente_id,turno_id,conteudo,fonte,visibilidade,autor_usuario_id)
      values((campo_resposta->>'id')::uuid,registro,versao,(campo_resposta->>'campo_id')::uuid,(e#>>array['campos_extras_catalogo',campo_resposta->>'campo_id'])::integer,paciente,alvo_turno,campo_resposta->'conteudo',campo_resposta->>'fonte',campo_resposta->>'visibilidade',ator);
    end loop;
   end if;$f5$)));

-- Conferência final: nenhuma coluna de valor, nota, escala, gravidade, risco ou alerta
-- entrou na tabela nova (FR-064/FR-081), e nenhum papel de aplicação a alcança.
do $$ declare papel text; begin
 if exists(select 1 from information_schema.columns where table_schema='cadastro' and table_name='turno_plantao_resposta_versao'
  and (column_name in('valor','pontuacao','score','gravidade','risco','alerta','tendencia','nivel')
   or (data_type in('numeric','integer','bigint','double precision') and column_name not in('versao','campo_versao')))) then raise exception 'COLUNA_DE_DERIVACAO_CLINICA';end if;
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','SELECT') or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','INSERT')
   or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','UPDATE') or has_table_privilege(papel,'cadastro.turno_plantao_resposta_versao','DELETE') then raise exception 'GRANT_DIRETO: %',papel;end if;
 end loop;
 if has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.turno_plantao_resposta_versao','UPDATE')
  or has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.turno_plantao_resposta_versao','DELETE') then raise exception 'RESPOSTA_MUTAVEL';end if;
 -- O owner da ficha não ganhou nenhuma escrita no catálogo administrado além do lock.
 if has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','INSERT')
  or has_table_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','DELETE')
  or has_column_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','nome','UPDATE')
  or has_column_privilege('ffcmapp_ficha_plantao_owner','cadastro.campo_extra_plano_catalogo','ativo','UPDATE') then raise exception 'CATALOGO_ESCRIVEL_PELA_FICHA';end if;
end $$;
commit;
