-- Aditivo: visibilidade da orientação para a família ler sem inferência de perfil (decisão do
-- solicitante, 17/11/2026 — "opção de marcar somente interno ou pública"). Coluna em claro: o
-- banco não lê `conteudo_cifrado`, então o filtro de audiência da família precisa viver fora do
-- envelope. Padrão 'interna' preserva o comportamento atual de quem já grava sem informar o
-- campo.
alter table cadastro.orientacao_versao
  add column visibilidade text not null default 'interna'
  check (visibilidade in ('interna', 'publica'));
