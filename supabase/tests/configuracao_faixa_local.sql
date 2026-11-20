\set ON_ERROR_STOP on
-- FR-085 — a faixa dos limites é do BANCO. Prova positiva e negativa.
--
-- O defeito que esta prova trava: até 20/11/2026 a faixa existia só como argumento de
-- `numeroConfigurado` em TypeScript. Gravar fora dela era ACEITO; a tela mostrava o número
-- digitado e o servidor usava outro. Aqui, fora de faixa é RECUSADO — pela operação
-- administrativa e pelo CHECK da tabela, que vale para qualquer caminho de escrita.
--
-- Reaproveita a cadeia e as fixtures da configuração (usuários, sessões e o assinador).
\ir configuracao_sistema_local.sql
\ir ../migrations/20261119110000_configuracao_sistema_opcoes.sql
\ir ../migrations/20261119140000_configuracao_transcricao.sql

-- Chave de texto que guarda INTEIRO com `''` como sentinela de "ainda não configurado",
-- no mesmo formato das três chaves do turno (`20261125080000:22-24`). Semeada ANTES da
-- migration da faixa para provar que a faixa cai sobre catálogo já existente.
insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,descricao,exposicao)
values(gen_random_uuid(),'ffcm.turno.tolerancia_atraso_minutos','""'::jsonb,'texto',
  'Tolerância de atraso do turno (minutos)','Em branco: abertura indisponível.','administracao');

\ir ../migrations/20261128100000_configuracao_sistema_faixa.sql

-- A faixa é do catálogo: nem o owner da operação administrativa a altera.
do $$ begin
 if has_column_privilege('ffcmapp_configuracao_sistema_owner','identidade.configuracao_sistema','minimo','UPDATE')
  or has_column_privilege('ffcmapp_configuracao_sistema_owner','identidade.configuracao_sistema','maximo','UPDATE') then
  raise exception 'FAIXA_EDITAVEL_PELA_OPERACAO';
 end if;
 -- O leitor do servidor precisa da faixa (é ela que `numeroConfigurado` passa a respeitar),
 -- e de nada além do que já tinha: rótulo, descrição e autoria continuam fora.
 if not has_column_privilege('ffcmapp_configuracao_leitor_owner','identidade.configuracao_sistema','minimo','SELECT')
  or not has_column_privilege('ffcmapp_configuracao_leitor_owner','identidade.configuracao_sistema','maximo','SELECT') then
  raise exception 'LEITOR_SERVIDOR_SEM_FAIXA';
 end if;
 if has_column_privilege('ffcmapp_configuracao_leitor_owner','identidade.configuracao_sistema','rotulo','SELECT')
  or has_column_privilege('ffcmapp_configuracao_leitor_owner','identidade.configuracao_sistema','descricao','SELECT') then
  raise exception 'LEITOR_SERVIDOR_AMPLO_DEMAIS';
 end if;
 -- Faixa semeada: a do código de `compor-transcricao-nativa.ts` (1 a AUDIO_SEGUNDOS_MAXIMO).
 if not exists(select 1 from identidade.configuracao_sistema
   where chave='ffcm.transcricao.duracao_maxima_segundos' and minimo=1 and maximo=300) then
  raise exception 'FAIXA_TRANSCRICAO_AUSENTE';
 end if;
 -- SUPOSIÇÃO CONSERVADORA da coordenação: 0 a 120 minutos.
 if not exists(select 1 from identidade.configuracao_sistema
   where chave='ffcm.turno.tolerancia_atraso_minutos' and minimo=0 and maximo=120) then
  raise exception 'FAIXA_TOLERANCIA_AUSENTE';
 end if;
end $$;

