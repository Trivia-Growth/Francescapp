# Inventário de preservação — preparação da base FFCMApp

**Coleta:** 16/10/2026, antes de qualquer movimentação da demonstração.  
**Origem Git:** `d5a551bb08b300c9500fed9c77a116e18568bac4` — `docs: add feature specifications and provisional mock design` (14/10/2026).  
**Worktree no momento da coleta:** havia alterações locais e arquivos não rastreados fora dos materiais listados abaixo; eles não foram revertidos, incluídos à força nem interpretados como parte do inventário. O detalhe operacional pode ser reconstituído pelo estado do Git da sessão de execução.

Este arquivo é a referência de bytes para a mudança `preparar-base-ffcmapp`. Os valores são SHA-256 do arquivo completo e os tamanhos estão em bytes. Não contém dados de pacientes, segredos ou conteúdo clínico.

## Demonstração de origem

| Caminho original | Bytes | SHA-256 |
| --- | ---: | --- |
| `mockup/DESIGN.md` | 2.694 | `1151352a645c2c2248b28768e2d0a70d7f2f44b6f3eaf59ea17d6c63d60d1753` |
| `mockup/QA.md` | 1.799 | `0200c213acc52a6535d1b4ca9ad5d4ace2c337fb34a2eca8a6e47a7557d2b3d7` |
| `mockup/README.md` | 4.231 | `fc6aee3de35526949a8226ee45afb7e0b13284ff4d427bbf35dc36720e99afbb` |
| `mockup/app.js` | 95.664 | `e5257b27735e64d0733dea76764e7eefc279454ef4cc5458c7995b941391602f` |
| `mockup/assets/OFL-Cormorant-Garamond.txt` | 4.387 | `60700d351cac4650c51f3f9db318d2a420f8b45052dba2715eb5fec41f0f6956` |
| `mockup/assets/OFL-Raleway.txt` | 4.497 | `7e946cf1171784d1015279e7dc35f827957a6b5d1f1f659ae0c98e5f5e37ed9b` |
| `mockup/assets/cormorant-garamond.ttf` | 1.195.560 | `b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0` |
| `mockup/assets/raleway.ttf` | 312.352 | `8bbcc3eb8275c388f4bcd998832f8a4b943eadbaf6a595205312774b5951aefb` |
| `mockup/assets/trivia-logo-dark.png` | 141.144 | `4b0a243e90d84c7cf0b97c630db1f7ff2b772497ba036773bdf3d9e60f946962` |
| `mockup/build-portable.mjs` | 1.513 | `582c07fa3e2f56246f6e723d5b62c9c4563e93e7d80efecdcd991dfdf6c06905` |
| `mockup/index.html` | 644 | `927f11756c42866f7adaeea3c235eb30337688bda438bd71355d6d0a93b58c8b` |
| `mockup/styles.css` | 34.544 | `baa3da838b19b483e52a73aa7d417d7ad4b5798ec01796656606223f7b7c1f9f` |

## Distribuição portátil da demonstração

| Caminho original | Bytes | SHA-256 |
| --- | ---: | --- |
| `output/mockup/francescapp-demo.html` | 2.150.263 | `99523dc4296c3610ea20b757a9847d50d0330f44988958ef122d74c129ac5124` |
| `output/mockup/francescapp-mockup.zip` | 1.294.358 | `e996a992a6644a9ed640cafdff317a5520898fb368135b72cec05d5de9a3d73e` |
| `output/mockup/visao-edilaine.jpg` | 52.001 | `1fd8f99e6977e2b778c194dc2c94eca8ed0b8d1ae5b6a9d763172d57d4a89640` |

## Proposta, PDFs e marca

| Caminho | Bytes | SHA-256 |
| --- | ---: | --- |
| `output/proposta-edilaine.html` | 23.404 | `15f14edd0a3f3149fc0c4c22ed319521f665646ff0e00df5ef5d6813ca4c8d92` |
| `output/pdf/especificacoes-francescapp-joao.pdf` | 103.563 | `cb90d9a27d1f861301bfbc95ac7e6887049ea1a27dec33592ad684d6c72d6bd2` |
| `output/pdf/francescapp-proposta-edilaine.pdf` | 66.970 | `500d4c64d4d8380f5768962a344c49e7335f6d164d277ffbfefed60c84d857bb` |
| `output/pdf/francescapp-proposta-implementacao.pdf` | 182.352 | `45a4ec841cc4130e99988bd5d8a552bd69711a3851bd944c0f62e9be9b5c62a1` |
| `assets/brand/francescato/ffcm-logo-branco.jpg` | 39.848 | `01b65fc5cd8d940b8fd881980f827d4ad8e64f2e06d1faa63f90742aa0600968` |
| `assets/brand/francescato/ffcm-logo-oliva.jpg` | 58.384 | `015c14439f37df619d1b9f3a4f2369d0ad6cb050eb7ee280865c7a3508b6ee64` |
| `assets/brand/francescato/francescato-assinatura.jpg` | 79.582 | `c991ee38e505781b9b6764cfbeb48e9a3d88281dce341b2efdfe1d52cc54d0ca` |
| `assets/brand/francescato/paleta-referencia.jpg` | 176.777 | `66f0292f3a0deaba40920d914d27af3daf7017636b8faae2bc39557d6a2859b7` |

O tamanho de `output/proposta-edilaine.html` será conferido pelo verificador junto ao hash nesta mesma revisão; a mudança planejada permite somente suas duas URLs de fonte. Todos os PDFs e imagens de marca devem permanecer byte a byte idênticos.

