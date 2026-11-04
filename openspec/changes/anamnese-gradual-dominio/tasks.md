# Tasks

## 1. Domínio parcial de FR-003

- [x] 1.1 Revisar o módulo local e sua interface para os quatro estados, fonte/data e identificação de ausências e pendências conforme cenários do delta. Dep.: proposta, spec e design desta mudança. Evidência: teste direcionado com dados fictícios e revisão dos resultados; não alegar FR-003 integral.
- [x] 1.2 Revisar integração de qualquer consumidor local para manter a pré-condição de uma resposta por campo e deixar explícito que não há persistência nem avaliação clínica. Dep.: 1.1 e consumidor existente. Evidência: comportamento observável e verificações afetadas, sem dados reais.
- [ ] 1.3 Realizar revisão da fatia contra padrões e spec, registrar achados, verificações e limitações neste arquivo. Dep.: 1.1 e 1.2. Evidência: diff revisado e resultados das verificações aplicáveis.

Prévia local integrada ao domínio, apenas com dados fictícios em memória. Testes direcionados passaram; lint e typecheck passaram. Revisão encontrou mensagem de salvamento desatualizada após edição; correção e teste direcionado passaram, com revisão estática da correção. A revisão formal da fatia e a integração real seguem pendentes.

## Dependências para uso real

A persistência e o uso de dados reais não são tarefas executáveis desta mudança. Exigem decisões e planejamento próprios para seções e critérios, modelo, permissões por paciente e audiência, retenção, auditoria, proteção e recuperação. Exigem ainda validação de fronteira e provas positivas e negativas no servidor e banco, incluindo revogação, outro paciente e acesso direto, além de integração real em ambiente autorizado. Operações remotas requerem autorização específica.
