-- FR-003 exige anamnese "em seções", com preenchimento gradual, os quatro estados
-- (informado, desconhecido, não se aplica, pendente), fonte e data, e que a case manager
-- localize as seções incompletas. O requisito NÃO fixa quais são as seções.
--
-- Até 13/11/2026 a tela trazia cinco seções inventadas numa passagem de implementação,
-- fixas no código. O solicitante aprovou nesta data uma estrutura de seis seções pensada
-- para equipe multidisciplinar, e pela diretriz de 11/11/2026 ela passa a morar no banco:
-- o que varia se preenche no front e se guarda aqui.
--
-- FORMA: uma lista única no formato `Seção :: Pergunta`, não duas chaves acopladas. Com
-- duas listas (seções de um lado, perguntas de outro) renomear uma seção quebraria o
-- vínculo em silêncio. Aqui a lista de seções é derivada das entradas, na ordem em que
-- aparecem, e existe uma só fonte de verdade para editar. O tipo `lista` do catálogo é
-- array de texto (migration `20261117400000`), então aninhar objeto não é possível.
--
-- Continua sendo SUGESTÃO, não formulário fixo: a tela mantém "Outra seção" e "Outro campo"
-- livres, porque o requisito fala em oferecer seções, não em restringir o que a equipe pode
-- registrar. Esvaziar esta lista é estado legítimo — a tela simplesmente deixa de sugerir.
--
-- `exposicao = 'servidor'` pelo mesmo motivo das áreas do diário (`20261118230000`): quem
-- precisa da lista é quem preenche a anamnese, não só o Administrador. A tela de
-- administração continua enxergando e editando a linha, porque a listagem traz o catálogo
-- inteiro.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (
    gen_random_uuid(),
    'ffcm.anamnese.roteiro',
    '["Motivo e expectativa :: O que trouxe a família",
      "Motivo e expectativa :: O que esperam do acompanhamento",
      "História e marcos :: Percurso até aqui",
      "História e marcos :: Diagnósticos e hipóteses já levantados",
      "História e marcos :: Acompanhamentos anteriores",
      "Rotina e autonomia :: Como é um dia típico",
      "Rotina e autonomia :: O que faz sozinho",
      "Rotina e autonomia :: Onde precisa de apoio",
      "Saúde e cuidados contínuos :: Medicação em uso",
      "Saúde e cuidados contínuos :: Alergias e restrições",
      "Saúde e cuidados contínuos :: Sono e alimentação",
      "Saúde e cuidados contínuos :: Acompanhamentos médicos em curso",
      "Comunicação e relações :: Como se comunica",
      "Comunicação e relações :: Com quem se vincula",
      "Comunicação e relações :: Rede de apoio",
      "Pontos fortes e barreiras :: O que funciona bem",
      "Pontos fortes e barreiras :: O que atrapalha"]'::jsonb,
    'lista',
    'Roteiro sugerido da anamnese',
    'Perguntas oferecidas ao preencher a anamnese, no formato "Seção :: Pergunta". A seção é o texto antes de "::". Sugestão, não obrigação: quem preencher continua podendo criar seção e campo livres. Ajustar aqui não cria, remove nem autoriza ninguém.',
    'servidor'
  );
