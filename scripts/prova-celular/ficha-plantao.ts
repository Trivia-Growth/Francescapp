/**
 * Bancada da prova de conforto no celular para a ficha de plantão e para o consolidado
 * diário no formato da ficha (mudança OpenSpec `diario-de-plantao`, FR-073 e FR-080).
 *
 * Monta o código real de `web/ficha-plantao.ts` e `web/consolidado-ficha-plantao.ts` com as
 * folhas de estilo reais e dublês de rede: nenhuma requisição sai daqui, nenhuma credencial
 * é usada e todos os dados são fictícios. O dublê existe só para alcançar o estado de
 * sucesso das duas telas — ele não autoriza nada e não substitui os testes de autorização
 * de servidor e de banco.
 */
import { montarFichaPlantao, type ServicosFichaPlantao } from '../../web/ficha-plantao.ts';
import { apresentarConsolidadoFicha } from '../../web/consolidado-ficha-plantao.js';
import { aplicarControlesProprios } from '../../web/ui/controles.ts';
import type { CampoExtraCatalogoGeneralizado } from '../../packages/contracts/src/campo-extra-catalogo.ts';
import type { RelatorioTurnoPublico } from '../../packages/contracts/src/turno-execucao-http.ts';
import type { Turno } from '../../packages/contracts/src/turno.ts';

const recusado = () => Promise.reject(new Error('A bancada não fala com a rede.'));

const paciente = '70000000-0000-4000-8000-000000000001';
const turnoId = '70000000-0000-4000-8000-000000000002';
const profissional = '70000000-0000-4000-8000-000000000003';

const turno: Turno = {
  turno_id: turnoId,
  paciente_id: paciente,
  profissional_usuario_id: profissional,
  aberto_em: '2026-11-20T10:00:00.000Z',
  encerrado_em: null,
  situacao: 'aberto',
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 360,
    tolerancia_atraso_minutos: 30,
    tratamento_nao_encerrado: 'sinalizar_pendencia',
  },
};

// Texto propositalmente longo e sem espaço: é o que empurraria a largura da página.
const LONGO =
  'Observacao-ficticia-muito-longa-sem-espacos-para-medir-quebra-de-linha-na-tela-estreita';

function campo(
  id: string,
  nome: string,
  ordem: number,
  extras: Partial<CampoExtraCatalogoGeneralizado> = {},
): CampoExtraCatalogoGeneralizado {
  return {
    campo_id: id,
    escopo: 'ficha_plantao',
    nome,
    tipo: 'texto_longo',
    opcoes: null,
    ativo: true,
    ordem,
    obrigatorio: false,
    de_fabrica: true,
    visibilidade: 'interna',
    versao: 1,
    ...extras,
  };
}

const modelo: CampoExtraCatalogoGeneralizado[] = [
  campo('7f1c0001-0000-4000-8000-000000000001', 'Estado emocional observado', 1, {
    tipo: 'texto',
  }),
  campo('7f1c0001-0000-4000-8000-000000000002', 'Rotina', 2, { visibilidade: 'compartilhavel' }),
  campo('7f1c0001-0000-4000-8000-000000000003', 'Atividades', 3, {
    visibilidade: 'compartilhavel',
  }),
  campo('7f1c0001-0000-4000-8000-000000000004', 'Alimentação', 4, {
    visibilidade: 'compartilhavel',
  }),
  campo('7f1c0001-0000-4000-8000-000000000005', 'Medicação', 5),
  campo('7f1c0001-0000-4000-8000-000000000006', 'Intercorrências', 6),
  campo('7f1c0001-0000-4000-8000-000000000007', 'Observações', 7),
  campo('7f1c0001-0000-4000-8000-000000000008', 'Pendências', 8),
];

