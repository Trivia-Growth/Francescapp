-- Liga três serviços que já estavam prontos e provados, por decisão do solicitante de
-- 13/11/2026, depois do smoke em produção.
--
-- ATUALIZA valor; não insere. As chaves nascem em `20261118230000` (diário) e
-- `20261121100000` (linha do tempo e exportação), e o catálogo é definido por migration — a
-- tela edita valor, nunca cria chave. Inserir de novo quebraria a unicidade de `chave`.
--
-- Ligar aqui NÃO concede permissão a ninguém: sessão, concessão, atestado e RLS continuam
-- decidindo quem vê o quê. O que muda é a disponibilidade da rota.
--
-- O interruptor fixo no código de `linha-tempo.ts` e `exportacoes.ts` foi derrubado no mesmo
-- commit; sem isso, ligar a chave aqui não abriria nada.

do $$
declare
  esperadas constant text[] := array[
    'ffcm.diario.ativo',
    'ffcm.linha_tempo.ativa',
    'ffcm.exportacao.ativa'
  ];
  encontradas integer;
begin
  select count(*) into encontradas
  from identidade.configuracao_sistema
  where chave = any(esperadas) and tipo = 'booleano';
  -- Falha fechada: se alguma chave sumiu ou trocou de tipo, é erro de catálogo e não deve
  -- passar despercebido numa migration que liga serviço.
  if encontradas <> array_length(esperadas, 1) then
    raise exception 'CHAVES_DE_SERVICO_INESPERADAS: % de % encontradas',
      encontradas, array_length(esperadas, 1);
  end if;
end $$;

update identidade.configuracao_sistema
set valor = 'true'::jsonb, versao = versao + 1, atualizado_em = now()
where chave in ('ffcm.diario.ativo', 'ffcm.linha_tempo.ativa', 'ffcm.exportacao.ativa')
  and valor is distinct from 'true'::jsonb;
