# Arquivo da demonstração FFCMApp

Este diretório guarda a demonstração navegável e seus materiais de origem que existiam antes do início da implementação do produto. Ele serve para consulta e recuperação da apresentação; não é código de produção nem fonte de requisitos atuais.

## Conteúdo preservado

- `source/`: antiga árvore `mockup/`, preservada byte a byte. Inclui o HTML, estilos, JavaScript, recursos visuais, fontes, licenças e o empacotador que existiam na demonstração.
- `portable/`: antiga distribuição `output/mockup/`, preservada byte a byte: HTML portátil, imagem de visão e pacote ZIP apresentados à Francescato.

Os caminhos anteriores e seus hashes constam no [inventário de preparação](../../processo/inventario-preparacao-base-ffcmapp.md). As fontes necessárias à proposta comercial ativa possuem cópias independentes e licenciadas em `assets/fonts/`; isso não altera nem substitui os arquivos deste arquivo histórico.

## Limites de uso

O empacotador em `source/build-portable.mjs` é histórico. Seus caminhos relativos registram como a demonstração era produzida e não devem ser executados como comando da base ativa. Nenhum manifest ou comando de desenvolvimento deve iniciar, importar ou publicar esta demonstração.

Para desenvolver o FFCMApp, use as especificações e decisões em `openspec/` e `docs/projeto/`. A demonstração não comprova autenticação, autorização, integração, persistência ou comportamento de produção.
