import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import toml from '@iarna/toml';
import {
  criarCodecDeCookiesSessaoIsolada,
  verificarProtecaoDeComando,
} from '../../../supabase/functions/_shared/sessao/nucleo.ts';
import {
  cabecalhosApiDeclarados,
  criarEncaminhamentoApi,
  type RotaEncaminhada,
} from './encaminhamento-api.ts';

const cabecalhosDaRota = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Mesma resposta nos dois destinos: é o que torna o encaminhamento observável como igual. */
function respostaDeDominio(origem: 'netlify' | 'edge') {
  return Response.json(
    { dados: { ficticio: true }, request_id: '22222222-2222-4222-8222-222222222222' },
    { headers: { ...cabecalhosDaRota, 'x-origem-ficticia': origem } },
  );
}

function montar(tabela: readonly RotaEncaminhada[], aoChegarNaEdge?: (pedido: Request) => void) {
  const chamadasNetlify: string[] = [];
  return {
    chamadasNetlify,
    encaminhamento: criarEncaminhamentoApi({
      tabela,
      baseEdge: 'https://projeto-ficticio.functions.supabase.co',
      cabecalhosDeInvocacao: { authorization: 'Bearer valor-ficticio-de-teste' },
      atenderNaNetlify: (request) => {
        chamadasNetlify.push(new URL(request.url).pathname);
        return Promise.resolve(respostaDeDominio('netlify'));
      },
      buscar: ((pedido: Request) => {
        aoChegarNaEdge?.(pedido);
        return Promise.resolve(respostaDeDominio('edge'));
      }) as unknown as typeof fetch,
    }),
  };
}

const tabelaBase: readonly RotaEncaminhada[] = [
  {
    padrao: '/api/admin/configuracao-sistema',
    funcao: 'configuracao-sistema',
    destino: 'netlify',
  },
  { padrao: '/api/pacientes/:paciente_id/plano', funcao: 'plano', destino: 'edge' },
];

const paciente = '0ac9c3bc-9f3e-4bd6-9b6f-5c1b1a1f1a11';

it('encaminha um caminho para cada destino com a mesma resposta e sem alterar o cliente', async () => {
  let urlNaEdge = '';
  const { encaminhamento, chamadasNetlify } = montar(tabelaBase, (pedido) => {
    urlNaEdge = pedido.url;
  });

  // O cliente chama `/api/*` na mesma origem nos dois casos.
  const paraNetlify = await encaminhamento.atender(
    new Request('https://app.invalid/api/admin/configuracao-sistema'),
  );
  const paraEdge = await encaminhamento.atender(
    new Request(`https://app.invalid/api/pacientes/${paciente}/plano`),
  );

  expect(chamadasNetlify).toEqual(['/api/admin/configuracao-sistema']);
  expect(urlNaEdge).toBe(
    `https://projeto-ficticio.functions.supabase.co/functions/v1/plano/api/pacientes/${paciente}/plano`,
  );
  expect(paraEdge.status).toBe(paraNetlify.status);
  const [corpoEdge, corpoNetlify] = await Promise.all([paraEdge.text(), paraNetlify.text()]);
  expect(corpoEdge).toBe(corpoNetlify);
});

it('preserva os cabeçalhos de /api/* declarados em netlify.toml e a mesma origem', async () => {
  const configuracao = toml.parse(
    readFileSync(new URL('../../../netlify.toml', import.meta.url), 'utf8'),
  ) as { headers: Array<{ for: string; values: Record<string, string> }> };
  const api = configuracao.headers.find((bloco) => bloco.for === '/api/*');
  expect(api?.values).toEqual(cabecalhosApiDeclarados);

  // O proxy não emite nem substitui esses cabeçalhos: a resposta atravessa inteira, e a
  // Netlify continua aplicando o bloco de `/api/*` sobre ela.
  const { encaminhamento } = montar(tabelaBase);
  const antes = respostaDeDominio('netlify');
  const depois = await encaminhamento.atender(
    new Request(`https://app.invalid/api/pacientes/${paciente}/plano`),
  );
  const retrato = (resposta: Response) => {
    const lista: string[] = [];
    resposta.headers.forEach((valor, nome) => {
      if (nome.toLowerCase() !== 'x-origem-ficticia') lista.push(`${nome.toLowerCase()}: ${valor}`);
    });
    return lista.sort();
  };
  expect(retrato(depois)).toEqual(retrato(antes));
});

it('reverter um caminho é trocar a linha da tabela, sem tocar no cliente', async () => {
  const revertida: readonly RotaEncaminhada[] = tabelaBase.map((rota) =>
    rota.padrao === '/api/pacientes/:paciente_id/plano' ? { ...rota, destino: 'netlify' } : rota,
  );
  let chegouNaEdge = false;
  const { encaminhamento, chamadasNetlify } = montar(revertida, () => {
    chegouNaEdge = true;
  });
  const resposta = await encaminhamento.atender(
    // Exatamente a mesma chamada do cliente de antes.
    new Request(`https://app.invalid/api/pacientes/${paciente}/plano`),
  );
  expect(chegouNaEdge).toBe(false);
  expect(chamadasNetlify).toEqual([`/api/pacientes/${paciente}/plano`]);
  expect(resposta.headers.get('x-origem-ficticia')).toBe('netlify');
  expect(encaminhamento.destinoDe(`/api/pacientes/${paciente}/plano`)).toBe('netlify');
});