const servicos = {
  ficha: {
    consultar: () =>
      Promise.resolve({
        ficha: null,
        pendencias: [
          {
            pendencia_id: '70000000-0000-4000-8000-000000000004',
            turno_id: turnoId,
            versao: 1,
            origem: 'declarada',
            situacao: 'aberta',
            texto: `Confirmar receita fictícia com a família. ${LONGO}`,
            fonte: 'observacao_direta',
            visibilidade: 'interna',
            declarado_por_usuario_id: profissional,
            registrado_em: '2026-11-20T17:00:00.000Z',
            resolvido_por_usuario_id: null,
            resolvido_em: null,
          },
        ],
      }),
    consultarRascunho: () => Promise.resolve(null),
    salvarRascunho: recusado,
    publicar: recusado,
    resolverPendencia: recusado,
  },
  modelo: { consultar: () => Promise.resolve(modelo), gravar: recusado },
  papeis: {
    consultar: () =>
      Promise.resolve([
        {
          papel_id: '70000000-0000-4000-8000-000000000005',
          nome: 'Acompanhante terapêutico',
          ativo: true,
          de_fabrica: true,
          versao: 1,
        },
        {
          papel_id: '70000000-0000-4000-8000-000000000006',
          nome: 'Enfermeira',
          ativo: true,
          de_fabrica: true,
          versao: 1,
        },
      ]),
    gravar: recusado,
  },
} as unknown as ServicosFichaPlantao;

const relatorio: RelatorioTurnoPublico = {
  consulta_id: '70000000-0000-4000-8000-000000000007',
  instante_corte: '2026-11-20T23:00:00.000Z',
  rotulos_atuais: true,
  tipo: 'diario',
  paciente_id: paciente,
  inicio: '2026-11-20T00:00:00.000Z',
  fim: '2026-11-21T00:00:00.000Z',
  proximo_cursor: null,
  lacunas: [{ inicio: '2026-11-20T13:00:00.000Z', fim: '2026-11-20T19:00:00.000Z' }],
  itens: [
    {
      categoria: 'turno',
      id: turnoId,
      versao: 1,
      instante: turno.aberto_em,
      dados: { ...turno, profissional_nome: `Acompanhante fictícia ${LONGO}` },
    },
    {
      categoria: 'rotina',
      id: '70000000-0000-4000-8000-000000000008',
      versao: 1,
      instante: '2026-11-20T12:00:00.000Z',
      dados: {
        paciente_id: paciente,
        turno_id: turnoId,
        registro_id: '70000000-0000-4000-8000-000000000008',
        versao: 1,
        conteudo: {
          classe: 'rotina',
          dados: {
            tipo: 'refeicao',
            turno_id: turnoId,
            instante_ocorrencia: '2026-11-20T12:00:00.000Z',
            momento: 'almoco',
            aceitacao: 'parcial',
            observacao: LONGO,
          },
        },
        registrador_usuario_id: profissional,
        registrador_nome: 'Profissional fictício',
        criado_em: '2026-11-20T12:05:00.000Z',
        instante_ocorrencia: '2026-11-20T12:00:00.000Z',
        retificada: false,
      },
    },
  ],
};

// Mesma ordem de `main.ts`: o observador liga ANTES do conteúdo existir. Em produção
// `ficha-plantao.ts` é hospedado dentro de `ficha-view` (via `turno-execucao.ts`, seção da
// ficha do paciente) — `#conteudo` faz esse papel aqui, e `subtree: true` cobre os dois
// pontos de montagem abaixo dele.
const conteudo = document.getElementById('conteudo');
if (conteudo) aplicarControlesProprios(conteudo);

const raizFicha = document.getElementById('ficha');
if (raizFicha)
  montarFichaPlantao(raizFicha, servicos, {
    pacienteId: paciente,
    turno,
    acessoPerdido: () => {},
  });

const raizConsolidado = document.getElementById('consolidado');
if (raizConsolidado) {
  const secao = document.createElement('section');
  secao.className = 'turno-execucao';
  secao.append(
    apresentarConsolidadoFicha(
      relatorio,
      new Map([
        [
          turnoId,
          {
            ficha: {
              registro_id: turnoId,
              turno_id: turnoId,
              versao: 1,
              periodo: 'diurno' as const,
              papel_declarado: 'Acompanhante terapêutico',
              atividades: {
                texto: `Caminhada fictícia no quintal. ${LONGO}`,
                fonte: 'observacao_direta' as const,
                visibilidade: 'compartilhavel' as const,
              },
              observacoes: null,
              autor_usuario_id: profissional,
              registrado_em: '2026-11-20T13:00:00.000Z',
              retroativo: true,
            },
            pendencias: [],
          },
        ],
      ]),
    ),
  );
  raizConsolidado.append(secao);
}
