begin;
-- FR-086 — chave lida pelo código e ausente do catálogo é DEFEITO, não "fatia desligada".
--
-- Varredura de 20/11/2026 cruzando as chaves `ffcm.*` lidas em TypeScript com as semeadas
-- em migrations. Três fatias já implementadas leem uma chave que nunca existiu no catálogo:
-- não há o que alternar na tela de Administração, e ligar a fatia só por deploy.
--
--   `ffcm.papel_declarado.ativo`  — `netlify/functions/papel-declarado.ts:25`
--   `ffcm.substituicao_cm.ativo`  — `netlify/functions/substituicao-case-manager.ts:38`
--   `ffcm.ficha_plantao.ativo`    — `netlify/functions/ficha-plantao.ts:33`
--
-- A terceira NÃO constava da proposta: foi encontrada por esta varredura, na fatia entregue
-- no mesmo dia. É a mesma classe de defeito das duas primeiras.
--
-- `exposicao = 'servidor'` porque quem as lê é `servicoAtivo`, e o leitor do servidor expõe
-- somente essa exposição (`20261117420000:19,25`). Semeadas com `false`: ligar é decisão do
-- solicitante, pela tela, com auditoria, e só depois de provas e revisão independentes —
-- a mesma regra já registrada para financeiro e avisos em `20261127300000`.
--
-- `on conflict (chave) do nothing` para não sobrescrever um valor já ajustado num ambiente.
-- Semear NÃO liga nada e NÃO concede acesso: cada rota continua exigindo sessão, atestado
-- e perfil no banco.

insert into identidade.configuracao_sistema(id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (gen_random_uuid(), 'ffcm.papel_declarado.ativo', 'false'::jsonb, 'booleano',
   'Papel declarado na equipe',
   'Catálogo de papéis declarados usado como rótulo de registro. Não participa de nenhuma decisão de acesso (FR-079). Ativar somente após provas e revisão independentes.',
   'servidor'),
  (gen_random_uuid(), 'ffcm.substituicao_cm.ativo', 'false'::jsonb, 'booleano',
   'Substituição de case manager',
   'Troca da liderança do caso com registro de autor e instante. Não altera a audiência do caso. Ativar somente após provas e revisão independentes.',
   'servidor'),
  (gen_random_uuid(), 'ffcm.ficha_plantao.ativo', 'false'::jsonb, 'booleano',
   'Ficha de plantão',
   'Ficha de plantão e consolidado do turno. Não altera quem tem permissão: a autorização continua sendo verificada no servidor e no banco. Ativar somente após provas e revisão independentes.',
   'servidor');

-- Guarda: as três têm de existir, serem booleanas e estarem na exposição que o seu leitor
-- alcança. Chave que a tela mostra e o servidor não lê é exatamente o defeito corrigido em
-- `20261127320000`.
do $$
declare n integer;
begin
  select count(*) into n from identidade.configuracao_sistema
   where chave in ('ffcm.papel_declarado.ativo', 'ffcm.substituicao_cm.ativo',
                   'ffcm.ficha_plantao.ativo')
     and tipo = 'booleano' and exposicao = 'servidor';
  if n <> 3 then raise exception 'INTERRUPTOR_ORFAO_NAO_SEMEADO: % de 3', n; end if;
  -- Mesma guarda de `20261127320000`: nenhum booleano pode ficar numa exposição que o
  -- leitor do servidor não alcança. Vale para o catálogo inteiro, não só para estas três.
  select count(*) into n from identidade.configuracao_sistema
   where tipo = 'booleano' and exposicao <> 'servidor';
  if n > 0 then
    raise exception 'INTERRUPTOR_SEM_EXPOSICAO_SERVIDOR: % restantes', n;
  end if;
end $$;

-- LIMITAÇÃO REGISTRADA, não omissão: a guarda inversa — "falhar se existir chave `ffcm.*`
-- lida por rota e ausente do catálogo" — NÃO é exprimível aqui. O lado que lê é TypeScript
-- (`netlify/functions/**`), invisível ao banco; o SQL só enxerga o catálogo, nunca os seus
-- leitores. Essa guarda existe fora da migration, em
-- `netlify/functions/_shared/configuracao-catalogo-integridade.test.ts`, que cruza as duas
-- listas e aponta a chave infratora pelo nome.

commit;
