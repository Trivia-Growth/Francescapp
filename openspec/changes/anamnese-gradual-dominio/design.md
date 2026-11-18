# Design

## Context

FR-003 permanece referência integral. Há módulo local sem I/O e teste fictício em `packages/cadastro`; não constitui jornada conectada. A referência Atendimento recomenda domínio tipado sem framework e validação nas fronteiras.

## Goals / Non-Goals

**Goals:** fornecer cálculo reutilizável de ausências e pendências a partir de seções e campos esperados fornecidos pelo chamador.

**Non-Goals:** definir conteúdo clínico, concluir FR-003, liberar acesso remoto ou usar dados reais.

## Decisions

- Usar quatro estados explícitos e manter fonte/data nas respostas resolvidas. Pendente não exige fonte/data neste recorte; política de proveniência completa permanece para integração. Alternativa de inferir estado pelo valor vazio confundiria ausência e desconhecimento.
- Receber campos esperados do chamador, sem catálogo inventado. Resultado vazio indica apenas ausência de pendências detectáveis na entrada, não completude clínica. Uma resposta atual por campo é pré-condição; entrada externa precisa validar duplicidade e formato antes do domínio.
- O cálculo de domínio permanece puro. Por decisão definitiva de 17/11/2026, colaboradores ativos com concessão de equipe vigente precisam de vínculo ativo ao caso para ler, editar e consultar histórico. Família e permissões de agenda não conferem acesso por inferência. A integração deve revalidar identidade, sessão e concessão no servidor e banco, inclusive revogação concorrente.

## Risks / Trade-offs

- Dados insuficientes ou duplicados podem produzir resultado enganoso; validar entradas na fronteira e não apresentar resultado como avaliação clínica.
- Tipos não validam fonte/data em tempo de execução. Integração futura exige validação, proteção dos dados e provas de acesso permitido, negado e revogado, inclusive acesso direto e outro paciente.
- Nenhuma operação remota integra esta mudança. Antes de usar dados reais, definir seções e regras aplicáveis, audiência, retenção e recuperação; demonstrar integração e controles em ambiente autorizado.

## Contrato interno proposto para persistência local

A integração deve seguir os wrappers privados `api` e atestados existentes: validar JWT e sessão nativa, conferir atestado de operação e revalidar sessão local, usuário ativo e concessão vinculada de equipe, mantendo locks na ordem da fundação até o fim da transação. Leitura e escrita devem rejeitar papéis familiares, concessões revogadas, usuários inativos e sessões encerradas ou expiradas. Exigir `cadastro.acesso_paciente` do ator/paciente com `revogada_em is null`, sob `FOR SHARE`, também no histórico.

Gravar versões imutáveis por paciente com controle de versão esperado para evitar sobrescrita concorrente; rejeitar conflitos. Guardar conteúdo e proveniência em envelope cifrado autenticado com AAD que vincule paciente, registro, versão e campo; o banco valida formato e não recebe texto clínico. Cada leitura e gravação deve gerar auditoria transacional sem conteúdo clínico. Nenhum grant direto às tabelas ou aos papéis de aplicação até existir wrapper isolado e prova de acesso direto, privilégios, revogação concorrente e recuperação. A implementação e a escolha do contrato exato de cifra devem reutilizar a fundação, sem simular segurança nem alegar persistência conectada.

Ameaças: acesso por familiar ou concessão revogada, troca de paciente/envelope e perda de edição concorrente. Mitigações propostas: conferir autoridade sob lock, AAD autenticado, versão esperada e auditoria atômica. Controles ainda não implementados para anamnese; S-02 e integração de cifra permanecem pré-requisitos.

## Consulta histórica preparada

Consultar uma versão por página, em ordem decrescente, com cursor exclusivo de versão; ausência de cursor inicia pela versão mais recente. Cada página exige a mesma sessão, concessão e vínculo ativo ao caso da leitura atual, atestado vinculando paciente e cursor, auditoria transacional e decifragem autenticada com o AAD original. Resultado vazio encerra a navegação. O acesso deve permanecer fechado até revisão S-02 e provas reais de autorização, revogação e auditoria. Não são criados critérios clínicos, retenção ou acesso familiar.

Ameaças específicas: cursor ou paciente adulterado, leitura após revogação, troca de envelope e consulta sem auditoria. Mitigações propostas: atestar entrada completa, autorização e locks do banco, validar AAD e falhar fechando em falha de auditoria. Testes locais não comprovam Auth ou Vault reais.

## Autorização por caso — 18/11/2026

Migration `20261125010000` acrescenta a consulta de vínculo às duas operações privadas, depois da autorização de identidade/sessão/concessão e antes de versões, idempotência ou histórico. O lock de vínculo dura até o fim da transação; revogação concorrente serializa com a operação. Grants novos limitam SELECT às três colunas necessárias e UPDATE a `revogada_em` somente para permitir `FOR SHARE`; policy `WITH CHECK (false)` impede alterar o vínculo. RPCs públicas e grants de conteúdo não mudam.

**Suposição conservadora, solicitante indisponível:** decisão definitiva não especifica exceção administrativa. Portanto administrador também precisa de vínculo ativo ao caso. Perfil, concessão e sessão de administrador continuam admitidos; não se cria acesso global por inferência.

Ameaça principal: profissional autenticado troca `paciente_id` e lê/escreve conteúdo ou histórico de outro caso. Fronteira HTTP/SQL é protegida por atestado existente e nova autorização SQL por ator/paciente. Segunda ameaça: replay após revogação; autorização acontece antes da idempotência. Terceira: owner da operação usa grant de lock para revogar vínculo; RLS de UPDATE rejeita qualquer nova linha. Ativos: envelopes clínicos e proveniência; atacante considerado é usuário de aplicação autenticado, sem credenciais de superuser. Provas locais usam Auth/Vault fixtures e não certificam Supabase/HTTP remoto.