do $$
#variable_conflict use_variable
declare
 administrador uuid := '10000000-0000-4000-8000-000000000001';
 sessao_admin uuid := '20000000-0000-4000-8000-000000000001';
 versao_duracao integer; versao_tolerancia integer; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select c.versao into versao_duracao from identidade.configuracao_sistema c where c.chave='ffcm.transcricao.duracao_maxima_segundos';

 -- A listagem entrega a faixa, para a tela informar o intervalo aceito antes da recusa.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' then raise exception 'LISTAGEM: %',r; end if;
 if not exists(select 1 from jsonb_array_elements(r->'dados') item
   where item->>'chave'='ffcm.transcricao.duracao_maxima_segundos'
     and item->>'minimo'='1' and item->>'maximo'='300') then
  raise exception 'FAIXA_AUSENTE_NA_LISTAGEM: %',r;
 end if;
 if not exists(select 1 from jsonb_array_elements(r->'dados') item
   where item->>'chave'='ffcm.contato.ativo' and item->'minimo'='null'::jsonb) then
  raise exception 'FAIXA_INVENTADA_PARA_CHAVE_SEM_LIMITE: %',r;
 end if;

 -- Dentro da faixa: aceito e passa a valer.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.transcricao.duracao_maxima_segundos',
    'valor',120,'versao_esperada',versao_duracao,
    'chave_idempotencia','duracao-120','digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid()),
   'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,valor}' is distinct from '120' then
  raise exception 'VALOR_NA_FAIXA_RECUSADO: %',r;
 end if;
 if r#>>'{dados,maximo}' is distinct from '300' then
  raise exception 'FAIXA_AUSENTE_NA_GRAVACAO: %',r;
 end if;

 -- Acima do teto: RECUSADO, não aceito e silenciosamente substituído pelo padrão.
 begin
  r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
    jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.transcricao.duracao_maxima_segundos',
     'valor',999999999,'versao_esperada',versao_duracao+1,
     'chave_idempotencia','duracao-absurda','digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid()),
    'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'VALOR_ACIMA_DO_TETO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 -- Abaixo do piso: também recusado.
 begin
  r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
    jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.transcricao.duracao_maxima_segundos',
     'valor',0,'versao_esperada',versao_duracao+1,
     'chave_idempotencia','duracao-zero','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),
    'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'VALOR_ABAIXO_DO_PISO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 -- O valor anterior permanece vigente depois da recusa.
 if not exists(select 1 from identidade.configuracao_sistema
   where chave='ffcm.transcricao.duracao_maxima_segundos' and valor='120'::jsonb) then
  raise exception 'VALOR_ANTERIOR_NAO_PRESERVADO';
 end if;

 -- A tela não altera a própria faixa: campo desconhecido na entrada é recusado.
 begin
  r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
    jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.transcricao.duracao_maxima_segundos',
     'valor',120,'versao_esperada',versao_duracao+1,'maximo',999999,
     'chave_idempotencia','faixa-pela-tela','digest_idempotencia',repeat('d',43),'auditoria_id',gen_random_uuid()),
    'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'FAIXA_ALTERADA_PELA_TELA: %',r;
 exception when insufficient_privilege then
  if sqlerrm <> 'SEM_PERMISSAO' then raise; end if;
 end;
 if not exists(select 1 from identidade.configuracao_sistema
   where chave='ffcm.transcricao.duracao_maxima_segundos' and minimo=1 and maximo=300) then
  raise exception 'FAIXA_NAO_PRESERVADA_APOS_TENTATIVA';
 end if;

 -- Sentinela preservada: chave de turno guardada como texto continua aceitando "em branco",
 -- que significa "não configurado — abertura indisponível", e não zero.
 select c.versao into versao_tolerancia from identidade.configuracao_sistema c where c.chave='ffcm.turno.tolerancia_atraso_minutos';
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.turno.tolerancia_atraso_minutos',
    'valor','15','versao_esperada',versao_tolerancia,
    'chave_idempotencia','tolerancia-15','digest_idempotencia',repeat('e',43),'auditoria_id',gen_random_uuid()),
   'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,valor}' is distinct from '15' then
  raise exception 'TOLERANCIA_NA_FAIXA_RECUSADA: %',r;
 end if;
 begin
  r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
    jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.turno.tolerancia_atraso_minutos',
     'valor','999999999','versao_esperada',versao_tolerancia+1,
     'chave_idempotencia','tolerancia-absurda','digest_idempotencia',repeat('f',43),'auditoria_id',gen_random_uuid()),
    'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'TOLERANCIA_DE_1900_ANOS_ACEITA: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 -- ACHADO, não regressão desta fatia: a operação administrativa já recusava texto VAZIO
 -- antes desta mudança (`20261119110000`: `length(e->>'valor') between 1 and 600`), embora
 -- `web/configuracao-sistema.ts` e `valorConfiguracaoSchema` tratem vazio como valor
 -- legítimo do catálogo. A sentinela `''` das chaves de turno, portanto, só é alcançável
 -- por migration. Esta prova fixa que a FAIXA não piorou isso: em branco continua sendo
 -- aceito pelo CHECK da tabela, e não vira zero.
 begin
  r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
    jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.turno.tolerancia_atraso_minutos',
     'valor','','versao_esperada',versao_tolerancia+1,
     'chave_idempotencia','tolerancia-branco','digest_idempotencia',repeat('0',43),'auditoria_id',gen_random_uuid()),
    'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'TEXTO_VAZIO_PASSOU_A_SER_ACEITO_PELA_OPERACAO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
