# Design

## Por que documento cifrado e não tabela relacional

FR-002 e FR-005 guardam nome, contato, rotina e preferências: dado pessoal e clínico. Uma tabela relacional com colunas em claro exporia esse conteúdo a qualquer caminho que alcance a tabela; cifrar coluna a coluna multiplicaria envelopes e AAD sem ganho de consulta. Nenhum dos dois requisitos pede filtro ou junção por esses campos — só manter e exibir o conjunto. Por isso ambos usam o mesmo molde já provado da anamnese: um documento por paciente, versionado, imutável e cifrado em envelope AEAD, com a AAD amarrando tabela, paciente, registro, versão e campo.

Consequência aceita: não dá para consultar "todos os pacientes com vínculo de responsável financeiro" sem decifrar. Se esse relatório virar requisito, ele entra como projeção derivada, não como mudança de armazenamento.

## Vínculo não soma permissão

FR-002 exige que uma pessoa acumule vínculos "sem somar permissões automaticamente". O desenho garante isso por ausência: a estrutura de `PessoaRede` não tem campo de permissão, capacidade ou acesso, e nenhuma função de autorização lê `cadastro.rede_cuidado_versao`. O conteúdo é opaco para o banco, então nem seria possível derivar permissão dele. A tela diz isso ao usuário em texto, para que marcar "responsável legal" não crie expectativa de acesso.

## Vínculo com objetivos dentro do documento

FR-005 pede ligar elementos a objetivos do plano. O vínculo é guardado como lista de identificadores de objetivo dentro do elemento, no documento cifrado de FR-005. Assim `objetivoSchema` e as operações de plano, já em produção, não mudam, e o vínculo continua descritivo: ele não concede acesso ao objetivo nem o altera. Um identificador que aponte para objetivo removido vira referência órfã exibida como ausente, o que é preferível a bloquear a gravação do contexto por causa do plano.

## Owner dedicado por feature

Cada operação tem owner próprio (`ffcmapp_contexto_cuidado_owner`, `ffcmapp_rede_cuidado_owner`), sem login, sem herança, sem bypass de RLS, com grants por coluna e policies `_lock` nas tabelas lidas sob trava — `FOR SHARE` exige privilégio de UPDATE além de SELECT. Owners não são membros um do outro nem alcançam `cadastro.paciente.nome_cifrado`, o que o teste local verifica explicitamente.

## Consolidação da composição HTTP

As duas features têm a mesma forma (documento versionado por paciente), então compartilham `documento-paciente-nativo.ts`, `compor-documento-paciente-nativo.ts` e `entrada-documento-paciente-nativa.ts`, parametrizados por tabela, operação atestada, RPC e validador. Duas cópias divergiriam justamente nos controles de segurança — revalidação de sessão, AAD, idempotência — que são o motivo de o módulo existir.

O contrato de rota fica nos arquivos da própria feature e não em `rotas.ts`: as rotas nascem desligadas por flag e não devem aparecer no cliente geral antes das provas no ambiente-alvo.
