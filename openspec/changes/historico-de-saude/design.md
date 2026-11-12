# Decisões técnicas — histórico de saúde (FR-004)

## Modelo: três campos para três exigências do requisito

O requisito pede "autor/origem, data e situação de confirmação" e que "um relato leigo
mantenha sua origem visível". Isso virou três campos distintos em `RegistroSaude`, não
um texto livre:

- `origem: string` — autor/origem como informado, sem normalizar nem inferir.
- `natureza: 'profissional' | 'relato_leigo' | 'documento'` — quem originou a
  informação. É este campo que impede um relato de quem convive virar parecer só por
  estar no sistema; ele é obrigatório, sempre persistido e sempre exibido.
- `situacao: 'confirmado' | 'hipotese'` — preserva a diferença entre diagnóstico e
  hipótese que o requisito exige.

Além deles, `tipo: 'historico' | 'avaliacao' | 'diagnostico'` cobre as três naturezas de
registro citadas no texto do requisito.

**Decisão deliberada:** não existe regra proibindo `natureza='relato_leigo'` com
`situacao='confirmado'`. Essa seria uma regra clínica nova, não decidida pelo
solicitante. O contrato preserva e exibe as duas informações; quem lê decide o peso.

## Reuso do padrão de escrita da anamnese

A fatia é uma cópia disciplinada do recorte canônico da anamnese, porque o risco é o
mesmo (conteúdo clínico versionado por paciente) e a arquitetura já foi revisada:

- envelope AEAD `{formato,key_id,nonce,ciphertext,tag}` com AAD ligando
  `{tabela,paciente_id,registro_id,versao,campo,formato}`;
- atestado HMAC emitido no servidor via Vault, com janela de 30 segundos, verificado em
  SQL por `identidade.verificar_assinatura_atestado`;
- autorização revalidada sob trava (`bloqueios_auth.travar`, `for share` em
  configuração, usuário, concessão e sessão);
- idempotência em `operacao.requisicao` por `(ator_usuario_id, operacao, chave)`,
  guardando só o digest da entrada;
- `auditoria.evento` obrigatório em todo caminho, com `AUDITORIA_NAO_INSERIDA` se a
  linha não gravar; identidade Auth sem perfil é auditada por `ator_auth_id`, sem criar
  usuário.

O AAD em `supabase/functions/_shared/cifra-autenticada.ts` reaproveita o mesmo ramo da
anamnese: o formato é idêntico e a `tabela` — que entra na ligação — é justamente o que
impede trocar o envelope de uma pela da outra. Há teste cobrindo essa troca nos dois
lados (SQL e composição HTTP).

## Owner dedicado

`ffcmapp_saude_owner` é criado só para esta fatia. Ele não enxerga `nome_cifrado` do
paciente, não alcança `cadastro.anamnese_versao` e não é membro de nenhum outro owner.
Como `for share`/`for update` exigem privilégio de UPDATE além do de SELECT no
PostgreSQL, cada tabela travada recebe `update` de uma coluna inócua acompanhado de uma
policy `_lock` com `using (true) with check (false)`, que nunca permite gravar.

## Bloqueio de negócio: FR-020 (plano de crise)

FR-020 exige "plano de crise aprovado pelo **profissional habilitado**". **Não existe
conceito de habilitação no sistema**: os perfis são `administrador`, `profissional` e
`familia`; não há campo de registro de conselho, especialidade ou credencial em
`public.usuario` nem em `identidade.concessao_equipe` (`grep -rin "habilitad"` não
encontra nenhum campo). `docs/projeto/roteiro-especificacoes.md:45` ainda lista "plano
de crise com equipe habilitada" como trabalho pendente.

Escolher quem aprova seria inventar regra de negócio, então a fatia parou aqui. As
opções que o solicitante precisa decidir:

1. qualquer usuário de perfil `profissional` aprova;
2. nova marca de habilitação na concessão (quem é habilitado passa a ser dado do banco,
   preenchido em tela — coerente com a diretriz de configuração variável no front);
3. apenas o profissional responsável pelo caso;
4. reusar a lista `identidade.aprovador_plano_cuidado` já construída para o plano de
   cuidado, que hoje permite a Edilaine eleger aprovadores.

A opção 2 ou a 4 parecem as mais próximas do que já foi decidido, mas a escolha é do
solicitante.