it('caminho fora da tabela continua respondido pela Netlify, como hoje', async () => {
  const { encaminhamento, chamadasNetlify } = montar(tabelaBase);
  await encaminhamento.atender(new Request('https://app.invalid/api/caminho-inexistente'));
  expect(chamadasNetlify).toEqual(['/api/caminho-inexistente']);
  expect(encaminhamento.destinoDe('/api/caminho-inexistente')).toBeNull();
});

it('o cookie selado e o x-sessao atravessam o proxy e são lidos pela mesma cadeia', async () => {
  const chaveDeSelagem = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const seletor = '33333333-3333-4333-8333-333333333333';
  const codec = criarCodecDeCookiesSessaoIsolada({ chaveDeSelagem, transporte: 'https' }, seletor);
  const csrf = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const setCookieCsrf = await codec.selarCsrf(csrf);
  const setCookieSessao = await codec.selarSessao('44444444-4444-4444-8444-444444444444');
  const cookie = `${setCookieSessao.split(';')[0]}; ${setCookieCsrf.split(';')[0]}`;
  const sessao = '55555555-5555-4555-8555-555555555555';

  const tabela: readonly RotaEncaminhada[] = [
    { padrao: '/api/sessao/renovar', funcao: 'auth', destino: 'edge' },
  ];
  let recebido: Request | undefined;
  const { encaminhamento } = montar(tabela, (pedido) => {
    recebido = pedido;
  });

  const pedir = (cabecalhoCsrf: string, cabecalhoCookie: string, origem: string) =>
    encaminhamento.atender(
      new Request('https://app.invalid/api/sessao/renovar', {
        method: 'POST',
        headers: {
          cookie: cabecalhoCookie,
          'x-sessao': sessao,
          'x-csrf': cabecalhoCsrf,
          origin: origem,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );

  // Positivo: o que a Edge Function recebe é byte a byte o que o cliente enviou.
  await pedir(csrf, cookie, 'https://app.invalid');
  expect(recebido?.headers.get('cookie')).toBe(cookie);
  expect(recebido?.headers.get('x-sessao')).toBe(sessao);
  expect(recebido?.headers.get('x-csrf')).toBe(csrf);
  expect(recebido?.headers.get('origin')).toBe('https://app.invalid');
  await expect(
    verificarProtecaoDeComando({
      origem: recebido?.headers.get('origin') ?? null,
      csrfCabecalho: recebido?.headers.get('x-csrf') ?? null,
      cookieCsrf: recebido?.headers.get('cookie') ?? null,
      origensPermitidas: ['https://app.invalid'],
      codec,
    }),
  ).resolves.toBe(true);

  // Negativo: cookie adulterado, CSRF trocado e origem estranha continuam recusados do
  // outro lado do proxy — o proxy não conserta e não afrouxa nada.
  const parCsrf = (setCookieCsrf.split(';')[0] ?? '').trim();
  const corte = parCsrf.indexOf('=');
  const valorCsrfSelado = parCsrf.slice(corte + 1);
  // O último caractere base64url carrega bits não usados: trocar só ele pode decodificar
  // para os mesmos bytes. A adulteração precisa atingir bytes de fato selados.
  const valorAdulterado = `${valorCsrfSelado[0] === 'A' ? 'B' : 'A'}${valorCsrfSelado.slice(1)}`;
  const adulterado = `${(setCookieSessao.split(';')[0] ?? '').trim()}; ${parCsrf.slice(0, corte)}=${valorAdulterado}`;
  await pedir(csrf, adulterado, 'https://app.invalid');
  await expect(
    verificarProtecaoDeComando({
      origem: recebido?.headers.get('origin') ?? null,
      csrfCabecalho: recebido?.headers.get('x-csrf') ?? null,
      cookieCsrf: recebido?.headers.get('cookie') ?? null,
      origensPermitidas: ['https://app.invalid'],
      codec,
    }),
  ).resolves.toBe(false);

  await pedir(csrf, cookie, 'https://atacante.invalid');
  await expect(
    verificarProtecaoDeComando({
      origem: recebido?.headers.get('origin') ?? null,
      csrfCabecalho: recebido?.headers.get('x-csrf') ?? null,
      cookieCsrf: recebido?.headers.get('cookie') ?? null,
      origensPermitidas: ['https://app.invalid'],
      codec,
    }),
  ).resolves.toBe(false);
});

it('não deixa o cliente escolher a credencial de invocação da Edge Function', async () => {
  let recebido: Request | undefined;
  const { encaminhamento } = montar(tabelaBase, (pedido) => {
    recebido = pedido;
  });
  await encaminhamento.atender(
    new Request(`https://app.invalid/api/pacientes/${paciente}/plano`, {
      headers: { authorization: 'Bearer injetado-pelo-cliente', apikey: 'injetada' },
    }),
  );
  expect(recebido?.headers.get('authorization')).toBe('Bearer valor-ficticio-de-teste');
  expect(recebido?.headers.get('apikey')).toBeNull();
});
