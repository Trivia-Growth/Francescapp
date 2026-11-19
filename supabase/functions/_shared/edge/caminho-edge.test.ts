import { expect, it } from 'vitest';
import { criarEntradaConfiguracaoSistemaNativa } from '../../../../netlify/functions/_shared/entrada-configuracao-sistema-nativa.ts';
import { casarCaminho, extrairCaminhoApi, reconstruirRequisicao } from './caminho-edge.ts';
import { criarFuncaoEdge } from './funcao-edge.ts';

function listarCabecalhos(cabecalhos: Headers): string[] {
  const lista: string[] = [];
  cabecalhos.forEach((valor, nome) => lista.push(`${nome.toLowerCase()}: ${valor}`));
  return lista.sort();
}

/** Os mesmos padrões hoje declarados em `netlify/functions/plano.ts`. */
const caminhosDoPlano = [
  '/api/pacientes/:paciente_id/plano',
  '/api/pacientes/:paciente_id/plano/:objetivo_id',
  '/api/pacientes/:paciente_id/plano/:objetivo_id/historico',
  '/api/plano/reserva/consultar',
  '/api/plano/reserva',
  '/api/plano/reserva/encerrar',
  '/api/plano/reserva/reconhecer',
] as const;

const paciente = '0ac9c3bc-9f3e-4bd6-9b6f-5c1b1a1f1a11';
const objetivo = '1bd0d4cd-0a4f-4ce7-8c7f-6d2c2b2f2b22';

it('extrai o caminho /api/* do sufixo, com e sem parâmetro', () => {
  expect(
    extrairCaminhoApi(
      new URL(`https://exemplo.invalid/functions/v1/plano/api/pacientes/${paciente}/plano`),
      'plano',
    ),
  ).toBe(`/api/pacientes/${paciente}/plano`);
  expect(
    extrairCaminhoApi(
      new URL(
        'https://exemplo.invalid/functions/v1/configuracao-sistema/api/admin/configuracao-sistema',
      ),
      'configuracao-sistema',
    ),
  ).toBe('/api/admin/configuracao-sistema');
});

it('recusa sufixo que não é um caminho /api/*, travessia e barra codificada', () => {
  const recusados = [
    'https://exemplo.invalid/functions/v1/plano',
    'https://exemplo.invalid/functions/v1/plano/outro/coisa',
    'https://exemplo.invalid/functions/v1/plano/api/../admin/configuracao-sistema',
    'https://exemplo.invalid/functions/v1/plano/api//pacientes',
    'https://exemplo.invalid/functions/v1/plano/api/pacientes/%2f/plano',
  ];
  for (const bruto of recusados) expect(extrairCaminhoApi(new URL(bruto), 'plano')).toBeNull();
});

it('casa caminho com parâmetro, sem parâmetro, e recusa o desconhecido', () => {
  expect(
    casarCaminho(caminhosDoPlano, `/api/pacientes/${paciente}/plano/${objetivo}/historico`),
  ).toEqual({
    padrao: '/api/pacientes/:paciente_id/plano/:objetivo_id/historico',
    parametros: { paciente_id: paciente, objetivo_id: objetivo },
  });
  expect(casarCaminho(caminhosDoPlano, '/api/plano/reserva')).toEqual({
    padrao: '/api/plano/reserva',
    parametros: {},
  });
  expect(casarCaminho(caminhosDoPlano, '/api/plano/reserva/inexistente')).toBeNull();
  // Parâmetro nunca atravessa segmento.
  expect(casarCaminho(caminhosDoPlano, `/api/pacientes/${paciente}/plano/a/b`)).toBeNull();
});

it('reconstrói a requisição preservando método, cabeçalhos, consulta e corpo', async () => {
  const pedido = reconstruirRequisicao(
    new Request(
      `https://exemplo.invalid/functions/v1/plano/api/pacientes/${paciente}/plano?pagina=2`,
      {
        method: 'POST',
        headers: {
          'x-sessao': '00000000-0000-4000-8000-000000000000',
          'x-chave-idempotencia': '00000000-0000-4000-8000-000000000001',
          'content-type': 'application/json',
          cookie: 'ffcm_sessao_exemplo=valor-ficticio',
        },
        body: '{"ficticio":true}',
      },
    ),
    'plano',
    'https://exemplo.invalid',
  );
  expect(pedido).not.toBeNull();
  const url = new URL((pedido as Request).url);
  expect(url.pathname).toBe(`/api/pacientes/${paciente}/plano`);
  expect(url.search).toBe('?pagina=2');
  expect((pedido as Request).method).toBe('POST');
  expect((pedido as Request).headers.get('x-sessao')).toBe('00000000-0000-4000-8000-000000000000');
  expect((pedido as Request).headers.get('cookie')).toBe('ffcm_sessao_exemplo=valor-ficticio');
  await expect((pedido as Request).text()).resolves.toBe('{"ficticio":true}');
});

it('responde a caminho desconhecido exatamente o que a plataforma antiga responde hoje', async () => {
  const antiga = criarEntradaConfiguracaoSistemaNativa(undefined as never);
  const velha = await antiga.atender(
    new Request('https://exemplo.invalid/api/admin/caminho-inexistente'),
  );
  const funcao = criarFuncaoEdge(
    {
      nome: 'configuracao-sistema',
      caminhos: ['/api/admin/configuracao-sistema'],
      atender: () => {
        throw new Error('caminho desconhecido não pode alcançar a composição');
      },
    },
    {},
  );
  const nova = await funcao(
    new Request(
      'https://exemplo.invalid/functions/v1/configuracao-sistema/api/admin/caminho-inexistente',
    ),
  );
  expect(nova.status).toBe(velha.status);
  expect(listarCabecalhos(nova.headers)).toEqual(listarCabecalhos(velha.headers));
  const corpoVelho = await velha.text();
  const requestId = (JSON.parse(corpoVelho) as { request_id: string }).request_id;
  const corpoNovo = (await nova.text()).replace(
    /"request_id":"[0-9a-f-]{36}"/,
    `"request_id":"${requestId}"`,
  );
  expect(corpoNovo).toBe(corpoVelho);
});

it('entrega caminho e parâmetros à composição quando o caminho é conhecido', async () => {
  const vistos: Array<Readonly<Record<string, string>>> = [];
  const funcao = criarFuncaoEdge(
    {
      nome: 'plano',
      caminhos: [...caminhosDoPlano],
      atender: (pedido, contexto) => {
        vistos.push(contexto.parametros);
        expect(new URL(pedido.url).pathname).toBe(contexto.caminho);
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    },
    {},
  );
  const resposta = await funcao(
    new Request(
      `https://exemplo.invalid/functions/v1/plano/api/pacientes/${paciente}/plano/${objetivo}`,
    ),
  );
  expect(resposta.status).toBe(204);
  expect(vistos).toEqual([{ paciente_id: paciente, objetivo_id: objetivo }]);
});
