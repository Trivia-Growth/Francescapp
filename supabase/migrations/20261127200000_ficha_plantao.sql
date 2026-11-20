-- FR-073/074/075/076/077/081. Ficha de plantão: superfície única de registro do AT e da
-- enfermagem. PREPARAÇÃO LOCAL; nenhuma execução remota, nenhuma ativação, nenhum dado real.
-- A ficha NÃO cria armazenamento paralelo: alimentação, medicação e intercorrência continuam
-- nas tabelas canônicas de FR-059/FR-060/FR-061/FR-064 e são gravadas pelo caminho canônico
-- `api.turno_execucao`, chamado DENTRO desta transação. Só o que não tinha lugar ganha lugar
-- novo aqui: período do plantão, estado emocional observado, atividades/observações do
-- plantão, pendência escrita e rascunho cifrado no servidor.
-- Rollback: drop das funções/tabelas criadas abaixo e das colunas acrescentadas em
-- cadastro.turno; o papel ffcmapp_ficha_plantao_owner é exclusivo desta fatia.
begin;
create role ffcmapp_ficha_plantao_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_ficha_plantao_owner to current_user with inherit false,set true;
grant create on schema api to ffcmapp_ficha_plantao_owner;
grant usage on schema api,cadastro,operacao,identidade,auditoria,auth_privado,public to ffcmapp_ficha_plantao_owner;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.sessoes() to ffcmapp_ficha_plantao_owner;
-- Reaproveita a autoridade já provada do turno em vez de reimplementá-la: contexto, atestado,
-- vínculo vivo, gate administrado e lock do caso continuam sendo decididos por
-- operacao.autorizar_execucao_turno. Delegação estreita, preservando memberships e grantors.
-- As duas funções de autoridade do turno pertencem ao migrador, como as demais funções
-- internas de `operacao`: o grant é direto. Só o wrapper `api.turno_execucao` pertence ao
-- owner dedicado e exige a delegação estreita abaixo.
do $$begin
 if not exists(select 1 from pg_proc p where p.oid='operacao.autorizar_execucao_turno(jsonb,text[])'::regprocedure and not p.prosecdef and 'search_path=""'=any(p.proconfig)) then raise exception 'AUTORIDADE_DO_TURNO_INESPERADA';end if;
