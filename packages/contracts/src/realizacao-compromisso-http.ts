import {
  consultarRealizacaoSchema,
  realizacaoCompromissosSchema,
  registrarRealizacaoSchema,
} from './realizacao-compromisso.ts';

/** Contrato HTTP isolado do registro de realização (FR-024), fora do `rotas.ts`
 * compartilhado. A exposição depende da flag própria `ffcm.realizacao_compromisso.ativo`,
 * que NÃO é a flag da integração Google: registrar o que aconteceu com um compromisso não
 * pode depender de a integração estar ligada.
 *
 * Consultar é POST porque o pedido carrega a lista de compromissos da janela exibida;
 * ela pode chegar a 250 identificadores de até 1024 caracteres, o que não cabe em query. */
export const realizacaoCompromissoHttp = {
  consultar: {
    metodo: 'POST',
    caminho: '/api/agenda/realizacao/consulta',
    entrada: consultarRealizacaoSchema,
    saida: realizacaoCompromissosSchema,
  },
  registrar: {
    metodo: 'POST',
    caminho: '/api/agenda/realizacao',
    entrada: registrarRealizacaoSchema,
    saida: realizacaoCompromissosSchema,
  },
} as const;
