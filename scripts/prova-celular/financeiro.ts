/**
 * Bancada da prova de conforto no celular (tarefa 4.3 de `financeiro-despesa-e-repasse`).
 *
 * Monta o código real de `web/financeiro.ts` com a folha de estilo real e um dublê de rede:
 * nenhuma requisição sai daqui, nenhuma credencial é usada e todos os dados são fictícios.
 * O dublê existe só para alcançar o estado de sucesso das três telas — ele não autoriza nada
 * e não substitui os testes de autorização de servidor e banco.
 */
import { montarFinanceiro } from '../../web/financeiro.ts';
import type { ServicoFinanceiro } from '../../web/servico-financeiro-http.ts';

const recusado = () => Promise.reject(new Error('A bancada não fala com a rede.'));

// Identificador propositalmente longo: é o caso que empurraria a largura da página.
const CASO_FICTICIO = 'caso-ficticio-0000aaaa-1111-2222-3333-444455556666-para-medir-quebra';

const servico = {
  consultarAudiencia: () => Promise.resolve(true),
  listarValores: () =>
    Promise.resolve([
      {
        valor_id: '11111111-1111-1111-1111-111111111111',
        profissional_usuario_id: CASO_FICTICIO,
        valor_turno_centavos: 18550,
        vigencia: { inicio: '2026-01-05', fim: null },
        motivo: 'Combinado fictício de turno para medir a tela, sem relação com pessoa real.',
      },
    ]),
  registrarValor: recusado,
  listarDespesas: () =>
    Promise.resolve([
      {
        despesa_id: '22222222-2222-2222-2222-222222222222',
        paciente_id: CASO_FICTICIO,
        descricao: 'Transporte fictício de ida e volta ao acompanhamento.',
        valor_centavos: 4790,
        data: '2026-02-11',
        responsavel_usuario_id: CASO_FICTICIO,
        autorizacao: CASO_FICTICIO,
        versao: 2,
        retificacao_de_versao: 1,
        tem_comprovante: true,
      },
    ]),
  registrarDespesa: recusado,
  enviarComprovante: recusado,
  baixarComprovante: recusado,
  consultarApuracao: () =>
    Promise.resolve({
      total_centavos: 55650,
      pendentes: 1,
      consultado_em: '2026-02-28T12:00:00.000Z',
      linhas: [
        {
          turno_id: CASO_FICTICIO,
          data: '2026-02-11',
          valor_centavos: 18550,
          situacao: 'apurada',
        },
        { turno_id: CASO_FICTICIO, data: null, valor_centavos: null, situacao: 'pendente_valor' },
      ],
    }),
} as unknown as ServicoFinanceiro;

const raiz = document.getElementById('raiz');
if (raiz) montarFinanceiro(raiz, servico, { profissionalPadrao: '', casoPadrao: '' });