end $$;
grant execute on function operacao.autorizar_execucao_turno(jsonb,text[]),operacao.contexto_execucao_turno(uuid) to ffcmapp_ficha_plantao_owner;
do $$ declare x record; migrador text:=current_user; tinha boolean; begin
 for x in select * from (values
 ('ffcmapp_turno_execucao_owner','api.turno_execucao(jsonb)'),
 ('ffcmapp_acessos_owner','identidade.contexto_acesso_vigente(boolean)'),
 ('ffcmapp_sessao_familiar_owner','api.consultar_sessao_familiar_nativa(uuid)'),
 ('ffcmapp_atestado_verificador_owner','identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)')) v(owner_nome,assinatura) loop
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(x.assinatura) and r.rolname=x.owner_nome and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin and 'search_path=""'=any(p.proconfig)) then raise exception 'FUNCAO_DELEGADA_INESPERADA: %',x.assinatura;end if;
  tinha:=pg_has_role(migrador,x.owner_nome,'SET');
  if not tinha then
   if exists(select 1 from pg_auth_members where roleid=x.owner_nome::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
   execute format('grant %I to %I with inherit false,set true granted by %I',x.owner_nome,migrador,migrador);
  end if;
  perform set_config('role',x.owner_nome,true);execute format('grant execute on function %s to ffcmapp_ficha_plantao_owner',x.assinatura);perform set_config('role',migrador,true);
  if not tinha then execute format('revoke %I from %I granted by %I',x.owner_nome,migrador,migrador);end if;
 end loop;
end $$;

-- FR-075. Conjunto administrado do período. O período é DECLARADO; nada aqui lê o relógio.
-- A chave estrangeira em cadastro.turno é o "conjunto administrado" do requisito: valor fora
-- do catálogo é recusado pelo banco, e desativar um termo não invalida turno já gravado.
create table cadastro.turno_periodo_catalogo(
 periodo text primary key check(length(periodo) between 1 and 40),
 ativo boolean not null default true, ordem integer not null default 0
);
insert into cadastro.turno_periodo_catalogo(periodo,ordem) values('diurno',1),('noturno',2);
-- FR-076/D3. Estado emocional é OBSERVAÇÃO DECLARADA. O catálogo nasce VAZIO de propósito:
-- o vocabulário de estados é regra de negócio da cliente, como a lista de papéis de P1, e não
-- é inventado pelo executor. A estrutura existe; a semeadura é ato do Administrador.
create table cadastro.turno_estado_emocional_catalogo(
 estado text primary key check(length(estado) between 1 and 80),
 ativo boolean not null default true, ordem integer not null default 0
);
alter table cadastro.turno add column periodo text references cadastro.turno_periodo_catalogo(periodo);
-- 0.7 (P5). Abertura retroativa DECLARADA: os dois instantes ficam lado a lado. `aberto_em`,
-- que é do servidor (FR-055), nunca é substituído; a janela declarada é informação à parte e
-- quem lê o relatório vê que a ficha foi retroativa. O teto é a tolerância administrada
-- vigente à época, já guardada em `parametros`, conferida na operação.
alter table cadastro.turno
 add column janela_declarada_inicio timestamptz,
 add column janela_declarada_fim timestamptz,
 add column janela_declarada_em timestamptz,
 add column janela_declarada_por_usuario_id uuid references public.usuario(id),
 add constraint turno_janela_declarada_completa_chk check(num_nonnulls(janela_declarada_inicio,janela_declarada_fim,janela_declarada_em,janela_declarada_por_usuario_id) in (0,4)),
 add constraint turno_janela_declarada_ordem_chk check(janela_declarada_fim is null or janela_declarada_fim>=janela_declarada_inicio),
 add constraint turno_janela_declarada_retroativa_chk check(janela_declarada_inicio is null or (janela_declarada_inicio<=aberto_em and janela_declarada_fim<=janela_declarada_em));
-- ACHADO: os owners do turno leem `cadastro.turno` com `select *` e têm grant POR COLUNA.
-- Coluna nova sem grant quebraria `select *` deles com permission denied — isto é, acrescentar
-- coluna aqui é mudança de comportamento se o grant não acompanhar. As colunas novas recebem
-- SELECT para exatamente quem já lê a linha hoje; ninguém novo passa a ler, e nenhum owner
-- ganha UPDATE sobre elas.
do $$ declare papel text; begin
 for papel in select rolname from pg_roles where rolname like 'ffcmapp_%' and rolname<>'ffcmapp_ficha_plantao_owner' and has_column_privilege(rolname,'cadastro.turno','aberto_em','SELECT') loop
  execute format('grant select(periodo,janela_declarada_inicio,janela_declarada_fim,janela_declarada_em,janela_declarada_por_usuario_id) on cadastro.turno to %I',papel);
 end loop;
end $$;

-- FR-076. Tipo novo no catálogo de medidas, classe `rotina` e SEM unidade. Os dois CHECK
-- fechados abaixo precisam ser reescritos porque PostgreSQL não amplia CHECK existente; a
-- reescrita é conferida antes, e falha fechada se o constraint de origem não for exatamente o
-- esperado. A ausência de `valor` é o controle: sem número não há média, tendência nem limiar,
-- e derivar gravidade fica inviável por esquema, não só proibido por texto.
do $$ declare nome text;definicao text;quantas integer; begin
 select count(*) into quantas from pg_constraint where conrelid='cadastro.turno_catalogo_medida'::regclass and contype='c' and pg_get_constraintdef(oid) like '%pressao_sistolica%';
 if quantas<>1 then raise exception 'CHECK_CATALOGO_MEDIDA_INESPERADO: %',quantas;end if;
 select conname,pg_get_constraintdef(oid) into nome,definicao from pg_constraint where conrelid='cadastro.turno_catalogo_medida'::regclass and contype='c' and pg_get_constraintdef(oid) like '%pressao_sistolica%';
 if definicao not like '%eliminacao%' or definicao like '%estado_emocional%' then raise exception 'CHECK_CATALOGO_MEDIDA_DIVERGENTE';end if;
 execute format('alter table cadastro.turno_catalogo_medida drop constraint %I',nome);
 alter table cadastro.turno_catalogo_medida add constraint turno_catalogo_medida_tipo_chk check(tipo in ('pressao_sistolica','pressao_diastolica','frequencia_cardiaca','frequencia_respiratoria','temperatura','saturacao_oxigenio','glicemia_capilar','dor','refeicao','hidratacao','sono','eliminacao','estado_emocional'));
 select count(*) into quantas from pg_constraint where conrelid='cadastro.turno_medida_versao'::regclass and contype='c' and pg_get_constraintdef(oid) like '%refeicao%' and pg_get_constraintdef(oid) like '%eliminacao%';
 if quantas<>1 then raise exception 'CHECK_MEDIDA_INESPERADO: %',quantas;end if;
 select conname,pg_get_constraintdef(oid) into nome,definicao from pg_constraint where conrelid='cadastro.turno_medida_versao'::regclass and contype='c' and pg_get_constraintdef(oid) like '%refeicao%' and pg_get_constraintdef(oid) like '%eliminacao%';
 if definicao like '%estado_emocional%' then raise exception 'CHECK_MEDIDA_JA_ALTERADO';end if;
 execute format('alter table cadastro.turno_medida_versao drop constraint %I',nome);
 -- Mesmas cinco formas de origem, preservadas palavra por palavra, mais a sexta:
 -- estado emocional NUNCA tem valor, unidade, contagem nem intervalo; tem rótulo declarado.
 alter table cadastro.turno_medida_versao add constraint turno_medida_versao_forma_chk check(coalesce(
  (tipo='refeicao' and momento in ('cafe','almoco','lanche','jantar','ceia') and aceitacao in ('total','parcial','minima','recusou') and valor is null and inicio is null and contagem is null)
  or (tipo='hidratacao' and valor>=0 and unidade='mL' and momento is null and inicio is null and contagem is null)
  or (tipo='sono' and inicio is not null and fim>=inicio and qualidade in ('tranquilo','agitado','nao_dormiu') and valor is null and momento is null and contagem is null)
  or (tipo='eliminacao' and eliminacao in ('urina','fezes') and contagem>=0 and valor is null and momento is null and inicio is null)
  or (tipo='estado_emocional' and qualidade is not null and valor is null and unidade is null and momento is null and aceitacao is null and inicio is null and fim is null and contagem is null and eliminacao is null)
  or (tipo not in ('refeicao','hidratacao','sono','eliminacao','estado_emocional') and valor is not null and unidade is not null and momento is null and inicio is null and contagem is null),false));
end $$;
-- A tabela tem RLS forçada e a policy é do owner do turno; a semeadura do tipo novo passa
-- por ele, sem ampliar nada e preservando membership e grantor do migrador.
do $$ declare migrador text:=current_user;tinha boolean; begin
 tinha:=pg_has_role(migrador,'ffcmapp_turno_execucao_owner','SET');
 if not tinha then execute format('grant %I to %I with inherit false,set true granted by %I','ffcmapp_turno_execucao_owner',migrador,migrador);end if;
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 insert into cadastro.turno_catalogo_medida(tipo,classe,unidade) values('estado_emocional','rotina',null);
 perform set_config('role',migrador,true);
 if not tinha then execute format('revoke %I from %I granted by %I','ffcmapp_turno_execucao_owner',migrador,migrador);end if;
end $$;

-- FR-074/FR-076. Conteúdo textual do plantão, append-only versionado, no desenho das demais
-- `*_versao`. Não mora em cadastro.turno porque aquela linha sofre UPDATE de ciclo de vida, e
-- conteúdo clínico cifrado com histórico imutável não pode morar em linha mutável. `id` é a
-- chave da LINHA e é o que o AAD amarra, como no lançamento de despesa.
create table cadastro.turno_plantao_versao(
 id uuid not null unique,
 registro_id uuid not null, versao integer not null check(versao>0), anterior integer,
 paciente_id uuid not null references cadastro.paciente(id),
 turno_id uuid not null references cadastro.turno(id),
 -- FR-079: rótulo de registro, não permissão. Gravado no REGISTRO, nunca na pessoa, para que
 -- renomear ou desativar o papel no catálogo não reescreva ficha antiga. O catálogo de papéis
 -- é a tarefa 6.1 e não é desta passagem; aqui a coluna aceita o rótulo declarado e nenhum
 -- caminho de autorização o consulta.
 papel_declarado text check(papel_declarado is null or length(papel_declarado) between 1 and 80),
 atividades jsonb, atividades_fonte text, atividades_visibilidade text,
 observacoes jsonb, observacoes_fonte text, observacoes_visibilidade text,
 motivo jsonb,
 autor_usuario_id uuid not null references public.usuario(id),
 registrado_em timestamptz not null default clock_timestamp(),
 primary key(registro_id,versao),
 foreign key(registro_id,anterior) references cadastro.turno_plantao_versao(registro_id,versao),
 check((versao=1 and anterior is null and motivo is null) or (versao>1 and anterior=versao-1 and motivo is not null)),
 check(num_nonnulls(atividades,atividades_fonte,atividades_visibilidade) in (0,3)),
 check(num_nonnulls(observacoes,observacoes_fonte,observacoes_visibilidade) in (0,3)),
 check(atividades_fonte is null or atividades_fonte in ('observacao_direta','relato_paciente','relato_familiar','documento')),
 check(observacoes_fonte is null or observacoes_fonte in ('observacao_direta','relato_paciente','relato_familiar','documento')),
 check(atividades_visibilidade is null or atividades_visibilidade in ('interna','compartilhavel')),
 check(observacoes_visibilidade is null or observacoes_visibilidade in ('interna','compartilhavel'))
);
-- FR-077. Pendência ESCRITA, em tabela própria: ela nasce num plantão e morre em outro, e
-- `origem` fechada em 'declarada' é o que a torna estruturalmente distinguível das quatro
-- pendências DERIVADAS de FR-027/FR-028, que são calculadas e vivem em outro lugar.
create table cadastro.turno_plantao_pendencia_versao(
 id uuid not null unique,
 registro_id uuid not null, versao integer not null check(versao>0), anterior integer,
 paciente_id uuid not null references cadastro.paciente(id),
 turno_id uuid not null references cadastro.turno(id),
 origem text not null default 'declarada' check(origem='declarada'),
 conteudo jsonb not null,
 fonte text not null check(fonte in ('observacao_direta','relato_paciente','relato_familiar','documento')),
 visibilidade text not null check(visibilidade in ('interna','compartilhavel')),
 situacao text not null check(situacao in ('aberta','resolvida')),
 declarado_por_usuario_id uuid not null references public.usuario(id),
 resolvido_por_usuario_id uuid references public.usuario(id),
 resolvido_em timestamptz,
 motivo jsonb,
 autor_usuario_id uuid not null references public.usuario(id),
 registrado_em timestamptz not null default clock_timestamp(),
 primary key(registro_id,versao),
 foreign key(registro_id,anterior) references cadastro.turno_plantao_pendencia_versao(registro_id,versao),
 check((versao=1 and anterior is null and motivo is null and situacao='aberta') or (versao>1 and anterior=versao-1 and motivo is not null)),
 -- Não existe fechamento sem ator identificado: é estrutura, não convenção de código.
 check((situacao='resolvida')=(resolvido_por_usuario_id is not null)),
 check((resolvido_em is null)=(resolvido_por_usuario_id is null))
);
-- FR-074/D6. Rascunho no SERVIDOR, cifrado, uma linha por (turno, autor), mutável porque é
-- trabalho em andamento e não registro. `localStorage` foi descartado: poria conteúdo clínico
-- em claro no aparelho de plantão compartilhado, fora do envelope e fora da RLS. Nenhum owner
-- de relatório, exportação ou audiência familiar recebe grant algum nesta tabela, e a policy
-- restringe a linha ao próprio autor mesmo para o owner desta fatia.
create table cadastro.ficha_plantao_rascunho(
 turno_id uuid not null references cadastro.turno(id),
 autor_usuario_id uuid not null references public.usuario(id),
 id uuid not null unique,
 paciente_id uuid not null references cadastro.paciente(id),
 conteudo jsonb not null,
 atualizado_em timestamptz not null default clock_timestamp(),
 primary key(turno_id,autor_usuario_id)
);
create table operacao.ficha_plantao_recibo(
 ator_usuario_id uuid not null references public.usuario(id), chave text not null, digest text not null,
 registro_id uuid not null, versao integer not null,
 primary key(ator_usuario_id,chave), check(length(chave) between 16 and 200), check(digest~'^[A-Za-z0-9_-]{43}$')
);
create index turno_plantao_turno_idx on cadastro.turno_plantao_versao(turno_id,registro_id,versao);
create index turno_plantao_caso_idx on cadastro.turno_plantao_versao(paciente_id,registro_id,versao);
create index turno_plantao_pendencia_caso_idx on cadastro.turno_plantao_pendencia_versao(paciente_id,registro_id,versao);
create index turno_plantao_pendencia_turno_idx on cadastro.turno_plantao_pendencia_versao(turno_id,registro_id,versao);
create index ficha_plantao_rascunho_autor_idx on cadastro.ficha_plantao_rascunho(autor_usuario_id);

alter table cadastro.turno_periodo_catalogo enable row level security;
alter table cadastro.turno_periodo_catalogo force row level security;
revoke all on cadastro.turno_periodo_catalogo from public,anon,authenticated,service_role;
grant select on cadastro.turno_periodo_catalogo to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_periodo_catalogo on cadastro.turno_periodo_catalogo for select to ffcmapp_ficha_plantao_owner using(true);
alter table cadastro.turno_estado_emocional_catalogo enable row level security;
alter table cadastro.turno_estado_emocional_catalogo force row level security;
revoke all on cadastro.turno_estado_emocional_catalogo from public,anon,authenticated,service_role;
grant select on cadastro.turno_estado_emocional_catalogo to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_estado_catalogo on cadastro.turno_estado_emocional_catalogo for select to ffcmapp_ficha_plantao_owner using(true);
alter table cadastro.turno_plantao_versao enable row level security;
alter table cadastro.turno_plantao_versao force row level security;
revoke all on cadastro.turno_plantao_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_plantao_versao to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_versao on cadastro.turno_plantao_versao to ffcmapp_ficha_plantao_owner using(true) with check(true);
create trigger turno_plantao_versao_imutavel before update or delete on cadastro.turno_plantao_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_plantao_pendencia_versao enable row level security;
alter table cadastro.turno_plantao_pendencia_versao force row level security;
revoke all on cadastro.turno_plantao_pendencia_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_plantao_pendencia_versao to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_pendencia on cadastro.turno_plantao_pendencia_versao to ffcmapp_ficha_plantao_owner using(true) with check(true);
create trigger turno_plantao_pendencia_versao_imutavel before update or delete on cadastro.turno_plantao_pendencia_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.ficha_plantao_rascunho enable row level security;
alter table cadastro.ficha_plantao_rascunho force row level security;
revoke all on cadastro.ficha_plantao_rascunho from public,anon,authenticated,service_role;
grant select,insert,update,delete on cadastro.ficha_plantao_rascunho to ffcmapp_ficha_plantao_owner;
-- Só o autor, e isso vale também para o owner da fatia: a RLS forçada não tem exceção.
create policy ficha_plantao_rascunho_autor on cadastro.ficha_plantao_rascunho to ffcmapp_ficha_plantao_owner using(autor_usuario_id=(select auth_privado.uid())) with check(autor_usuario_id=(select auth_privado.uid()));
alter table operacao.ficha_plantao_recibo enable row level security;
alter table operacao.ficha_plantao_recibo force row level security;
revoke all on operacao.ficha_plantao_recibo from public,anon,authenticated,service_role;
grant select,insert on operacao.ficha_plantao_recibo to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_recibo on operacao.ficha_plantao_recibo to ffcmapp_ficha_plantao_owner using(true) with check(true);
create trigger ficha_plantao_recibo_imutavel before update or delete on operacao.ficha_plantao_recibo for each row execute function cadastro.turno_grupo3_imutavel();
grant execute on function cadastro.turno_grupo3_imutavel() to ffcmapp_ficha_plantao_owner;

-- Leituras e locks que a autoridade reaproveitada exige. Mesmas colunas, mesmas formas de
-- lock (update(versao) com `with check(false)`) do owner de execução: nada aqui amplia o que
-- o turno já enxerga, e nenhuma coluna de conteúdo clínico entra.
grant select(paciente_id,usuario_id,revogada_em) on cadastro.acesso_paciente to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_acesso_paciente on cadastro.acesso_paciente for select to ffcmapp_ficha_plantao_owner using(true);
grant update(versao) on cadastro.acesso_paciente to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_lock_acesso_paciente on cadastro.acesso_paciente for update to ffcmapp_ficha_plantao_owner using(true) with check(false);
grant select(id) on cadastro.paciente to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_paciente on cadastro.paciente for select to ffcmapp_ficha_plantao_owner using(true);
grant update(versao) on cadastro.paciente to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_lock_paciente on cadastro.paciente for update to ffcmapp_ficha_plantao_owner using(true) with check(false);
grant select(chave,valor,tipo) on identidade.configuracao_sistema to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_configuracao on identidade.configuracao_sistema for select to ffcmapp_ficha_plantao_owner using(true);
grant update(valor) on identidade.configuracao_sistema to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_lock_configuracao on identidade.configuracao_sistema for update to ffcmapp_ficha_plantao_owner using(true) with check(false);
grant select(id,perfil,ativo),update(versao) on public.usuario to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_usuario on public.usuario for select to ffcmapp_ficha_plantao_owner using(true);
create policy ficha_plantao_lock_usuario on public.usuario for update to ffcmapp_ficha_plantao_owner using(true) with check(false);
grant select(usuario_id) on identidade.acesso_gerenciado to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_gerenciado on identidade.acesso_gerenciado for select to ffcmapp_ficha_plantao_owner using(usuario_id=(select auth_privado.uid()));
grant select(id,paciente_id,profissional_usuario_id,aberto_em,encerrado_em,situacao,versao,parametros,periodo,janela_declarada_inicio,janela_declarada_fim,janela_declarada_em,janela_declarada_por_usuario_id) on cadastro.turno to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_turno on cadastro.turno for select to ffcmapp_ficha_plantao_owner using(true);
-- O período e a janela declarada são do turno; o restante da linha continua fora do alcance
-- desta fatia pelo grant por coluna. `aberto_em` NÃO é atualizável aqui.
grant update(periodo,janela_declarada_inicio,janela_declarada_fim,janela_declarada_em,janela_declarada_por_usuario_id,versao) on cadastro.turno to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_escrita_turno on cadastro.turno for update to ffcmapp_ficha_plantao_owner using(true) with check(true);
-- Estado emocional é registro canônico de rotina; por isso entra em turno_medida_versao, e
-- não numa coluna de texto do plantão. A policy fecha a porta por estrutura: este owner não
-- consegue gravar nenhum outro tipo de medida, nem outra classe de registro de execução.
grant select,insert on cadastro.turno_execucao_registro to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_execucao_registro on cadastro.turno_execucao_registro for select to ffcmapp_ficha_plantao_owner using(true);
create policy ficha_plantao_escrita_execucao_registro on cadastro.turno_execucao_registro for insert to ffcmapp_ficha_plantao_owner with check(classe='rotina');
grant select on cadastro.turno_catalogo_medida to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_catalogo_medida on cadastro.turno_catalogo_medida for select to ffcmapp_ficha_plantao_owner using(true);
grant select,insert on cadastro.turno_medida_versao to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_leitura_medida on cadastro.turno_medida_versao for select to ffcmapp_ficha_plantao_owner using(true);
create policy ficha_plantao_escrita_medida on cadastro.turno_medida_versao for insert to ffcmapp_ficha_plantao_owner with check(tipo='estado_emocional' and valor is null);
grant insert(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_ficha_plantao_owner;
create policy ficha_plantao_auditoria on auditoria.evento for insert to ffcmapp_ficha_plantao_owner with check((ator_usuario_id=(select auth_privado.uid()) and ator_auth_id is null) or (ator_usuario_id is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado'));

-- Envelope cifrado com AAD na forma genérica do repositório: {tabela,registro_id,campo,formato},
-- com `registro_id` no `id` da LINHA. Mesmas conferências estruturais do envelope do turno.
create function operacao.validar_cifra_ficha_plantao(p_cifra jsonb,p_aad jsonb,p_registro uuid,p_tabela text,p_campo text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p_cifra)='object' and p_cifra-array['formato','key_id','nonce','ciphertext','tag']='{}'::jsonb and p_cifra->'formato'='1'::jsonb
 and length(p_cifra->>'key_id') between 1 and 128 and p_cifra->>'nonce'~'^[A-Za-z0-9_-]+$' and p_cifra->>'ciphertext'~'^[A-Za-z0-9_-]+$' and p_cifra->>'tag'~'^[A-Za-z0-9_-]+$'
 and length(p_cifra->>'ciphertext')<=32768 and p_aad=jsonb_build_object('tabela',p_tabela,'registro_id',p_registro,'campo',p_campo,'formato',1),false)
$$;
revoke all on function operacao.validar_cifra_ficha_plantao(jsonb,jsonb,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function operacao.validar_cifra_ficha_plantao(jsonb,jsonb,uuid,text,text) to ffcmapp_ficha_plantao_owner;

-- Projeção da ficha e das pendências do plantão. Origem declarada é literal: a pendência
-- escrita nunca é apresentada como se fosse calculada.
create function operacao.projetar_ficha_plantao(p_paciente uuid,p_turno uuid,p_registro uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'ficha',(select jsonb_build_object('registro_id',f.registro_id,'paciente_id',f.paciente_id,'turno_id',f.turno_id,'versao',f.versao,
     'periodo',t.periodo,'papel_declarado',f.papel_declarado,
     'atividades',f.atividades,'atividades_fonte',f.atividades_fonte,'atividades_visibilidade',f.atividades_visibilidade,
     'observacoes',f.observacoes,'observacoes_fonte',f.observacoes_fonte,'observacoes_visibilidade',f.observacoes_visibilidade,
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
revoke all on function operacao.projetar_ficha_plantao(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function operacao.projetar_ficha_plantao(uuid,uuid,uuid) to ffcmapp_ficha_plantao_owner;

-- D1. Submissão atômica: tudo o que a ficha grava acontece nesta transação. As gravações
-- canônicas são delegadas a `api.turno_execucao`, o MESMO caminho de FR-059/FR-060/FR-061/
-- FR-064 que a tela avulsa usa — a ficha não reimplementa validação clínica nem cria segunda
-- fonte de verdade. Qualquer parte que falhe levanta exceção e derruba a transação inteira:
-- não existe meia-ficha, e a auditoria da tentativa negada é da wrapper.
create function operacao.ficha_plantao_operacao_privada(p_transporte jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';ctx jsonb;ator uuid:=auth_privado.uid();paciente uuid;req uuid;acao text;
 t cadastro.turno;conteudo jsonb;registro uuid;linha uuid;versao integer;esperada integer;atual integer;alvo_turno uuid;resultado jsonb;repeticao boolean:=false;
 recibo operacao.ficha_plantao_recibo;pend jsonb;pendencia cadastro.turno_plantao_pendencia_versao;filho jsonb;resposta jsonb;chaves text[]:='{}';
 emocional jsonb;medida uuid;instante timestamptz;inicio timestamptz;fim timestamptz;tolerancia integer;rascunho uuid;
begin
 ctx:=operacao.autorizar_execucao_turno(p_transporte,array['api.gravar_ficha_plantao','api.consultar_ficha_plantao','api.resolver_pendencia_plantao','api.salvar_rascunho_ficha_plantao','api.consultar_rascunho_ficha_plantao']);
 paciente:=(e->>'paciente_id')::uuid;req:=(e->>'request_id')::uuid;acao:=a->>'operacao';
 -- A ficha é do profissional do plantão. Família não escreve nem lê por aqui: a audiência
 -- familiar é a de FR-062, pela projeção autorizada do relatório, que esta fatia não altera.
 if ctx->>'perfil' not in ('profissional','administrador') then raise insufficient_privilege;end if;
 if acao<>'api.consultar_ficha_plantao' and ctx->>'perfil'<>'profissional' then raise insufficient_privilege;end if;
 alvo_turno:=(e->>'turno_id')::uuid;
 if acao='api.consultar_ficha_plantao' then
  if e-array['request_id','paciente_id','turno_id','registro_id','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  resultado:=operacao.projetar_ficha_plantao(paciente,alvo_turno,(e->>'registro_id')::uuid);
 elsif acao in ('api.salvar_rascunho_ficha_plantao','api.consultar_rascunho_ficha_plantao') then
  -- FR-074/D6. Uma linha por (turno, autor); a policy da tabela já impede ler a de outro.
  if alvo_turno is null then raise invalid_parameter_value;end if;
  select * into t from cadastro.turno where id=alvo_turno and paciente_id=paciente and profissional_usuario_id=ator and situacao='aberto' for share;
  if not found then raise insufficient_privilege;end if;
  if acao='api.salvar_rascunho_ficha_plantao' then
   if e-array['request_id','paciente_id','turno_id','id','conteudo','aad','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
   rascunho:=(e->>'id')::uuid;
   if rascunho is null or not operacao.validar_cifra_ficha_plantao(e->'conteudo',e->'aad'->'conteudo',rascunho,'cadastro.ficha_plantao_rascunho','conteudo') then raise invalid_parameter_value;end if;
   -- `id` novo a cada gravação: o envelope da versão anterior deixa de servir para esta linha.
   insert into cadastro.ficha_plantao_rascunho(turno_id,autor_usuario_id,id,paciente_id,conteudo) values(alvo_turno,ator,rascunho,paciente,e->'conteudo')
    on conflict(turno_id,autor_usuario_id) do update set id=excluded.id,conteudo=excluded.conteudo,atualizado_em=clock_timestamp();
  elsif e-array['request_id','paciente_id','turno_id','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  select jsonb_build_object('ficha',null,'pendencias','[]'::jsonb,'rascunho',jsonb_build_object('rascunho_id',r.id,'turno_id',r.turno_id,'paciente_id',r.paciente_id,'conteudo',r.conteudo,'atualizado_em',r.atualizado_em)) into resultado
   from cadastro.ficha_plantao_rascunho r where r.turno_id=alvo_turno and r.autor_usuario_id=ator;
  resultado:=coalesce(resultado,jsonb_build_object('ficha',null,'pendencias','[]'::jsonb,'rascunho',null));
 elsif acao='api.resolver_pendencia_plantao' then
  -- FR-077: resolução é ato explícito, de pessoa identificada e com vínculo vivo no caso.
  if e-array['request_id','paciente_id','registro_id','id','versao_esperada','motivo','aad','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  registro:=(e->>'registro_id')::uuid;linha:=(e->>'id')::uuid;esperada:=(e->>'versao_esperada')::integer;
  if registro is null or linha is null or esperada is null or esperada<1 then raise invalid_parameter_value;end if;
  select * into recibo from operacao.ficha_plantao_recibo where ator_usuario_id=ator and chave=e->>'chave_idempotencia';
  if found then
   if recibo.digest is distinct from e->>'digest_idempotencia' or recibo.registro_id<>registro then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;
   repeticao:=true;
  else
   select * into pendencia from cadastro.turno_plantao_pendencia_versao p where p.registro_id=registro and p.paciente_id=paciente and p.versao=(select max(z.versao) from cadastro.turno_plantao_pendencia_versao z where z.registro_id=registro);
   if not found then raise insufficient_privilege;end if;
   if pendencia.versao<>esperada then raise exception using errcode='PZ064',message='conflito';end if;
   if pendencia.situacao<>'aberta' then raise exception using errcode='PZ064',message='conflito';end if;
   if not operacao.validar_cifra_ficha_plantao(e->'motivo',e->'aad'->'motivo',linha,'cadastro.turno_plantao_pendencia_versao','motivo') then raise invalid_parameter_value;end if;
   -- Texto, fonte, visibilidade e autoria originais seguem íntegros na versão nova e na antiga.
   insert into cadastro.turno_plantao_pendencia_versao(id,registro_id,versao,anterior,paciente_id,turno_id,conteudo,fonte,visibilidade,situacao,declarado_por_usuario_id,resolvido_por_usuario_id,resolvido_em,motivo,autor_usuario_id)
    values(linha,registro,pendencia.versao+1,pendencia.versao,paciente,pendencia.turno_id,pendencia.conteudo,pendencia.fonte,pendencia.visibilidade,'resolvida',pendencia.declarado_por_usuario_id,ator,clock_timestamp(),e->'motivo',ator);
   insert into operacao.ficha_plantao_recibo(ator_usuario_id,chave,digest,registro_id,versao) values(ator,e->>'chave_idempotencia',e->>'digest_idempotencia',registro,pendencia.versao+1);
  end if;
  resultado:=operacao.projetar_ficha_plantao(paciente,null,registro);
 else
  if e-array['request_id','paciente_id','turno_id','registro_id','id','versao','versao_esperada','conteudo','pendencias','canonicos','motivo','aad','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  registro:=(e->>'registro_id')::uuid;linha:=(e->>'id')::uuid;versao:=(e->>'versao')::integer;esperada:=(e->>'versao_esperada')::integer;conteudo:=e->'conteudo';
  if registro is null or linha is null or alvo_turno is null or esperada is null or esperada<0 or versao is distinct from esperada+1 or jsonb_typeof(conteudo) is distinct from 'object'
   or conteudo-array['periodo','janela_declarada','papel_declarado','atividades','observacoes','estado_emocional']<>'{}'::jsonb
   or length(coalesce(e->>'chave_idempotencia',''))not between 16 and 200 or coalesce(e->>'chave_idempotencia','')!~'^[A-Za-z0-9_-]+$' or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$'
   or (versao=1 and e ? 'motivo') or (versao>1 and not(e ? 'motivo')) then raise invalid_parameter_value;end if;
  -- D5/0.7: a ficha EXIGE turno aberto do próprio profissional. Sem turno não há janela, não
  -- há vínculo verificado no momento do ato e não há a quem atribuir o plantão.
  select * into t from cadastro.turno where id=alvo_turno and paciente_id=paciente and profissional_usuario_id=ator and situacao='aberto' for share;
  if not found then raise insufficient_privilege;end if;
  select * into recibo from operacao.ficha_plantao_recibo where ator_usuario_id=ator and chave=e->>'chave_idempotencia';
  if found then
   if recibo.digest is distinct from e->>'digest_idempotencia' or recibo.registro_id<>registro or recibo.versao<>versao then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;
   repeticao:=true;
  else
   select max(v.versao) into atual from cadastro.turno_plantao_versao v where v.registro_id=registro;
   if coalesce(atual,0)<>esperada then raise exception using errcode='PZ064',message='conflito';end if;
   if exists(select 1 from cadastro.turno_plantao_versao v where v.registro_id=registro and (v.paciente_id<>paciente or v.turno_id<>alvo_turno or v.autor_usuario_id<>ator)) then raise insufficient_privilege;end if;
   -- Período declarado, nunca inferido do relógio; valor fora do conjunto administrado cai
   -- aqui. A janela declarada entra na MESMA atualização, com um único bump de versão.
   if conteudo ? 'periodo' then
    perform 1 from cadastro.turno_periodo_catalogo c where c.periodo=conteudo->>'periodo' and c.ativo;
    if not found then raise invalid_parameter_value;end if;
   end if;
   if conteudo ? 'janela_declarada' then
    -- Abertura retroativa declarada, com teto na tolerância administrada vigente à época.
    if (conteudo->'janela_declarada')-array['inicio','fim']<>'{}'::jsonb then raise invalid_parameter_value;end if;
    inicio:=(conteudo#>>'{janela_declarada,inicio}')::timestamptz;fim:=(conteudo#>>'{janela_declarada,fim}')::timestamptz;
    tolerancia:=(t.parametros->>'tolerancia_atraso_minutos')::integer;
    if inicio is null or fim is null or fim<inicio or inicio>t.aberto_em or fim>clock_timestamp() or tolerancia is null
     or t.aberto_em-inicio>make_interval(mins=>tolerancia) then raise invalid_parameter_value;end if;
   end if;
   if conteudo ?| array['periodo','janela_declarada'] then
    update cadastro.turno alvo set
     periodo=case when conteudo ? 'periodo' then conteudo->>'periodo' else alvo.periodo end,
     janela_declarada_inicio=case when inicio is null then alvo.janela_declarada_inicio else inicio end,
     janela_declarada_fim=case when inicio is null then alvo.janela_declarada_fim else fim end,
     janela_declarada_em=case when inicio is null then alvo.janela_declarada_em else clock_timestamp() end,
     janela_declarada_por_usuario_id=case when inicio is null then alvo.janela_declarada_por_usuario_id else ator end,
     versao=alvo.versao+1
    where alvo.id=alvo_turno;
   end if;
   if conteudo ? 'papel_declarado' and length(coalesce(conteudo->>'papel_declarado',''))not between 1 and 80 then raise invalid_parameter_value;end if;
   if conteudo ? 'atividades' and (conteudo->'atividades')-array['conteudo','fonte','visibilidade']<>'{}'::jsonb then raise invalid_parameter_value;end if;
   if conteudo ? 'observacoes' and (conteudo->'observacoes')-array['conteudo','fonte','visibilidade']<>'{}'::jsonb then raise invalid_parameter_value;end if;
   if conteudo ? 'atividades' and not operacao.validar_cifra_ficha_plantao(conteudo#>'{atividades,conteudo}',e->'aad'->'atividades',linha,'cadastro.turno_plantao_versao','atividades') then raise invalid_parameter_value;end if;
   if conteudo ? 'observacoes' and not operacao.validar_cifra_ficha_plantao(conteudo#>'{observacoes,conteudo}',e->'aad'->'observacoes',linha,'cadastro.turno_plantao_versao','observacoes') then raise invalid_parameter_value;end if;
   if versao>1 and not operacao.validar_cifra_ficha_plantao(e->'motivo',e->'aad'->'motivo',linha,'cadastro.turno_plantao_versao','motivo') then raise invalid_parameter_value;end if;
   insert into cadastro.turno_plantao_versao(id,registro_id,versao,anterior,paciente_id,turno_id,papel_declarado,atividades,atividades_fonte,atividades_visibilidade,observacoes,observacoes_fonte,observacoes_visibilidade,motivo,autor_usuario_id)
    values(linha,registro,versao,case when versao=1 then null else esperada end,paciente,alvo_turno,conteudo->>'papel_declarado',
     conteudo#>'{atividades,conteudo}',conteudo#>>'{atividades,fonte}',conteudo#>>'{atividades,visibilidade}',
     conteudo#>'{observacoes,conteudo}',conteudo#>>'{observacoes,fonte}',conteudo#>>'{observacoes,visibilidade}',e->'motivo',ator);
   -- FR-076. Estado emocional: registro canônico de rotina, com observador e instante, SEM
   -- valor. A policy de escrita desta fatia só aceita este tipo e só com `valor is null`.
   if conteudo ? 'estado_emocional' then
    emocional:=conteudo->'estado_emocional';
    if emocional-array['id','estado','instante_ocorrencia']<>'{}'::jsonb then raise invalid_parameter_value;end if;
    medida:=(emocional->>'id')::uuid;instante:=(emocional->>'instante_ocorrencia')::timestamptz;
    if medida is null or instante is null or instante<t.aberto_em or instante>clock_timestamp() then raise invalid_parameter_value;end if;
    perform 1 from cadastro.turno_estado_emocional_catalogo c where c.estado=emocional->>'estado' and c.ativo;
    if not found then raise invalid_parameter_value;end if;
    perform 1 from cadastro.turno_catalogo_medida c where c.tipo='estado_emocional' and c.classe='rotina' and c.ativo and c.unidade is null;
    if not found then raise invalid_parameter_value;end if;
    insert into cadastro.turno_execucao_registro(id,paciente_id,turno_id,classe,autor_usuario_id) values(medida,paciente,alvo_turno,'rotina',ator);
    insert into cadastro.turno_medida_versao(registro_id,versao,anterior,tipo,instante_ocorrencia,qualidade,autor_usuario_id)
     values(medida,1,null,'estado_emocional',instante,emocional->>'estado',ator);
   end if;
   -- FR-077. Pendências escritas do plantão, abertas por pessoa identificada.
   if e ? 'pendencias' then
    if jsonb_typeof(e->'pendencias') is distinct from 'array' or jsonb_array_length(e->'pendencias')>20 then raise invalid_parameter_value;end if;
    for pend in select v from jsonb_array_elements(e->'pendencias') v loop
     if pend-array['pendencia_id','id','conteudo','fonte','visibilidade','aad']<>'{}'::jsonb
      or (pend->>'pendencia_id')::uuid is null or (pend->>'id')::uuid is null
      or not operacao.validar_cifra_ficha_plantao(pend->'conteudo',pend->'aad',(pend->>'id')::uuid,'cadastro.turno_plantao_pendencia_versao','conteudo') then raise invalid_parameter_value;end if;
     insert into cadastro.turno_plantao_pendencia_versao(id,registro_id,versao,anterior,paciente_id,turno_id,conteudo,fonte,visibilidade,situacao,declarado_por_usuario_id,autor_usuario_id)
      values((pend->>'id')::uuid,(pend->>'pendencia_id')::uuid,1,null,paciente,alvo_turno,pend->'conteudo',pend->>'fonte',pend->>'visibilidade','aberta',ator,ator);
    end loop;
   end if;
   -- Gravações canônicas pelo caminho canônico, na mesma transação. Cada transporte filho é
   -- conferido contra o pedido do pai: mesmo pedido, mesmo caso, mesmo ator, mesma sessão,
   -- mesmo alvo_turno e ação de gravação de execução. Falha de qualquer um derruba tudo.
   if e ? 'canonicos' then
    if jsonb_typeof(e->'canonicos') is distinct from 'array' or jsonb_array_length(e->'canonicos')>40 then raise invalid_parameter_value;end if;
    for filho in select v from jsonb_array_elements(e->'canonicos') v loop
     if filho#>>'{entrada,paciente_id}' is distinct from paciente::text or filho#>>'{entrada,request_id}' is distinct from req::text
      or filho#>>'{entrada,atestado,usuario_id}' is distinct from ator::text or filho#>>'{entrada,atestado,session_id}' is distinct from ctx->>'session_id'
      or filho#>>'{entrada,atestado,operacao}' is distinct from 'api.gravar_execucao_turno'
      or filho#>>'{entrada,conteudo,dados,turno_id}' is distinct from alvo_turno::text
      or filho#>>'{entrada,chave_idempotencia}' is null then raise insufficient_privilege;end if;
     if filho#>>'{entrada,chave_idempotencia}'=any(chaves) or filho#>>'{entrada,chave_idempotencia}'=e->>'chave_idempotencia' then raise invalid_parameter_value;end if;
     chaves:=chaves||array[filho#>>'{entrada,chave_idempotencia}'];
     resposta:=api.turno_execucao(filho);
     if resposta->>'ok' is distinct from 'true' then raise exception using errcode='PZ064',message='conflito';end if;
    end loop;
   end if;
   -- D6: publicação bem-sucedida remove o rascunho, na mesma transação.
   delete from cadastro.ficha_plantao_rascunho where turno_id=alvo_turno and autor_usuario_id=ator;
   insert into operacao.ficha_plantao_recibo(ator_usuario_id,chave,digest,registro_id,versao) values(ator,e->>'chave_idempotencia',e->>'digest_idempotencia',registro,versao);
  end if;
  resultado:=operacao.projetar_ficha_plantao(paciente,alvo_turno,registro);
 end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resultado,'request_id',req);
end $$;
revoke all on function operacao.ficha_plantao_operacao_privada(jsonb) from public,anon,authenticated,service_role;
grant execute on function operacao.ficha_plantao_operacao_privada(jsonb) to ffcmapp_ficha_plantao_owner;
create function api.ficha_plantao_privado(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();req uuid;paciente uuid;codigo text;acao text;
begin
 begin return operacao.ficha_plantao_operacao_privada(p_transporte);
 exception when others then codigo:=case when sqlstate='PZ064' and sqlerrm in ('conflito','conflito_idempotencia') then sqlerrm when sqlstate='42501' then 'sem_permissao' when sqlstate in ('22023','22P02','22007','22008','22003','23514','23502') then 'entrada_invalida' when sqlstate in ('23505','23503') then 'conflito' else 'servico_indisponivel' end;end;
 req:=(p_transporte#>>'{entrada,request_id}')::uuid;paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
 if ator is null or req is null then raise insufficient_privilege;end if;
 acao:=p_transporte#>>'{entrada,atestado,operacao}';
 if acao is null or acao not in ('api.gravar_ficha_plantao','api.consultar_ficha_plantao','api.resolver_pendencia_plantao','api.salvar_rascunho_ficha_plantao','api.consultar_rascunho_ficha_plantao') then acao:='api.gravar_ficha_plantao';end if;
 if exists(select 1 from public.usuario where id=ator) then insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 else insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);end if;
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $$;
alter function api.ficha_plantao_privado(jsonb) owner to ffcmapp_ficha_plantao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_ficha_plantao_owner',true);
 revoke all on function api.ficha_plantao_privado(jsonb) from public,anon,authenticated,service_role;
 perform set_config('role',migrador,true);
end $acl$;
revoke create on schema api from ffcmapp_ficha_plantao_owner;
revoke ffcmapp_ficha_plantao_owner from current_user;
commit;
