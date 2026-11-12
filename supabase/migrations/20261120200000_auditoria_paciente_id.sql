-- FR-039 (openspec/specs/sigilo-e-governanca/spec.md): "Registrar consultas, alterações,
-- downloads/exportações e mudanças de acesso com identidade, data e objeto. Apenas responsáveis
-- autorizados podem consultar a auditoria, que deve evitar repetir conteúdo clínico
-- desnecessariamente."
--
-- Decisão do solicitante de 12/11/2026: passar a gravar o CASO junto do evento, para que a
-- consulta de auditoria (20261119300000) possa responder "o que aconteceu no caso da Maria".
-- Eventos anteriores a esta migration ficam sem o campo; aparecem nos demais filtros.
--
-- COMO, sem reescrever função nenhuma. A varredura das definições vigentes de `operacao.*` e
-- `api.*` mostrou que a trilha JÁ carrega o caso na maioria esmagadora dos pontos: 121 dos ~290
-- `insert into auditoria.evento` gravam `tipo_objeto = 'paciente'` com `objeto_id` = o próprio
-- paciente (saúde, plano, diário, anamnese, tarefas, documentos, encaminhamentos, orientações,
-- contexto, rede, transcrição, pendências, crise — nos caminhos `permitido` E `negado`). Não
-- faltava o dado: faltava uma coluna onde filtrá-lo sem varrer `tipo_objeto` na consulta.
--
-- Por isso o preenchimento é um GATILHO BEFORE INSERT, e não ~55 `create or replace` de funções
-- de autorização de 100 a 200 linhas cada. Reescrever em massa teria custo de revisão alto e
-- risco real: um erro de transcrição em qualquer uma delas quebra uma trilha de autorização em
-- silêncio. O gatilho é uma peça só, pequena, revisável e provada.
--
-- Foi verificado empiricamente, em cluster descartável, que um gatilho BEFORE INSERT preenche
-- uma coluna sobre a qual o papel que insere NÃO tem privilégio, e que esse mesmo papel continua
-- recusado se nomear a coluna explicitamente. Logo: nenhum dos ~95 donos que inserem na trilha
-- precisa de grant novo, e nenhum deles ganha a capacidade de forjar o rótulo de caso.
--
-- SEM CHAVE ESTRANGEIRA, de propósito. A trilha é append-only e não pode falhar: um caminho
-- `negado` legítimo pode carregar um identificador que não existe (alguém sondando um uuid
-- inventado). Com FK, esse insert falharia e derrubaria a operação junto — trocaríamos um
-- rótulo ausente por auditoria perdida. O campo é rótulo de correlação, não integridade.
alter table auditoria.evento add column paciente_id uuid;

comment on column auditoria.evento.paciente_id is
  'Caso ao qual o evento pertence, quando há um. Nulo em evento institucional (sessão, '
  'configuração, equipe, carteira) e em evento anterior a 20261120200000. Preenchido pelo '
  'gatilho evento_marcar_caso; sem chave estrangeira para que a trilha nunca falhe.';

-- Índice só do que o filtro por caso alcança. A ordem acompanha a da consulta, que lê do mais
-- recente para o mais antigo; o parcial evita carregar os eventos institucionais, que são a
-- maioria do que não é de caso.
create index evento_paciente_instante_idx on auditoria.evento (paciente_id, instante desc, id desc)
  where paciente_id is not null;

-- O resolvedor. Duas regras, nesta ordem:
--
-- 1. `tipo_objeto = 'paciente'` — cópia pura de `objeto_id`. Nenhuma leitura, nenhum privilégio
--    novo, nenhum custo além da atribuição. Cobre os 121 pontos citados acima.
-- 2. `tipo_objeto = 'acesso_paciente'` — uma leitura em UMA tabela, UMA coluna
--    (`cadastro.acesso_paciente.paciente_id`). Entra porque FR-039 nomeia "mudanças de acesso"
--    entre o que a trilha precisa registrar, e esses eventos gravam a linha do vínculo, não o
--    caso. É a função que lê, como SECURITY DEFINER com dono próprio e privilégio mínimo — o
--    dono da CONSULTA de auditoria não ganha nada com isso e continua sem alcançar o domínio
--    clínico, que é o controle de coluna estabelecido em 20261119300000.
--
-- Nunca sobrescreve um valor já informado e nunca inventa caso: o que não resolve fica nulo.
-- `contato`, `objetivo_cuidado_aprovacao` e `convite_familiar` também pertencem a um caso e
-- NÃO são resolvidos aqui — estão registrados como limitação em tasks.md. Ampliar o resolvedor
-- custa uma tabela e uma coluna por tipo; não foi feito sem necessidade demonstrada.
create function auditoria.marcar_caso_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paciente_id is not null then
    return new;
  end if;
  if new.objeto_id is null then
    return new;
  end if;
  if new.tipo_objeto = 'paciente' then
    new.paciente_id := new.objeto_id;
  elsif new.tipo_objeto = 'acesso_paciente' then
    select a.paciente_id into new.paciente_id
      from cadastro.acesso_paciente a where a.id = new.objeto_id;
  end if;
  return new;
end;
$$;

create trigger evento_marcar_caso
before insert on auditoria.evento
for each row execute function auditoria.marcar_caso_evento();

revoke all on function auditoria.marcar_caso_evento() from public, anon, authenticated, service_role;

-- Dono dedicado do resolvedor: sem login, sem bypass de RLS, e com leitura de exatamente duas
-- colunas de uma tabela. `motivo_concessao_cifrado` e `motivo_revogacao_cifrado` ficam fora.
create role ffcmapp_marcar_caso_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_marcar_caso_owner to current_user with inherit false, set true;
grant usage on schema cadastro, auditoria to ffcmapp_marcar_caso_owner;
grant select (id, paciente_id) on cadastro.acesso_paciente to ffcmapp_marcar_caso_owner;
create policy marcar_caso_acesso_select on cadastro.acesso_paciente
  for select to ffcmapp_marcar_caso_owner using (true);
-- `alter function ... owner to` exige que o NOVO dono tenha CREATE no schema da função. O
-- migrador local costuma ser dono de `auditoria` e mascara a falta; no projeto remoto não é, e o
-- comando recusa com 42501. CREATE entra só para a troca de dono e sai logo depois, no mesmo
-- padrão de `20261110130000_carteira_tecnica_nativa.sql`: o papel não guarda poder de criar
-- objetos em `auditoria`. A guarda preserva CREATE preexistente, se houver.
select set_config('ffcmapp.marcar_caso_tinha_create', exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a join pg_roles r on r.oid = a.grantee where n.nspname = 'auditoria' and r.rolname = 'ffcmapp_marcar_caso_owner' and a.privilege_type = 'CREATE')::text, false);
do $$ begin
  if current_setting('ffcmapp.marcar_caso_tinha_create') = 'false' then
    grant create on schema auditoria to ffcmapp_marcar_caso_owner;
  end if;
end $$;
alter function auditoria.marcar_caso_evento() owner to ffcmapp_marcar_caso_owner;
do $$ begin
  if current_setting('ffcmapp.marcar_caso_tinha_create') = 'false' then
    revoke create on schema auditoria from ffcmapp_marcar_caso_owner;
  end if;
end $$;
select set_config('ffcmapp.marcar_caso_migrador', current_user, false);
set role ffcmapp_marcar_caso_owner;
revoke all on function auditoria.marcar_caso_evento() from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.marcar_caso_migrador'), false);
revoke ffcmapp_marcar_caso_owner from current_user;
