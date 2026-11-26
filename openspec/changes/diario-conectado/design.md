# Decisões técnicas — diário e evolução conectados

## Contexto

FR-008 a FR-014 vivem em `openspec/specs/diario-e-evolucao/spec.md`. FR-010 (áudio) e FR-011
(anexos) ficam fora desta fatia. A canonicidade de escrita privilegiada (envelope AEAD com AAD,
atestado HMAC, revalidação sob trava, auditoria em todo caminho, idempotência, owner dedicado)
vem das fatias de anamnese, saúde e encaminhamentos e não é reaberta aqui.

## Tabela nova, e não a extensão de `cadastro.diario_rascunho_textual`

A tabela de 20261108120000 guarda **um rascunho por paciente e autor**: não tem identidade de
registro, estado de publicação, audiência nem encadeamento de versão. FR-012 exige retificação
com histórico identificado e FR-013 exige estados distintos por registro — as duas coisas são a
chave da linha, não um campo extra. Estendê-la significaria reescrever chave primária,
unicidade e imutabilidade, ou seja, uma tabela nova com o nome antigo. A antiga permanece
fechada (nenhuma função, grant ou policy a alcança) e sai de cena quando a fatia for arquivada.

## O que fica em claro

Em claro só o que a autorização e a consulta precisam ver sem decifrar:

| Coluna | Por quê |
| --- | --- |
| `tipo`, `autor_usuario_id` | decidem quem pode escrever a próxima versão e quem enxerga a linha |
| `estado` | rascunho é privado do autor; decidir isso depois de decifrar seria decidir tarde demais |
| `audiencia` | é o controle de audiência; a RLS filtra por ela |
| `atencao`, `retorno_solicitado` | FR-013/FR-014 exigem localizar o que pediu retorno e o que foi sinalizado |
| `origem_conteudo` | marca transcrição; reduz o que o texto afirma, nunca amplia |
| `responde_registro_id`, `tarefa_id` | referências operacionais, não descrevem o acontecimento |

Data do acontecimento, categoria, descrição, contexto, ação tomada, síntese profissional e a
justificativa da retificação só existem cifrados, com AAD ligando tabela, paciente, registro,
versão e **campo** — por isso o envelope da justificativa não decifra no lugar do conteúdo.

## Matriz de audiência

Origens, não invenção desta fatia:

- `registrar-fundacao-real/specs/sigilo-e-governanca/spec.md`: familiares acessam somente
  pacientes vinculados, seus próprios relatos e o conteúdo disponibilizado à família; o vínculo
  não expõe automaticamente evoluções internas nem relatos de outros familiares; rascunho não
  aparece para quem não é a audiência.
- `diario-textual-privado/design.md`: a audiência inicial publicada é autor e coordenação.
- `relato-textual-inicial/design.md`: divulgação adicional exige audiência explícita.

Resultado aplicado:

| Quem lê | O que enxerga |
| --- | --- |
| autor (qualquer perfil) | os próprios registros, inclusive o rascunho |
| colaborador vinculado | todo registro publicado do paciente, em qualquer audiência |
| familiar vinculado | os próprios registros; publicados com `equipe_e_familia` dirigidos a ninguém em particular; e o retorno ao próprio relato |
| ninguém | rascunho alheio |

**Decorrência registrada, não copiada do requisito**: um retorno a um relato familiar precisa
alcançar quem o escreveu, senão FR-013 ("o remetente distingue enviado, consultado e retorno")
é inalcançável. Por isso a resposta a um `relato_familiar` é **obrigada** a `equipe_e_familia`,
e um registro que responde alguém só é visível, do lado da família, ao autor do registro
respondido — um retorno dirigido a uma família não vaza para outra família do mesmo paciente.

**Ponto em aberto, deliberadamente conservador**: o requisito fala em "coordenação", e a fatia
trata isso como "colaboradores vinculados ao paciente", igual às demais fatias de conteúdo. Se
a equipe quiser restringir o relato familiar à case manager, é mudança de regra de negócio e
precisa de decisão explícita — não foi assumida aqui.

