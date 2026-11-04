# Design

## Context

A referência de identidade FR-035 exige conta individual Google e autorização específica; o acesso temporário local não atende nem modifica essa regra. A referência Atendimento orienta responsabilidades claras e validação nas fronteiras; a demonstração não reproduz sua arquitetura de produção.

## Goals / Non-Goals

**Goals:** sessão conferida no servidor, dados fictícios persistentes no computador e demonstração identificável.

**Non-Goals:** identidade individual institucional, autorização por caso, audiência ou agenda, dados reais, serviços remotos e deploy.

## Decisions

- Servidor em loopback, senha configurada fora do repositório, sessão revogável e validação das requisições no servidor. Um controle apenas no navegador não protege o acesso direto.
- Persistência em arquivo local com permissões restritas e gravação segura; permite retomar o feedback sem depender de serviço externo. A alternativa conectada requer decisões e autorização fora deste recorte.
- A interface informa o limite fictício e apresenta estados de erro. Não presumir que credenciais locais concedem autorização no produto.

## Risks / Trade-offs

- [Uso acidental de dados reais] → aviso explícito; a ferramenta não substitui os controles de produção.
- [Acesso por outros processos locais] → limitar exposição à máquina e restringir arquivos; isso não constitui isolamento entre usuários do computador.
- [Falha de armazenamento] → informar erro e não confirmar cadastro que não foi persistido.

## Migration Plan

Sem migração remota ou deploy. Interromper os processos locais desfaz a exposição do serviço; o arquivo fictício permanece local até remoção deliberada pelo responsável.

## Prévia fictícia persistente (04/11/2026)

Anamnese e tarefas da demonstração são armazenadas por paciente no computador, exclusivamente no serviço local autenticado. Escritas usam revisão para recusar conflito entre abas e gravação atômica; falhas não confirmam sucesso. O armazenamento não é cifrado e aceita somente dados fictícios. Não representa prontuário, histórico versionado, autorização clínica ou integração de produção. As specs de produção e seus gates permanecem vigentes.


Relatos fictícios usam o arquivo de prévia por paciente e a revisão concorrente já existente. A interface preserva o rascunho em falhas e oferece conferência da lista. A preparação isolada continua descartável; o armazenamento local não é cifrado nem adequado a dados reais.

A prévia aceita múltiplos campos nomeados pelo usuário, associados a seções livres, com estado, valor, fonte e data. A leitura do formato anterior apresenta sua resposta como campo Exemplo; ao salvar, preserva seu conteúdo no formato de lista. Os nomes são organização fictícia, sem regras clínicas inferidas.

Metadados de documentos fictícios persistem na mesma prévia por paciente e usam revisão concorrente. Anexos fictícios PDF, PNG, JPEG ou TXT de até 2 MB ficam em arquivos locais por paciente, com acesso autenticado e gravação atômica. Não há integração com Drive. O armazenamento local não é cifrado nem adequado a dados reais; a validação de formato não garante segurança do conteúdo.
