/** Rastro de falha operacional no log do servidor.
 *
 * Em 13/11/2026 três rotas administrativas devolveram `servico_indisponivel` em produção e
 * levaram cerca de uma hora para diagnosticar, porque o `catch` das composições descartava o
 * erro sem deixar nada para trás. O código público continua opaco de propósito — quem chama
 * não precisa saber por que o banco recusou —, mas o servidor passa a registrar o bastante
 * para alguém descobrir a causa.
 *
 * Segue a forma já usada em `auth-nativo/google.ts`: um objeto com `evento` e `request_id`,
 * e o mesmo `request_id` vai na resposta, ligando a linha do log ao que a pessoa viu.
 *
 * O que NUNCA entra aqui: mensagem crua do PostgreSQL ou do PostgREST, `details`, `hint`,
 * pilha de execução, conteúdo de paciente, identificador de sessão ou de usuário. Mensagem de
 * banco carrega nome de tabela, de coluna e às vezes o valor que falhou; `code` é um
 * identificador curto e estável (`42501`, `PGRST202`) que diagnostica sem descrever o
 * esquema. */

/** Reduz um erro desconhecido a um identificador curto e seguro de registrar. */
export function causaDaFalha(erro: unknown): string {
  if (erro !== null && typeof erro === 'object') {
    const possivel = erro as { code?: unknown; name?: unknown; message?: unknown };
    // Erro de PostgREST/pg: `code` é o que diagnostica (permissão, função ausente, timeout).
    if (typeof possivel.code === 'string' && /^[A-Za-z0-9_]{1,20}$/.test(possivel.code))
      return `banco_${possivel.code}`;
    if (possivel.name === 'AbortError') return 'cancelado';
    // `Pedido cancelado.` é a mensagem fixa que as composições usam no seu próprio
    // cancelamento; comparar com a constante não vaza nada que já não esteja no código.
    if (possivel.message === 'Pedido cancelado.') return 'cancelado';
    if (typeof possivel.name === 'string' && /^[A-Za-z]{1,40}$/.test(possivel.name))
      return `excecao_${possivel.name}`;
  }
  return 'desconhecida';
}

/** Registra a falha correlacionada ao `request_id` que a resposta devolve. */
export function registrarFalhaOperacional(dados: {
  rota: string;
  etapa: 'autorizacao' | 'cofre' | 'operacao' | 'resposta';
  request_id: string;
  causa: string;
}): void {
  console.error({
    evento: 'falha_operacional',
    rota: dados.rota,
    etapa: dados.etapa,
    causa: dados.causa,
    request_id: dados.request_id,
  });
}

/** Registra uma falha na etapa de resposta e devolve o `request_id` para a resposta carregar.
 *
 * As 21 entradas nativas montam a resposta com `<schema>.parse(resultado.dados)` dentro de um
 * `try`, e o `catch` devolvia `servico_indisponivel` sem deixar rastro. Em 13/11/2026 isso
 * custou cerca de uma hora: a listagem de configuração falhava porque UMA linha do catálogo
 * (`ffcm.documentos.drive_pasta_raiz`, semeada em branco) não passava no contrato, e o 503 não
 * dizia nada. A operação tinha funcionado; quebrou ao conferir a saída.
 *
 * Divergência entre o que o banco devolve e o que o contrato aceita é defeito nosso, não do
 * chamador — e é exatamente o que precisa aparecer no log do servidor. */
export function registrarFalhaDeResposta(
  rota: string,
  erro: unknown,
): ReturnType<typeof crypto.randomUUID> {
  const requestId = crypto.randomUUID();
  registrarFalhaOperacional({
    rota,
    etapa: 'resposta',
    request_id: requestId,
    causa: causaDaFalha(erro),
  });
  return requestId;
}