## Quem escreve o quê

- Versão > 1 exige `autor_usuario_id = ator`. FR-012 dá a retificação ao autor, e ninguém
  reescreve o registro de outra pessoa. É policy de RLS, não só checagem na função.
- Quem quer anotar o registro alheio cria o **próprio** registro apontando para ele
  (`responde_registro_id`). É o que FR-013 chama de retorno e o que FR-014 chama de
  encaminhamento da sinalização; o registro original fica intacto.
- Família: só `relato_familiar`, só `audiencia = 'equipe'`, sem responder ninguém e sem
  converter nada em tarefa.
- Colaborador: só `evolucao_profissional`, com as duas audiências disponíveis.
- Transições: rascunho → rascunho | publicado; publicado | retificado → retificado (com
  justificativa). Publicado nunca volta a rascunho.

## Duas trilhas de autorização no mesmo wrapper

- Colaborador: idêntica a anamnese/saúde/encaminhamento (amr `oauth`, concessão `vinculada`,
  sessão `google_workspace`, identidade Google única do domínio confirmado).
- Familiar: idêntica a `api.consultar_paciente_familiar_privado` (20261112040000) — amr
  `password`, `public.usuario.perfil = 'familia'` ativo, `cadastro.acesso_paciente` vigente
  **para o paciente deste pedido**, sessão `familia` sem concessão.

Nenhuma é afrouxada, nenhuma depende da outra, e um ator é uma coisa ou a outra. Isto **não**
liga a jornada de login familiar: só deixa de negar quem já estiver autenticado pelos
mecanismos existentes.

## FR-013: consulta

`cadastro.diario_consulta` guarda a **primeira** leitura de cada leitor que não é o autor,
inserida no caminho de leitura com `on conflict do nothing`. Reler não reescreve a data e não
encerra a solicitação de retorno, como o requisito exige. Não se registra toda leitura: isso
viraria vigilância de leitura sem exigência do requisito. A RLS da tabela só mostra a marca ao
autor do registro e ao próprio leitor.

## FR-009: o modelo e as áreas

Os campos do modelo (atividade, observações compartilháveis, progresso, orientação, próximo
passo) são do requisito e vivem no contrato. O que varia é a **lista de áreas da equipe**, e
por isso vai para `identidade.configuracao_sistema` (`ffcm.diario.areas_sintese`), editável na
tela de administração — diretriz de 11/11/2026. A exposição é `servidor` para que a rota possa
devolver a lista ao profissional junto da disponibilidade; são nomes de especialidade, metadado
organizacional sem dado pessoal, e conteúdo de diário nunca passa por esse caminho.

"A publicação exige data, autor identificado e síntese": autor e data são colunas, garantidas
pelo banco. A síntese está dentro do envelope, que o banco não lê — a exigência é conferida no
contrato e no servidor. A limitação está registrada em `tasks.md`.

## Componente de relato: contrato reaproveitado, tela não

`relatoTextualSchema` é reaproveitado (`conteudoRelatoDiarioSchema` o reusa sem
`solicitacaoRetorno`, que virou coluna em claro). O componente `web/relato-textual.ts`, não:
ele é um protótipo local cujo texto diz "Demonstração local", "prévia local" e "relatos
guardados ficam neste computador". Reaproveitá-lo na tela conectada levaria vocabulário de
mockup para a tela real, exatamente o problema que a revisão visual está corrigindo.

## Riscos aceitos

- `tarefa_id` não tem chave estrangeira: a tarefa pertence a outro owner, e dar a este owner
  privilégio sobre aquela tabela seria pior do que a referência solta. A existência da tarefa é
  comprovada por quem a lê.
- `origem_conteudo = 'audio_transcrito'` é declarado pelo cliente. É um marcador que só reduz o
  que o texto afirma; nenhuma decisão de acesso depende dele.
