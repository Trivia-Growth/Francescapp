begin;
-- Semeia as duas chaves de interruptor que as fatias de financeiro e de avisos
-- esqueceram de criar. Sem a chave em `identidade.configuracao_sistema` a rota cai no
-- padrão do ambiente — que é desligado, portanto seguro —, mas a tela de Administração
-- não tem o que alternar, e o Administrador fica sem como ligar a fatia sem deploy.
--
-- Descoberto em 20/11/2026 ao publicar o backend: as 234 migrations aplicadas deixaram
-- `ffcm.financeiro.ativo` e `ffcm.avisos.ativos` ausentes, enquanto as outras 40 fatias
-- semeiam a própria chave na migration que as cria.
--
-- Semeadas com `false`: ligar é decisão do solicitante, feita pela tela, com auditoria.
-- `on conflict do nothing` porque a chave pode já ter sido criada à mão num ambiente.

insert into identidade.configuracao_sistema(id, chave, valor, tipo, rotulo, descricao, exposicao)
values
  (gen_random_uuid(), 'ffcm.financeiro.ativo', 'false'::jsonb, 'booleano',
   'Financeiro do cuidado',
   'Valor acordado por turno, despesas com comprovante e apuração de repasse. A audiência financeira não decorre do vínculo com o caso. Ativar somente após provas e revisão independentes.',
   'administracao'),
  (gen_random_uuid(), 'ffcm.avisos.ativos', 'false'::jsonb, 'booleano',
   'Avisos no aplicativo',
   'Sino com indicador de não lido, projetado das origens já existentes. Nenhuma notificação sai do aplicativo. Ativar somente após provas e revisão independentes.',
   'administracao')
on conflict (chave) do nothing;

commit;
