# Proposal

## Why

As quatro ferramentas comparadas em 11/11/2026 são aplicativos de celular. A enfermagem registra plantão em pé, no quarto da pessoa acompanhada, com uma mão — não sentada diante de um navegador. O FFCMApp hoje não tem manifesto, não tem service worker e não instala na tela inicial: abre como página, exige digitar endereço e some entre as abas.

Em 17/11/2026 o solicitante determinou que o produto precisa rodar como PWA antes da entrega, e que a sinalização ao usuário fica dentro do aplicativo, como um sino de avisos com indicador de não lido. Notificação externa — push, e-mail e WhatsApp — permanece fora; a gestão de WhatsApp é upsell posterior a esta entrega.

## What Changes

- Criar a capacidade `aplicativo-instalavel`, com FR-071, fase de origem Evolução: manifesto, ícones, instalação na tela inicial e casca da aplicação disponível offline.
- Criar a capacidade `avisos-no-app`, com FR-072, fase de origem Evolução: lista de avisos com indicador de não lido, alimentada pelas pendências e sinalizações já previstas em FR-027 e FR-028 e pela passagem pendente de ciência de FR-057.
- Distinguir **aviso lido** de **ciência registrada** (FR-013): abrir o sino nunca registra ciência.

### Exclusões deste recorte

- Push, e-mail, SMS e WhatsApp. Nenhuma notificação sai do aplicativo.
- Registro de dispositivo, token de push e permissão de notificação do sistema operacional.
- Operação offline de escrita: registrar turno, aferição, medicação, rotina ou ocorrência sem rede. A casca abre offline; o conteúdo exige rede.
- Sincronização, fila local de envio e resolução de conflito.
- Aplicativo nativo, loja de aplicativos e empacotamento.

### Decisões aplicadas

Confirmadas pelo solicitante em 17/11/2026.

- **Nível de PWA**: instalável com casca offline. Manifesto, ícones, service worker cacheando a casca e os recursos estáticos. Registro continua exigindo rede.
- **Offline-first com fila foi descartado** nesta entrega. Registro clínico gravado offline e sincronizado depois exige idempotência por registro, resolução de conflito e instante confiável, enquanto o instante do servidor é justamente o que `turno-e-execucao-do-cuidado` adota como autoridade. O risco de duplicar ou antedatar administração de medicamento não compensa o ganho nesta fase.
- **Sem notificação externa**: apenas o sino padrão dentro do aplicativo, com indicador de não lido.
- **Eventos que geram aviso**: os quatro propostos, todos confirmados — passagem pendente de ciência (FR-057), pendência por atraso (FR-027), sinalização clínica do profissional (FR-028) e relato marcado como atenção (FR-014).
- **Destinatário**: o aviso é da pessoa. Havendo substituição registrada de case manager, os avisos em aberto passam a aparecer também para quem substitui, enquanto a substituição vigorar.
- **Permanência**: marcar como lido tira do indicador, mas o aviso só sai da lista quando a origem for resolvida ou a ciência registrada. Nada sai por decurso de prazo.

### Pendências que não podem ser inferidas

- A implementação está **suspensa** até a liberação do solicitante, como nas mudanças irmãs.

### Dependência

Este recorte toca os mesmos arquivos que uma frente de ajuste de frontend em andamento (`web/index.html`, `web/main.ts`, `web/styles.css`). A implementação não começa antes do encerramento dessa frente, para não produzir conflito nem retrabalho.

## Capabilities

### New Capabilities

- `aplicativo-instalavel`: instalação do produto na tela inicial do aparelho e disponibilidade da casca da aplicação sem rede, incluindo o que o cache pode e não pode guardar.
- `avisos-no-app`: avisos dentro do aplicativo com indicador de não lido, sua origem, sua audiência e a distinção entre ler um aviso e registrar ciência.

### Modified Capabilities

Nenhuma. FR-027, FR-028, FR-057 e FR-013 permanecem como estão; este recorte os consome como origem de aviso, sem alterar o que eles exigem.

## Impact

Altera a entrada da aplicação web, acrescenta manifesto, ícones e service worker, e introduz uma camada de cache no navegador do usuário.

O risco material é de **dado pessoal e clínico persistir no aparelho**. Um service worker mal delimitado guarda resposta autenticada em cache e a serve depois da revogação, ou para outra pessoa no mesmo aparelho — o que contraria FR-037, FR-039 e FR-042. O recorte trata isso como requisito, não como detalhe de implementação.

Não autoriza deploy, migração remota, concessão de acesso, registro em loja de aplicativos ou uso de dados reais.
