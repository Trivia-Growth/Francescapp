# Tasks

## Estado operacional

Mudança autorizada pelo pedido explícito de criação de acessos em 18/11/2026. **SUPOSIÇÕES CONSERVADORAS** em `design.md`. Validações manuais adiadas por instrução anterior do solicitante: provas novas serão escritas, mas execução/ativação continuam pendentes. Nenhuma conta real ou credencial será criada/manuseada durante desenvolvimento.

## 1. Contrato e autorização no banco

- [x] 1.1 Implementar contrato de quatro funções, cadastro administrativo cifrado, reserva/consulta/confirmação auditadas e grants mínimos; evidência: migration e provas SQL escritas de Administrador permitido e demais funções negadas, sem senha em persistência/recibo (Administração de contas; Senha sem superfície).
- [x] 1.2 Implementar admissão interna aprovada e predicado compartilhado sem identidade Google fictícia; inventariar e adaptar consumidores mantendo vínculo, audiência, habilitação e ACL; evidência: migrations com allowlist e matriz SQL escrita método/função/mesmo caso/outro caso/revogação/acesso direto (FR-035/052).

## 2. Servidor e Auth nativo

- [x] 2.1 Implementar rotas administrativas com sessão, origem, validação, cifra, auditoria e cliente Auth privilegiado isolado; reserva antes de provisionar e confirmação reautorizada; evidência: testes escritos de positivo/negativo, colisão, resultado incerto e ausência de senha nas respostas (Administração; Provisionamento).
- [x] 2.2 Implementar entrada interna normal e manter Google institucional com método aprovado, sem reutilizar exceção técnica para equipe; evidência: testes escritos de admissão, conta sem vínculo, método divergente e erros públicos genéricos (FR-035/052).

## 3. Interface conectada

- [x] 3.1 Criar Administração > Acessos com lista, formulário, funções e estado recuperável, preservando Equipe; senha apenas interna, apagada antes do envio e sem retry automático; evidência: testes escritos de fluxo e limpeza, instruções Como testar (Administração; Senha; Provisionamento).
- [x] 3.2 Integrar login Google institucional e e-mail/senha interno na entrada existente, sem seletor de papel; evidência: fiação web/index.html/main.ts/api.ts e testes afetados escritos (FR-035/052).

## 4. Revisão e ativação

- [x] 4.1 Revisar diff novo independentemente nos eixos padrões e especificação, corrigir achados e registrar base/arquivos/limitações neste artefato (todos os cenários).
- [ ] 4.2 Executar provas servidor e matriz SQL positiva/negativa completas após autorização de retomada das validações; registrar resultados, sem reaproveitar testes da regra antiga (FR-035/052; Administração).
- [ ] 4.3 Aplicar migrations e publicar somente após gates retomados/aprovados; testar roteiro com usuários fictícios e registrar estado efetivo no relatório/PR. Enquanto não executado, não considerar entrega ativada.

## Como testar (quando validações forem retomadas)

1. Entrar como Administrador vigente, abrir Administração > Acessos, escolher Nova conta.
2. Preencher nome/e-mail fictícios, função e método interno; informar senha fictícia apenas na interface e motivo. Confirmar estado, lista e ausência de senha em consultas.
3. Cumprir confirmação nativa de e-mail quando exigida; sair e entrar pelo e-mail/senha. Sem vínculo, carteira deve ficar vazia.
4. Cadastrar outra identidade fictícia no método Google institucional; entrar pela conta Google correspondente. Conta não aprovada, domínio externo e método divergente devem ser negados.
5. Conferir permissões de Administrador e negativas de Case Manager, Profissional e Familiar no servidor e banco; conferir outro paciente, vínculo inativo, revogação, acesso direto e replay.
6. Simular resposta perdida em dados fictícios: consulta da operação recupera estado, sem senha/repetição de criação. Colisão nunca redefine senha nem adota identidade existente.

## Workflow follow-up

- Sincronizar specs e arquivar somente após critérios e gates comprovados; manter change aberta enquanto validações estiverem adiadas.

## Evidência de fonte e limites

Os itens 1–3 registram implementação e provas escritas, **não aceite executado**.
Fonte: `packages/contracts/src/acessos.ts`; `netlify/functions/acessos.ts` e
`_shared/{acessos-nativo,compor-acessos-nativo,auth-nativo/*interno*}.ts`;
`web/{acessos-administracao,login-interno,servico-acessos-http}.ts`; migrations
`20261125150000`, `20261125160000` e `20261125170000`. Testes adjacentes e
`supabase/tests/acessos_gerenciados_local.sql` preparados com valores fictícios.
O runner `scripts/testar-acessos-gerenciados-local.sh` usa PostgreSQL efêmero sem
TCP; bootstrap da bridge Auth usa owner de plataforma, separado da aplicação das
migrations de negócio 1600/1700 com migrador sem superuser. Não é prova de cadeia
integral NOSUPER e não foi executado.

Base da revisão: `2f729b6b2b71371e1d4a8cc6598050221e58f391`; alvo: diff local
contra essa base e arquivos novos explicitamente listados nesta mudança, sem
`.impeccable/`. Três executores Sol; revisão cruzada por fonte, em padrões e
especificação, sem autoaprovação do próprio código crítico. Execução das provas,
matriz completa e homologação Google/SMTP permanecem nos gates 4.2/4.3.

**Padrões:** web revisada pelo executor de servidor; backend/contratos/SQL pelo
executor web. Corrigidos bootstrap de grants/locks, preservação de memberships,
unicidade e estado terminal após recusa nativa comprovada, retorno booleano
fechado da carteira familiar e separação do interruptor administrativo da admissão.
Último delta SQL e corpos mínimos da matriz foram relidos por outro executor.
Sem P1/P2 concreto aberto por fonte; comportamento em execução não comprovado.

**Especificação:** servidor/web revisados pelo executor SQL; SQL pelo executor de
servidor. Corrigidos transporte OTP sem fluxo/cookie de login, pendência que
forçava reautenticação, fallback legado após contexto gerenciado inválido e alcance
do ramo Familiar válido. Provas escritas incluem serviço real/interface com HTTP
fictício e SDK Auth real com HTTP fictício; não equivalem a Auth remoto. Removida
inclusão duplicada de migration no harness; mantidos método/perfil/vínculo/audiência
separados. Sem P1/P2 concreto aberto por fonte, com gates 4.2/4.3 ainda pendentes.

Commit de código enviado: `704487f`. Hooks existentes concluídos: pre-commit
Biome; pre-push lint (781 arquivos) e typecheck de contratos/cadastro/funções/web/
proxy, saída 0. Sem execução manual de checker, teste, SQL, build ou browser.
Esses hooks não alteram o estado pendente dos gates 4.2/4.3.
