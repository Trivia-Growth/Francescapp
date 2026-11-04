# Design

## Context

FR-003 permanece referência integral. Há módulo local sem I/O e teste fictício em `packages/cadastro`; não constitui jornada conectada. A referência Atendimento recomenda domínio tipado sem framework e validação nas fronteiras.

## Goals / Non-Goals

**Goals:** fornecer cálculo reutilizável de ausências e pendências a partir de seções e campos esperados fornecidos pelo chamador.

**Non-Goals:** definir conteúdo clínico, concluir FR-003, persistir dados ou conceder acesso.

## Decisions

- Usar quatro estados explícitos e manter fonte/data nas respostas resolvidas. Pendente não exige fonte/data neste recorte; política de proveniência completa permanece para integração. Alternativa de inferir estado pelo valor vazio confundiria ausência e desconhecimento.
- Receber campos esperados do chamador, sem catálogo inventado. Resultado vazio indica apenas ausência de pendências detectáveis na entrada, não completude clínica. Uma resposta atual por campo é pré-condição; entrada externa precisa validar duplicidade e formato antes do domínio.
- Função pura, sem armazenamento nem autorização. Autenticação, vínculo por paciente e audiência são controles separados; permissões de agenda não se aplicam por inferência. Integração futura deve autorizá-los no servidor e banco, sem segredos no cliente.

## Risks / Trade-offs

- Dados insuficientes ou duplicados podem produzir resultado enganoso; validar entradas na fronteira e não apresentar resultado como avaliação clínica.
- Tipos não validam fonte/data em tempo de execução. Integração futura exige validação, proteção dos dados e provas de acesso permitido, negado e revogado, inclusive acesso direto e outro paciente.
- Nenhuma migração ou operação remota integra esta mudança. Antes de persistir ou usar dados reais, definir seções e regras aplicáveis, permissões e audiência, modelo, retenção, auditoria e recuperação; demonstrar integração e controles em ambiente autorizado.
