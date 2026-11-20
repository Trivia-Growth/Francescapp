begin;
-- FR-085 — a faixa dos limites passa a ser do BANCO, não de um argumento em TypeScript.
--
-- Defeito corrigido aqui, verificado linha a linha em 20/11/2026:
-- `numeroConfigurado` (`netlify/functions/_shared/configuracao-servidor.ts`) recebia
-- `minimo` e `maximo` como argumentos de código e, fora da faixa, devolvia SILENCIOSAMENTE
-- o padrão. A gravação era aceita: o Administrador via na tela o número que digitou,
-- acreditava que ele valia, e o servidor usava outro. `ffcm.turno.tolerancia_atraso_minutos`
-- aceitava 999999999 — cerca de 1.900 anos de tolerância de atraso, pela tela.
-- Validação que não recusa não é validação.
--
-- Desenho idêntico ao de `opcoes` (`20261119110000_configuracao_sistema_opcoes.sql`):
--  1. a faixa é definida por MIGRATION, nunca pela tela;
--  2. fica FORA do grant de coluna do owner administrativo — que cobre apenas
--     `valor, versao, atualizado_por_usuario_id, atualizado_em`
--     (`20261117410000:216`) —, então nem um defeito na função administrativa a alarga;
--  3. a recusa é CHECK de tabela, válida para QUALQUER caminho de escrita.
--
-- Quem pode mudar o limite continua sendo só o Administrador. Não há papel novo nem
-- segundo nível de aprovação: a proteção é a faixa ser estreita o bastante para que
-- qualquer valor dentro dela seja aceitável, como `transcricao.ts:31` já estabelece
-- ("a configuração pode baixar, nunca subir").
--
-- Esta migration NÃO concede acesso, não muda audiência, não toca cifra, AAD nem esquema
-- de conteúdo clínico.

