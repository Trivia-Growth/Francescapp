-- FR-009 exige "modelos curtos de síntese profissional por área, configurados com a equipe".
-- O modelo em si é fixado pelo requisito (atividade, observações compartilháveis, progresso,
-- orientação e próximo passo) e por isso vive no contrato, não na configuração. O que varia —
-- e portanto, pela diretriz de 11/11/2026, pertence ao banco e à tela — é a lista de ÁREAS da
-- equipe. A semente traz as áreas já citadas no contexto de negócio; a administração ajusta.
--
-- `exposicao = 'servidor'` porque quem precisa da lista é o profissional ao preencher a
-- evolução, não só o Administrador: a rota do diário lê a chave e devolve a lista na própria
-- consulta de disponibilidade. A tela de administração continua enxergando e editando a linha,
-- porque `api.listar_configuracao_sistema` lista o catálogo inteiro.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (
    gen_random_uuid(),
    'ffcm.diario.ativo',
    'false'::jsonb,
    'booleano',
    'Diário e evolução',
    'Disponibiliza o diário do paciente: relato da família, evolução profissional, retificação e retorno. Não altera quem tem permissão: a autorização continua sendo verificada no servidor e no banco.',
    'servidor'
  ),
  (
    gen_random_uuid(),
    'ffcm.diario.areas_sintese',
    '["Fonoaudiologia","Psicologia","Terapia ocupacional","Fisioterapia","Psicopedagogia","Coordenação do cuidado"]'::jsonb,
    'lista',
    'Áreas da síntese profissional',
    'Áreas oferecidas ao profissional ao registrar a evolução (FR-009). Ajustar aqui muda apenas as opções apresentadas; não cria, remove nem autoriza ninguém.',
    'servidor'
  );
