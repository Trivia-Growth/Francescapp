# Tasks

## 1. Domínio parcial de FR-003

- [x] 1.1 Revisar o módulo local e sua interface para os quatro estados, fonte/data e identificação de ausências e pendências conforme cenários do delta. Dep.: proposta, spec e design desta mudança. Evidência: teste direcionado com dados fictícios e revisão dos resultados; não alegar FR-003 integral.
- [x] 1.2 Revisar integração de qualquer consumidor local para manter a pré-condição de uma resposta por campo e deixar explícito que não há persistência nem avaliação clínica. Dep.: 1.1 e consumidor existente. Evidência: comportamento observável e verificações afetadas, sem dados reais.
- [ ] 1.3 Realizar revisão da fatia contra padrões e spec, registrar achados, verificações e limitações neste arquivo. Dep.: 1.1 e 1.2. Evidência: diff revisado e resultados das verificações aplicáveis.

Prévia local integrada ao domínio, apenas com dados fictícios em memória. Testes direcionados passaram; lint e typecheck passaram. Revisão encontrou mensagem de salvamento desatualizada após edição; correção e teste direcionado passaram, com revisão estática da correção. A revisão formal da fatia e a integração real seguem pendentes.

## Dependências para uso real

A persistência local com dados fictícios integra o planejamento; o uso de dados reais permanece bloqueado. Uso real exige decisões para seções e critérios, audiência, retenção e recuperação, além de auditoria e proteção verificadas. Exigem ainda validação de fronteira e provas positivas e negativas no servidor e banco, incluindo revogação, outro paciente e acesso direto, além de integração real em ambiente autorizado. Operações remotas requerem autorização específica.

### Preparação da fatia conectada

Esta preparação não autoriza migração remota nem transforma o domínio em persistência. A fatia deve preservar FR-003 (fase Inicial): preenchimento gradual em seções, estados informado, desconhecido, não se aplica e pendente, fonte e data, e localização de seções incompletas. Deve preservar histórico contínuo por paciente e respostas versionadas, distinguindo informação relatada de avaliação clínica. Recarregar deve recuperar o progresso salvo; dados de teste devem ser fictícios.

- [ ] Definir com o solicitante seções, campos e critérios de pendência aplicáveis, sem inferir diagnóstico ou completude clínica.
- [x] Registrar decisão provisória: colaboradores ativos com concessão vigente consultam e editam qualquer anamnese sem vínculo individual; familiares não recebem acesso por inferência. FFCM deverá definir regra definitiva. Revogação e sessão devem ser verificadas no servidor e banco.
- [ ] Projetar armazenamento versionado, concorrência e proveniência, proteção de conteúdo, auditoria sem conteúdo clínico desnecessário, retenção e recuperação. Registrar decisões e ameaças nesta mudança antes de implementar.
- [ ] Planejar integração de servidor e banco com testes positivos e negativos: outro paciente, outro perfil/audiência, acesso direto, revogação e caminhos privilegiados. Comprovar persistência e retomada em ambiente local autorizado; adapters fictícios não comprovam integração externa.

Os itens acima são gates de planejamento, não decisões clínicas ou autorização de operações remotas. Proposta, requisitos, design e tarefas devem permanecer coerentes durante a implementação.

## Persistência local da anamnese

- [ ] Implementar contrato interno proposto no design com versões, cifra autenticada, auditoria e autorização sob lock; integrar a sessão e atestados existentes sem grants diretos.
- [ ] Comprovar persistência e retomada com dados fictícios, concorrência, autorização positiva e negativa, familiar, usuário inativo, concessão e sessão revogadas, acesso direto e caminhos privilegiados.
- [ ] Revisar ameaça e integração reais antes de disponibilizar execução; não usar dados reais nem operar remotamente sem autorização.

Em 04/11/2026, criada migration local para versões privadas de anamnese, ainda sem RPC ou grants para a aplicação. `scripts/testar-anamnese-local.sh` passou em PostgreSQL descartável sem Docker para versões, conflito, imutabilidade, RLS e privilégios diretos. O formato do envelope não comprova cifra autenticada; sessão, atestado, auditoria e acesso seguro precisam ser integrados e verificados. A limpeza seletiva futura também exige mecanismo controlado compatível com a imutabilidade. Nenhuma evidência de persistência conectada ou migration remota.

Preparação posterior: `20261106230000_anamnese_operacoes_privadas.sql` implementa leitura e escrita privadas com sessão, concessão de colaborador, versões e auditoria, sem grant à aplicação. `scripts/testar-anamnese-operacoes-local.sh` passou com fixtures Auth/Vault, cobrindo colaborador, acesso sem vínculo individual, conflito, família e sessão encerrada. Revisão estática não identificou achado concreto no recorte. Cifra autenticada, atestado e Auth reais, concorrência de revogação, integração e S-02 seguem pendentes; fixtures não os comprovam.

Integração parcial local: contratos compartilhados e handler privado de anamnese usam cifra autenticada com AAD vinculado a paciente, registro e versão. Testes direcionados de contrato, cifra real e handler passaram com executor simulado; lint e typecheck passaram. Revisão independente não encontrou achado concreto no diff. Nenhuma rota foi publicada, e banco/Auth/Vault reais, execução SQL integrada e revogação concorrente continuam sem prova.

Consulta preparada localmente: contrato GET, executor PostgREST com cliente da requisição e componente web isolado. Testes direcionados e revisão estática passaram; o componente ainda não está montado e a rota não está ativa. A gravação não recebeu contrato HTTP porque ainda falta tratar repetição e resposta perdida com idempotência. Não presumir persistência conectada ou autorização real.