alter table identidade.configuracao_sistema
  add column minimo bigint,
  add column maximo bigint,
  -- Faixa invertida é defeito de catálogo, não configuração exótica.
  add constraint configuracao_sistema_faixa_coerente_chk
    check ((minimo is null or maximo is null or minimo <= maximo) is true),
  -- Faixa só faz sentido onde o valor é um número. Booleano e lista não têm intervalo.
  -- `texto` entra porque três chaves do turno guardam INTEIRO em `tipo='texto'`
  -- (`20261125080000_turno_execucao_privada.sql:22-24`), usando `''` como sentinela de
  -- "ainda não configurado — abertura de turno indisponível". Trocar o tipo dessas chaves
  -- apagaria essa sentinela e ligaria a abertura de turno com um valor suposto; a faixa
  -- não depende disso para recusar o absurdo hoje.
  add constraint configuracao_sistema_faixa_tipo_chk
    check (((minimo is null and maximo is null) or tipo in ('numero', 'texto')) is true),
  -- Limite de grandeza da própria faixa: 15 dígitos cabem em bigint sem flerte com overflow
  -- e são conferidos pelo mesmo regex que valida o valor.
  add constraint configuracao_sistema_faixa_grandeza_chk
    check ((
      (minimo is null or minimo between -999999999999999 and 999999999999999)
      and (maximo is null or maximo between -999999999999999 and 999999999999999)
    ) is true),
  -- `case` (e não `and`) porque a ordem de avaliação de `and` não é garantida: o regex
  -- precisa rodar ANTES do cast, senão um valor não numérico vira erro de sintaxe em vez
  -- de recusa de restrição.
  add constraint configuracao_sistema_faixa_valor_chk check ((
    case
      when minimo is null and maximo is null then true
      when tipo = 'numero' and jsonb_typeof(valor) = 'number'
        and (valor #>> '{}') ~ '^-?[0-9]{1,15}$'
        then (valor #>> '{}')::bigint
             between coalesce(minimo, -999999999999999) and coalesce(maximo, 999999999999999)
      -- Sentinela preservada: em branco continua significando "não configurado".
      when tipo = 'texto' and jsonb_typeof(valor) = 'string' and (valor #>> '{}') = ''
        then true
      when tipo = 'texto' and jsonb_typeof(valor) = 'string'
        and (valor #>> '{}') ~ '^-?[0-9]{1,15}$'
        then (valor #>> '{}')::bigint
             between coalesce(minimo, -999999999999999) and coalesce(maximo, 999999999999999)
      else false
    end) is true);

comment on column identidade.configuracao_sistema.minimo is
  'Menor valor aceito da chave numérica. Definido por migration; a tela não altera a própria faixa.';
comment on column identidade.configuracao_sistema.maximo is
  'Maior valor aceito da chave numérica. Nunca mais permissivo que o teto definido em código.';

-- Faixas semeadas.
--
-- `ffcm.transcricao.duracao_maxima_segundos`: espelha exatamente a faixa que
-- `compor-transcricao-nativa.ts` já passava a `numeroConfigurado` (1 a
-- `AUDIO_SEGUNDOS_MAXIMO`, `packages/contracts/src/transcricao.ts:31`). A configuração só
-- restringe; o teto do código continua sendo o teto.
update identidade.configuracao_sistema
   set minimo = 1, maximo = 300
 where chave = 'ffcm.transcricao.duracao_maxima_segundos';

-- SUPOSIÇÃO CONSERVADORA DA COORDENAÇÃO (20/11/2026), não decisão do cliente: tolerância
-- de atraso entre 0 e 120 minutos; duração padrão de turno entre 60 e 1440 minutos.
-- Uma faixa diferente é ajuste de uma linha nesta migration — nada do desenho depende
-- destes números. Antes disso a tela aceitava 999999999 nas duas.
update identidade.configuracao_sistema
   set minimo = 0, maximo = 120
 where chave = 'ffcm.turno.tolerancia_atraso_minutos';
update identidade.configuracao_sistema
   set minimo = 60, maximo = 1440
 where chave = 'ffcm.turno.duracao_padrao_minutos';

-- O leitor do servidor passa a entregar a faixa junto do valor, para que
-- `numeroConfigurado` use a faixa do catálogo em vez da faixa de código. A policy continua
-- filtrando `exposicao = 'servidor'`; nenhuma coluna de rótulo, descrição ou autoria entra.
grant select (minimo, maximo) on identidade.configuracao_sistema
  to ffcmapp_configuracao_leitor_owner;

-- Mesma dança de `20261117420000`: o dono da função não tem login e o migrador não é
-- superusuário, então a adesão ao papel e o CREATE no schema entram só para a substituição
-- e saem logo depois, preservando o que já existia.
select set_config(
  'ffcmapp.faixa_leitor_tinha_set',
  pg_has_role(current_user, 'ffcmapp_configuracao_leitor_owner', 'SET')::text, false);
select set_config(
  'ffcmapp.faixa_leitor_tinha_create',
  has_schema_privilege('ffcmapp_configuracao_leitor_owner', 'identidade', 'CREATE')::text, false);
select set_config('ffcmapp.faixa_migrador', current_user, false);
do $$ begin
  if current_setting('ffcmapp.faixa_leitor_tinha_set') = 'false' then
    execute format(
      'grant ffcmapp_configuracao_leitor_owner to %I with inherit false, set true granted by %I',
      current_user, current_user);
  end if;
  if current_setting('ffcmapp.faixa_leitor_tinha_create') = 'false' then
    grant create on schema identidade to ffcmapp_configuracao_leitor_owner;
  end if;
end $$;

set role ffcmapp_configuracao_leitor_owner;
create or replace function identidade.ler_configuracao_sistema_publica() returns jsonb
language sql security definer stable set search_path = '' set row_security = on as $$
  select coalesce(jsonb_object_agg(c.chave, jsonb_build_object(
    'valor', c.valor, 'tipo', c.tipo, 'versao', c.versao,
    'minimo', c.minimo, 'maximo', c.maximo)), '{}'::jsonb)
  from identidade.configuracao_sistema c
  where c.exposicao = 'servidor';
$$;
revoke all on function identidade.ler_configuracao_sistema_publica() from public, anon, authenticated, service_role;
grant execute on function identidade.ler_configuracao_sistema_publica() to ffcmapp_configuracao_leitor_executor;
reset role;
select set_config('role', current_setting('ffcmapp.faixa_migrador'), false);

do $$ begin
  if current_setting('ffcmapp.faixa_leitor_tinha_create') = 'false' then
    revoke create on schema identidade from ffcmapp_configuracao_leitor_owner;
  end if;
  if current_setting('ffcmapp.faixa_leitor_tinha_set') = 'false' then
    execute format('revoke ffcmapp_configuracao_leitor_owner from %I granted by %I',
      current_user, current_user);
  end if;
end $$;

-- A operação administrativa passa a DEVOLVER a faixa (a tela precisa informar o intervalo
-- aceito) e a RECUSAR valor fora dela com `ENTRADA_INVALIDA`, antes do `update` — para que
-- a pessoa receba a recusa da regra, e não um erro de restrição do banco.
--
-- A função NÃO é reescrita inteira de propósito: o corpo dela já foi emendado em
-- `20261125170000_acessos_consumidores_autenticacao.sql` (DF-023), e um `create or replace`
-- com o texto de `20261119110000` desfaria aquela emenda em silêncio. Aqui vale o mesmo
-- padrão daquela migration: âncora textual única, conferida, aplicada sobre a definição
-- VIGENTE, com owner, ACL e configurações preservados.
do $$
declare
  alvo oid := to_regprocedure('operacao.configuracao_sistema_operacao_privada(jsonb)');
  antes record; depois record; corpo text; definicao text; patch jsonb; de text; para text;
  patches jsonb := jsonb_build_array(
    jsonb_build_object(
      'de', 'item jsonb; opcoes_atuais jsonb;',
      'para', 'item jsonb; opcoes_atuais jsonb; minimo_atual bigint; maximo_atual bigint; numerico text;'),
    jsonb_build_object(
      'de', E'''opcoes'', c.opcoes,\n      ''atualizado_por_usuario_id''',
      'para', E'''opcoes'', c.opcoes, ''minimo'', c.minimo, ''maximo'', c.maximo,\n      ''atualizado_por_usuario_id'''),
    jsonb_build_object(
      'de', 'select c.id, c.tipo, c.versao, c.opcoes into alvo, tipo_atual, versao_atual, opcoes_atuais',
      'para', 'select c.id, c.tipo, c.versao, c.opcoes, c.minimo, c.maximo into alvo, tipo_atual, versao_atual, opcoes_atuais, minimo_atual, maximo_atual'),
    jsonb_build_object(
      'de', E'  if opcoes_atuais is not null and not (opcoes_atuais @> jsonb_build_array(e->''valor'')) then\n    raise exception using errcode = ''22023'', message = ''ENTRADA_INVALIDA'';\n  end if;',
      'para', E'  if opcoes_atuais is not null and not (opcoes_atuais @> jsonb_build_array(e->''valor'')) then\n    raise exception using errcode = ''22023'', message = ''ENTRADA_INVALIDA'';\n  end if;\n'
        || E'  -- FR-085: faixa do catálogo. Fora dela a gravação é RECUSADA, nunca aceita e\n'
        || E'  -- substituída pelo padrão. `''''` segue sendo sentinela de chave de turno ainda não\n'
        || E'  -- configurada, e não vira zero.\n'
        || E'  if minimo_atual is not null or maximo_atual is not null then\n'
        || E'    numerico := e->>''valor'';\n'
        || E'    if tipo_atual = ''texto'' and numerico = '''' then\n'
        || E'      null;\n'
        || E'    elsif coalesce(numerico, '''') !~ ''^-?[0-9]{1,15}$''\n'
        || E'      or numerico::bigint < coalesce(minimo_atual, -999999999999999)\n'
        || E'      or numerico::bigint > coalesce(maximo_atual, 999999999999999) then\n'
        || E'      raise exception using errcode = ''22023'', message = ''ENTRADA_INVALIDA'';\n'
        || E'    end if;\n'
        || E'  end if;'),
    jsonb_build_object(
      'de', E'''exposicao'', c.exposicao, ''versao'', c.versao, ''opcoes'', c.opcoes,',
      'para', E'''exposicao'', c.exposicao, ''versao'', c.versao, ''opcoes'', c.opcoes,\n    ''minimo'', c.minimo, ''maximo'', c.maximo,')
  );
begin
  if alvo is null then raise exception 'OPERACAO_CONFIGURACAO_AUSENTE'; end if;
  select p.prosrc, p.proowner, p.proacl, p.proconfig, p.prosecdef into antes
    from pg_proc p where p.oid = alvo;
  if antes.prosecdef then raise exception 'OPERACAO_CONFIGURACAO_VIROU_DEFINER'; end if;
  corpo := antes.prosrc;
  for patch in select value from jsonb_array_elements(patches) loop
    de := patch->>'de'; para := patch->>'para';
    if (length(corpo) - length(replace(corpo, de, ''))) / length(de) <> 1 then
      raise exception 'ANCORA_NAO_UNICA: %', left(de, 60);
    end if;
    corpo := replace(corpo, de, para);
  end loop;
  definicao := pg_get_functiondef(alvo);
  execute replace(definicao, antes.prosrc, corpo);
  select p.prosrc, p.proowner, p.proacl, p.proconfig, p.prosecdef into depois
    from pg_proc p where p.oid = alvo;
  if depois.proowner <> antes.proowner
    or depois.proacl is distinct from antes.proacl
    or depois.proconfig is distinct from antes.proconfig
    or depois.prosecdef <> antes.prosecdef
    or depois.prosrc <> corpo then
    raise exception 'OPERACAO_CONFIGURACAO_NAO_PRESERVADA';
  end if;
end $$;

-- Guarda de catálogo: nenhuma faixa pode nascer mais permissiva do que o valor já gravado,
-- e toda faixa semeada aqui tem de ter pegado.
do $$
declare n integer;
begin
  select count(*) into n from identidade.configuracao_sistema
   where chave in ('ffcm.transcricao.duracao_maxima_segundos',
                   'ffcm.turno.tolerancia_atraso_minutos',
                   'ffcm.turno.duracao_padrao_minutos')
     and (minimo is null or maximo is null);
  if n > 0 then raise exception 'FAIXA_NAO_SEMEADA: % chaves', n; end if;
end $$;

commit;
