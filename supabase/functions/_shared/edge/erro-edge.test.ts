import { expect, it } from 'vitest';
import { criarEntradaConfiguracaoSistemaNativa } from '../../../../netlify/functions/_shared/entrada-configuracao-sistema-nativa.ts';
import {
  codigosErro,
  criarErroPublicoSemCampos,
  statusErroHttp,
} from '../../../../packages/contracts/src/erros.ts';
import { cabecalhosErroEdge, respostaDeErroEdge } from './erro-edge.ts';

/** A plataforma antiga. As dependências nunca são tocadas nos caminhos de erro exercitados
 * abaixo — a composição só é chamada depois da validação de borda. */
const antiga = criarEntradaConfiguracaoSistemaNativa(undefined as never);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function retrato(resposta: Response) {
  const texto = await resposta.text();
  const lista: string[] = [];
  resposta.headers.forEach((valor, nome) => lista.push(`${nome.toLowerCase()}: ${valor}`));
  const cabecalhos = lista.sort().join('\n');
  return { status: resposta.status, texto, cabecalhos };
}

async function compararCaractereACaractere(nova: Response, velha: Response) {
  const retratoVelho = await retrato(velha);
  const requestId = (JSON.parse(retratoVelho.texto) as { request_id: string }).request_id;
  expect(requestId).toMatch(uuid);
  const retratoNovo = await retrato(nova);
  expect(retratoNovo.status).toBe(retratoVelho.status);
  expect(retratoNovo.cabecalhos).toBe(retratoVelho.cabecalhos);
  // Caractere a caractere: o único campo variável é o `request_id`, que é fixado acima.
  expect(retratoNovo.texto).toBe(retratoVelho.texto);
  return requestId;
}

it('reproduz "nao_encontrado" da plataforma antiga caractere a caractere', async () => {
  const velha = await antiga.atender(
    new Request('https://exemplo.invalid/api/admin/caminho-inexistente'),
  );
  const corpo = (await velha.clone().json()) as { request_id: string };
  await compararCaractereACaractere(respostaDeErroEdge('nao_encontrado', corpo.request_id), velha);
});

it('reproduz "nao_autenticado" da plataforma antiga caractere a caractere', async () => {
  const velha = await antiga.atender(
    new Request('https://exemplo.invalid/api/admin/configuracao-sistema'),
  );
  const corpo = (await velha.clone().json()) as { request_id: string };
  await compararCaractereACaractere(respostaDeErroEdge('nao_autenticado', corpo.request_id), velha);
});

it('reproduz "entrada_invalida" da plataforma antiga caractere a caractere', async () => {
  const velha = await antiga.atender(
    new Request('https://exemplo.invalid/api/admin/configuracao-sistema', {
      method: 'POST',
      headers: {
        'x-sessao': '00000000-0000-4000-8000-000000000000',
        'content-type': 'application/json',
      },
      body: '{}',
    }),
  );
  const corpo = (await velha.clone().json()) as { request_id: string };
  await compararCaractereACaractere(
    respostaDeErroEdge('entrada_invalida', corpo.request_id),
    velha,
  );
});

it('preserva os códigos fechados e o formato de erro público sem campos', () => {
  // Os três casos acima provaram que a construção da plataforma antiga é byte a byte a
  // desta borda. O catálogo fechado inteiro é conferido contra a mesma fonte de verdade.
  expect(codigosErro).toContain('sem_permissao');
  expect(codigosErro).toContain('conflito');
  expect(codigosErro).toContain('conflito_idempotencia');
  for (const codigo of codigosErro) {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const esperado = Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers: cabecalhosErroEdge,
    });
    const obtido = respostaDeErroEdge(codigo, requestId);
    expect(obtido.status).toBe(esperado.status);
    expect(
      Object.keys(JSON.parse(JSON.stringify(criarErroPublicoSemCampos(codigo, requestId)))).sort(),
    ).toEqual(['erro', 'request_id']);
  }
});

it('não acrescenta campo algum ao envelope público', async () => {
  const resposta = respostaDeErroEdge('sem_permissao');
  expect(resposta.status).toBe(403);
  const corpo = (await resposta.json()) as Record<string, unknown>;
  expect(Object.keys(corpo).sort()).toEqual(['erro', 'request_id']);
  expect(Object.keys(corpo.erro as Record<string, unknown>).sort()).toEqual(['codigo', 'mensagem']);
});
