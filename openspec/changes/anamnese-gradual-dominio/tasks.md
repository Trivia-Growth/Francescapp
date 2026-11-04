# Tasks

## 1. Domínio parcial de FR-003

- [x] 1.1 Revisar o módulo local e sua interface para os quatro estados, fonte/data e identificação de ausências e pendências conforme cenários do delta. Dep.: proposta, spec e design desta mudança. Evidência: teste direcionado com dados fictícios e revisão dos resultados; não alegar FR-003 integral.
- [x] 1.2 Revisar integração de qualquer consumidor local para manter a pré-condição de uma resposta por campo e deixar explícito que não há persistência nem avaliação clínica. Dep.: 1.1 e consumidor existente. Evidência: comportamento observável e verificações afetadas, sem dados reais.
- [ ] 1.3 Realizar revisão da fatia contra padrões e spec, registrar achados, verificações e limitações neste arquivo. Dep.: 1.1 e 1.2. Evidência: diff revisado e resultados das verificações aplicáveis.

Prévia local integrada ao domínio, apenas com dados fictícios em memória. Testes direcionados passaram; lint e typecheck passaram. Revisão encontrou mensagem de salvamento desatualizada após edição; correção e teste direcionado passaram, com revisão estática da correção. A revisão formal da fatia e a integração real seguem pendentes.

## Dependências para uso real

A persistência e o uso de dados reais não são tarefas executáveis desta mudança. Exigem decisões e planejamento próprios para seções e critérios, modelo, permissões por paciente e audiência, retenção, auditoria, proteção e recuperação. Exigem ainda validação de fronteira e provas positivas e negativas no servidor e banco, incluindo revogação, outro paciente e acesso direto, além de integração real em ambiente autorizado. Operações remotas requerem autorização específica.

### Preparação da próxima fatia conectada

Esta preparação não autoriza migração nem transforma o domínio em persistência. A próxima mudança deve preservar FR-003 (fase Inicial): preenchimento gradual em seções, estados informado, desconhecido, não se aplica e pendente, fonte e data, e localização de seções incompletas. Deve preservar histórico contínuo por paciente e respostas versionadas, distinguindo informação relatada de avaliação clínica. Recarregar deve recuperar o progresso salvo; dados de teste devem ser fictícios.

- [ ] Definir com o solicitante seções, campos e critérios de pendência aplicáveis, sem inferir diagnóstico ou completude clínica.
- [ ] Confirmar leitura e escrita por perfil, vínculo com paciente e audiência, inclusive revogação; acesso à agenda e relação pessoal não concedem acesso por inferência.
- [ ] Projetar armazenamento versionado, concorrência e proveniência, proteção de conteúdo, auditoria sem conteúdo clínico desnecessário, retenção e recuperação. Registrar decisões e ameaças no planejamento da próxima mudança antes de implementar.
- [ ] Planejar integração de servidor e banco com testes positivos e negativos: outro paciente, outro perfil/audiência, acesso direto, revogação e caminhos privilegiados. Comprovar persistência e retomada em ambiente local autorizado; adapters fictícios não comprovam integração externa.

Os itens acima são gates de planejamento, não decisões clínicas ou autorização de operações remotas. A mudança futura precisa conciliar proposta, requisitos, design e tarefas antes da implementação.