## Dependência de fonte identificada

Antes do desacoplamento, `output/proposta-edilaine.html` aponta exclusivamente para:

- `../mockup/assets/raleway.ttf`;
- `../mockup/assets/cormorant-garamond.ttf`.

As cópias autorizadas para a proposta ativa estão em `assets/fonts/raleway.ttf` e `assets/fonts/cormorant-garamond.ttf`, acompanhadas de `assets/fonts/OFL-Raleway.txt` e `assets/fonts/OFL-Cormorant-Garamond.txt`. A partir de `output/proposta-edilaine.html`, as duas URLs são `../assets/fonts/raleway.ttf` e `../assets/fonts/cormorant-garamond.ttf`.

A conferência de 16/10/2026 mostrou que as quatro cópias têm os hashes deste inventário; ao substituir essas duas URLs de volta pelos caminhos originais em memória, a proposta retorna ao SHA-256 registrado. Portanto, a diferença do HTML ficou limitada às duas URLs autorizadas. Isso não define a tipografia da futura aplicação.

## Como conferir

O futuro verificador próprio desta mudança deve comparar os caminhos desta tabela aos hashes esperados e aceitar apenas a alteração delimitada das duas URLs da proposta. Os casos negativos precisam ocorrer em diretórios temporários, nunca adulterando estes materiais para testar falha.

## Verificação implementada

Os comandos locais abaixo não chamam serviços externos nem modificam os materiais inventariados:

```sh
node --test scripts/test-verify-base-preservation.mjs
node scripts/verify-base-preservation.mjs --layout origem
```

O primeiro cria uma árvore temporária por caso e comprova: estado válido, fonte ausente, licença alterada e PDF ausente ou alterado. O segundo compara a árvore real com este inventário. Depois do arquivamento, o mesmo verificador será executado com `--layout arquivado`; nesse modo ele também exige as fontes e licenças ativas em `assets/fonts/` e prova que a proposta só mudou nas duas URLs autorizadas.

Esta é uma checagem de preservação estática. Ela não comprova segurança em execução, autorização, integração externa ou qualidade do futuro produto.

## Isolamento da demonstração

```sh
node --test scripts/test-verify-mockup-isolation.mjs
node scripts/verify-mockup-isolation.mjs
```

O verificador procura referências ativas aos diretórios removidos `mockup/` e `output/mockup/` em arquivos de código e configuração textuais. A análise exclui os diretórios documentais `docs/` e `openspec/`, o material temporário ignorado `brag-output/` e os próprios scripts verificadores: nesses locais, a menção documental e as regras do teste são necessárias e permitidas. Também ignora `.git`, `node_modules` e toda a árvore `docs/legacy/`.

Os testes temporários provam uma entrada ativa indevida reprovada, menção documental ao arquivo permitida e conteúdo histórico permitido. A checagem não interpreta JavaScript, não executa a aplicação e não é uma prova de segurança, publicação ou ausência de dependências em tempo de execução.

## Ferramentas da base

Foram usados Node `v22.23.3`, pnpm `9.15.9` e Biome `1.9.4`, este último somente para lint dos quatro verificadores próprios. A raiz privada `ffcmapp`, `pnpm-workspace.yaml` e `pnpm-lock.yaml` registram a instalação reproduzível; `pnpm install --frozen-lockfile` foi conferido após a geração do lockfile.

O comando `pnpm run verificar:base` reúne apenas verificações existentes nesta preparação. Não há comando ativo de `dev`, build, tipos, banco, integração ou publicação, porque não há aplicação, pacote de domínio ou serviço conectado nesta mudança.

## Aceite integrado — 16/10/2026

Foram executados com sucesso:

- `pnpm install --frozen-lockfile`;
- `pnpm run verificar:base` — 4 testes de preservação, 4 testes de isolamento, preservação da árvore real, isolamento, migração e lint dos 4 scripts aprovados;
- `openspec validate --all --strict --no-interactive` — 11 itens aprovados, 0 falhas;
- `git diff --check` — sem erros de espaço em branco.

O verificador de preservação confirmou os hashes dos materiais arquivados, PDFs, logos, fontes e licenças; o de isolamento confirmou ausência de referências ativas aos diretórios removidos. A validação de migração continuou a confirmar 8 capacidades, 54 requisitos, 12 jornadas, 12 critérios, 5 esclarecimentos e 36 arquivos históricos intactos.

Limitações mantidas: não foram executados testes de frontend, tipo, banco, autorização, Supabase, Drive, Calendar, OpenRouter, publicação ou dados reais, pois esses componentes ainda não existem nesta fatia.

## Revisão de escopo

O diff desta preparação contém somente o arquivamento recuperável da demonstração, cópias de fontes/licenças para a proposta, correções de referências ativas, verificadores locais, documentação e a configuração mínima de workspace/lint. As remoções vistas pelo Git em `mockup/` e `output/mockup/` correspondem aos mesmos bytes adicionados em `docs/legacy/mockup/` e foram confirmadas pelo verificador.

Não houve provisionamento, migração remota, deploy, push, criação de dados, alteração de conta, chamada a Supabase, Google Drive, Google Calendar ou OpenRouter. A dependência de desenvolvimento Biome foi registrada no lockfile; isso não conecta o produto a um serviço. As modificações locais pré-existentes em documentação, marca e outras mudanças OpenSpec foram preservadas e não foram descartadas. As decisões funcionais pendentes das próximas fatias permanecem pendentes.
