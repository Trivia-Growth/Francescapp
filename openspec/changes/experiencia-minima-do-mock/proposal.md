# Proposal

## Why

O mock publicado apresenta a coordenação do cuidado como uma jornada: perceber o que mudou, abrir o caso, consultar registros e agir. A aplicação conectada já tem muitos serviços e 17 seções na ficha, mas a sessão de Administrador observada em 13/11/2026 abre na carteira e expõe informações em blocos separados. Falta um contrato verificável para a composição inicial e para a descoberta das funções existentes.

Decisão do solicitante em 16/11/2026: a experiência demonstrada no mock é o mínimo a alcançar, inclusive organização visual, informações e jornadas. Recursos adicionais desenvolvidos que agreguem valor devem ser preservados.

## What Changes

- Especificar a entrada de Administrador e Profissional em uma visão do dia, usando somente fontes conectadas e autorizadas. A base recente já possui `home-profissional.ts`, mas o site consultado como Administrador não mostrou essa entrada; a execução deve primeiro conciliar versão, perfil e configuração, sem duplicar a tela.
- Especificar a ficha como percurso de leitura e ação: visão do caso, histórico, plano e próximos passos com acesso claro às demais seções. Agrupar a navegação extensa sem retirar recursos nem mudar permissões.
- Compor a visão do caso a partir de dados existentes, com origem, atualização e estados vazios/falhos honestos. Nenhum texto fictício do mock entra no ambiente conectado.
- Definir aceite visual e funcional em desktop e celular com um caso fictício **preenchido pelas operações reais**, além de caso vazio, falha parcial e perfis com acesso diferente. O mock é referência mínima de experiência; a identidade final segue os materiais Francescato.
- Acompanhar a paridade de Meu dia, carteira, ficha, diário, plano, próximos passos, agenda, equipe, documentos e orientações. As regras funcionais e a implementação de cada domínio continuam nas specs e changes próprias: diário e retorno em FR-008/013/014 e `diario-conectado`; áudio em `transcricao-audio-relato`; agenda em FR-023 a FR-025 e `agenda-google-integracao`; documentos em FR-029 a FR-031 e `documentos-institucionais-integracao`; linha do tempo em FR-007. Essas frentes são dependências do aceite integral do mock, não funcionalidades automaticamente concluídas por esta change.
- Conservar recursos existentes além do mock, quando úteis e autorizados. Participação direta do paciente permanece hipótese de Evolução a validar; demonstração de OneDrive, seletor de perfil, conteúdo fictício e simulações não estabelecem fornecedor, autenticação ou regra de produção.

## Capabilities

### New Capabilities

- `experiencia-de-coordenacao`: entrada contextual, navegação por tarefa e composição progressiva da visão do caso para perfis autorizados.

### Modified Capabilities

- `caso-e-anamnese`: detalhar apresentação e estados do resumo FR-006 sem alterar campos clínicos ou audiência.

## Impact

Afeta navegação, composição e estilo em `web/`, sobretudo `main.ts`, `home-profissional.ts`, `ficha-paciente.ts`, `visao-caso.ts`, HTML/CSS e testes. Jornadas adicionais dependem das changes específicas, decisões e provas correspondentes; não criar implementação duplicada. Qualquer agregação nova ou exposição exige revisão de autorização no servidor e banco. Esta proposta não autoriza migração remota, deploy, dados reais, fornecedores adicionais ou nova regra clínica. Entregar por fatias; só declarar paridade integral após comprovar também as dependências.
