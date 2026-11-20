# Spec Delta

## Purpose

Permitir que profissionais e familiares instalem o FFCMApp na tela inicial do aparelho e o abram como aplicativo, com a casca da interface disponível sem rede. O que fica no aparelho é a casca e o material estático; conteúdo de caso, identidade e resposta autenticada não são guardados no aparelho.

## ADDED Requirements

### Requirement: FR-071 — Instalar o aplicativo no aparelho e abrir a casca sem rede, sem guardar conteúdo de caso

**Fase de origem**: Evolução.

O produto SHALL ser instalável na tela inicial do aparelho, com nome, ícones e tela de abertura próprios, e SHALL abrir em janela de aplicativo. A casca da interface e os recursos estáticos SHALL estar disponíveis sem rede.

Nenhuma resposta autenticada, conteúdo de caso, identificador de sessão ou dado pessoal SHALL ser guardado em cache do aparelho. Sem rede, o produto SHALL apresentar estado de indisponibilidade honesto, e NÃO SHALL apresentar conteúdo anterior, dado de exemplo ou tela que sugira sucesso.

O encerramento de sessão SHALL limpar o que o aplicativo mantiver no aparelho. Uma versão nova publicada SHALL substituir a versão instalada sem exigir desinstalação.

#### Scenario: Instalação na tela inicial
- **WHEN** o profissional ou familiar instala o produto pelo navegador do aparelho
- **THEN** o aplicativo aparece na tela inicial com nome e ícone próprios e abre em janela de aplicativo

#### Scenario: Casca disponível sem rede
- **WHEN** o aplicativo é aberto sem conexão
- **THEN** a casca da interface carrega a partir do aparelho e cada área de conteúdo apresenta estado de indisponibilidade por falta de rede

#### Scenario: Conteúdo de caso não é servido do aparelho
- **WHEN** o aplicativo é aberto sem conexão por alguém que já havia consultado um caso
- **THEN** nenhum dado do caso consultado antes é apresentado, e a tela não exibe conteúdo anterior como se fosse atual

#### Scenario: Resposta autenticada não entra em cache
- **WHEN** qualquer resposta de API autenticada é recebida pelo aplicativo
- **THEN** ela NÃO SHALL ser guardada em cache do navegador, em armazenamento do service worker nem em armazenamento persistente do aparelho

#### Scenario: Encerramento de sessão limpa o aparelho
- **WHEN** a pessoa encerra a sessão
- **THEN** o que o aplicativo mantinha no aparelho é removido, e uma abertura seguinte não apresenta nome, caso, identificador ou qualquer dado da sessão anterior

#### Scenario: Revogação não é contornada pelo aparelho
- **WHEN** o acesso de uma pessoa é revogado e ela reabre o aplicativo instalado, com ou sem rede
- **THEN** nenhum conteúdo ao qual ela tinha acesso é apresentado a partir do aparelho

#### Scenario: Segunda pessoa no mesmo aparelho
- **WHEN** outra pessoa entra no mesmo aparelho depois de uma sessão anterior
- **THEN** nenhum conteúdo, nome ou preferência da sessão anterior é apresentado a ela

#### Scenario: Versão nova substitui a instalada
- **WHEN** uma versão nova do produto é publicada e o aplicativo instalado é aberto
- **THEN** a versão nova passa a valer sem exigir desinstalação, e a pessoa não permanece presa a uma versão antiga servida do aparelho

#### Scenario: Falha ao instalar não bloqueia o uso
- **WHEN** o aparelho ou o navegador não permite a instalação
- **THEN** o produto continua utilizável pelo navegador, com as mesmas funcionalidades e sem mensagem que condicione o uso à instalação

#### Scenario: Uso confortável no celular
- **WHEN** o aplicativo instalado é usado em tela de celular
- **THEN** a navegação, o teclado, o foco visível e as áreas de toque funcionam conforme `AGENTS.md — Qualidade e experiência`, sem rolagem horizontal