end $$;

-- A sentinela `''` continua válida no banco sob faixa declarada: a faixa recusa o absurdo
-- sem exigir que a chave deixe de poder estar "não configurada".
do $$ begin
 update identidade.configuracao_sistema set valor='""'::jsonb
  where chave='ffcm.turno.tolerancia_atraso_minutos';
 if not exists(select 1 from identidade.configuracao_sistema
   where chave='ffcm.turno.tolerancia_atraso_minutos' and valor='""'::jsonb) then
  raise exception 'SENTINELA_EM_BRANCO_PERDIDA';
 end if;
end $$;

-- A restrição vale no banco, não só na função: escrita direta fora da faixa é recusada.
do $$ begin
 begin
  update identidade.configuracao_sistema set valor='999999999'::jsonb
   where chave='ffcm.transcricao.duracao_maxima_segundos';
  raise exception 'CHECK_DE_FAIXA_AUSENTE';
 exception when check_violation then null;
 end;
 begin
  update identidade.configuracao_sistema set valor='"999999999"'::jsonb
   where chave='ffcm.turno.tolerancia_atraso_minutos';
  raise exception 'CHECK_DE_FAIXA_AUSENTE_NO_TEXTO';
 exception when check_violation then null;
 end;
 -- Faixa invertida é defeito de catálogo, recusado na própria migration de semente.
 begin
  update identidade.configuracao_sistema set minimo=500,maximo=10
   where chave='ffcm.transcricao.duracao_maxima_segundos';
  raise exception 'FAIXA_INVERTIDA_ACEITA';
 exception when check_violation then null;
 end;
 -- Faixa só em chave numérica: booleano não tem intervalo.
 begin
  update identidade.configuracao_sistema set minimo=0,maximo=1 where chave='ffcm.contato.ativo';
  raise exception 'FAIXA_EM_BOOLEANO_ACEITA';
 exception when check_violation then null;
 end;
end $$;

-- O leitor do servidor entrega a faixa junto do valor, por onde `numeroConfigurado` passa a
-- respeitá-la. A exposição continua filtrando: chave de administração não vaza por aqui.
set role ffcmapp_configuracao_leitor_executor;
do $$
declare lido jsonb;
begin
 lido := identidade.ler_configuracao_sistema_publica();
 if lido#>>'{ffcm.transcricao.duracao_maxima_segundos,maximo}' is distinct from '300' then
  raise exception 'LEITOR_SEM_FAIXA: %',lido;
 end if;
 if lido ? 'ffcm.turno.tolerancia_atraso_minutos' then
  raise exception 'EXPOSICAO_ADMINISTRACAO_VAZOU_PARA_O_SERVIDOR: %',lido;
 end if;
end $$;
reset role;
