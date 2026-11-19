# Decisões técnicas — registrar a realização do compromisso (FR-024)

## Onde a situação mora

Tabela local própria, `cadastro.realizacao_compromisso`, chaveada pelo identificador do
evento — decisão do solicitante de 19/11/2026. Consequências deliberadas:

- o compromisso continua no Google Calendar. O produto não cria, não copia e não
  sincroniza o compromisso; grava apenas o que a equipe declara sobre ele;
- a chave é `(usuario_id, subject_google, evento_id)`, o mesmo trio já usado por
  `identidade.agenda_google_vinculo_paciente`. `subject_google` **não é entrada do
  cliente**: vem da concessão vigente do dono da agenda, lida dentro da própria operação;
- nada aqui depende da integração estar ligada. A flag `ffcm.realizacao_compromisso.ativo`
  é própria e a prova local roda com a integração Google desligada.

## "Realização não confirmada" não é um valor gravável

O CHECK da coluna `situacao` admite exatamente `realizado`, `faltou`, `cancelado` e
`remarcado`. `realizacao_nao_confirmada` **não está lá**, e isso é o desenho, não uma
convenção de tela: não existe caminho que grave "não confirmada", e não existe caminho que
transforme ausência de registro em falta.

A derivação é uma função pura, `cadastro.realizacao_situacao_derivada(text, timestamptz,
timestamptz)`: devolve a situação registrada quando existe; quando não existe, devolve
`realizacao_nao_confirmada` se o compromisso já terminou e `agendado` se ainda não. Ela
**nunca** devolve `faltou` a partir de ausência de registro — e isso é provado por teste.

O instante de término do compromisso vem do Google, pela composição do servidor, e serve
só para apresentação: não participa de nenhuma autorização. Por isso é aceitável que
trafegue como entrada; o pior caso de um valor mentiroso é a tela mostrar "agendado" no
lugar de "não confirmada" para quem já podia ler aquele evento.

## Vínculo entre datas

`remarcado` nomeia `evento_destino_id`. O banco impede cadeia incoerente:

- `check ((situacao = 'remarcado') = (evento_destino_id is not null))` — só remarcação
  aponta destino, e toda remarcação aponta;
- `check (evento_destino_id is distinct from evento_id)` — nada aponta para si mesmo;
- o destino obedece ao mesmo formato do `evento_id` (regex e teto de 1024).

A consulta devolve as **duas direções**: para cada evento pedido, o destino da sua
remarcação vigente e a lista de eventos cuja remarcação vigente aponta para ele. Um índice
parcial por `evento_destino_id` serve a direção inversa.

Não há verificação de que o destino exista no Google: o produto não é dono do compromisso
e não consegue afirmar, no banco, o que existe na agenda alheia. A tela mostra o vínculo
pelo identificador; se o destino sumir da janela consultada, o vínculo continua registrado.

## Append-only e retificação

Não há UPDATE nem DELETE: um gatilho recusa os dois. Retificar grava uma **versão nova**
do mesmo evento, com `versao = versao_esperada + 1`; a versão anterior permanece intacta.
Vigente é sempre a maior versão.

`unique (usuario_id, subject_google, evento_id, versao)` é o que impede dois registros
vigentes contraditórios: duas transações concorrentes que leiam a mesma versão atual
tentam gravar a mesma versão seguinte, e a segunda é recusada pelo índice — não pela
aplicação. A prova usa duas conexões reais.

## Motivo: catálogo fechado, sem diagnóstico

`motivo` aceita apenas `transporte`, `custo`, `disponibilidade` e `outras`, pelo CHECK.
São barreiras logísticas; o requisito manda identificar barreira **sem produzir diagnóstico
de risco**, então não há escore, não há classificação clínica e não há termo clínico no
catálogo. Texto livre opcional vai em `observacao_cifrada`, no mesmo envelope AEAD das
demais fatias, com AAD próprio (`cadastro.realizacao_compromisso`, `registro_id`, `versao`,
campo `observacao`). O ramo novo em `supabase/functions/_shared/cifra-autenticada.ts` é
aditivo: um `if` a mais, nenhum ramo existente alterado.

Motivo é obrigatório em `faltou` (é o que o requisito pede identificar), opcional em
`cancelado` e `remarcado`, e proibido em `realizado` — junto com a observação. Registrar
que algo foi realizado não é lugar para texto livre sobre a pessoa.

## Audiência — SUPOSIÇÃO CONSERVADORA

O solicitante não decidiu quem registra. Adotado, como suposição conservadora:

- **registra e lê**: o dono daquela agenda individual (perfil Profissional ou
  Administrador, concessão vigente e sessão válida) e o Administrador, para qualquer
  agenda. A recomendação do recorte foi seguida literalmente;
- **não registra e não lê**: Família, sempre. Outro Profissional que não seja dono da
  agenda também não registra nem lê, inclusive por chamada direta ao wrapper.

A decisão vale no banco, não na tela: as policies do owner filtram por
`usuario_id = auth_privado.uid()` ou perfil Administrador do ator, e a operação repete a
mesma condição antes de gravar. Esconder botão não é autorização.

## A situação não é canal lateral de conteúdo clínico

A tabela **não tem** `paciente_id` e a operação **não lê** `cadastro.paciente` nem
`identidade.agenda_google_vinculo_paciente`. O owner dedicado não recebe privilégio nenhum
nessas tabelas. Então a situação de realização não pode revelar o paciente vinculado a
quem não tem acesso ao caso: não há nada a revelar no caminho. O único texto livre é
cifrado e volta cifrado do banco; a decifra acontece no servidor, para quem a operação já
autorizou.

Isso é deliberadamente mais restrito do que seria "mostrar o paciente junto da situação".
Correlacionar situação e paciente é trabalho da carteira (FR-026), com a autorização de
caso que ela já exige — não deste registro.

## Recorte de ameaças

Escopo: integridade e confidencialidade do registro de realização. Navegador e HTTP não
confiáveis; servidor que assina atestado; RPC PostgreSQL com owner dedicado e RLS. O ator
autenticado pode chamar o wrapper diretamente e repetir pedidos antigos, mas não recebe o
papel owner nem a chave de assinatura. Fora do recorte: integração remota do Google,
provedor Auth real e aplicação remota de migração.

- **Alta:** colaborador ler ou escrever situação da agenda de outra pessoa. Mitigação:
  policy do owner e condição repetida na operação, provadas com acesso direto ao wrapper.
- **Alta:** familiar alcançar a operação. Mitigação: o bloco de autorização só admite
  `oauth` com concessão `google_workspace` de perfil Profissional/Administrador; Família
  não tem concessão de equipe. Negação auditada.
- **Alta:** ausência de confirmação virar falta. Mitigação: `faltou` só existe por
  registro explícito; `realizacao_nao_confirmada` não é gravável e a derivação é função
  pura testada.
- **Média:** duas gravações concorrentes deixarem o evento com situação ambígua.
  Mitigação: unicidade por versão, provada com duas conexões reais.
- **Média:** o registro virar canal lateral do vínculo paciente↔evento. Mitigação: nenhum
  privilégio do owner alcança paciente ou vínculo; a ACL exata é provada.

Suposição conservadora que mais influencia o ranking: a audiência acima. Se o solicitante
decidir que a case manager do caso também registra, a condição muda na policy e na
operação, e as provas positivas/negativas precisam ser refeitas.
