import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarPortaDrive, TAMANHO_MAXIMO_DOCUMENTO } from './google-drive.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('obtém bytes pelo endereço fixo sem seguir redirecionamento', async () => {
  const { porta, fetch } = preparar({});
  fetch
    .mockReset()
    .mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
  expect(await porta.obter?.('arquivo/ficticio')).toEqual(new Uint8Array([1, 2, 3]));
  expect(fetch.mock.calls[1]?.[0]).toBe(
    'https://www.googleapis.com/drive/v3/files/arquivo%2Fficticio?alt=media&supportsAllDrives=true',
  );
  expect(fetch.mock.calls[1]?.[1].redirect).toBe('error');
});

it('interrompe stream acima do teto mesmo com Content-Length falso', async () => {
  const { porta, fetch } = preparar({});
  const cancelar = vi.fn();
  let partes = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controle) {
      partes += 1;
      controle.enqueue(new Uint8Array(TAMANHO_MAXIMO_DOCUMENTO / 2));
    },
    cancel: cancelar,
  });
  fetch
    .mockReset()
    .mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
    .mockResolvedValueOnce(new Response(stream, { headers: { 'Content-Length': '1' } }));
  await expect(porta.obter?.('arquivo-ficticio')).rejects.toThrow(
    'Guarda de documentos indisponível.',
  );
  expect(cancelar).toHaveBeenCalled();
  expect(partes).toBeLessThanOrEqual(4);
});
function preparar(permissoes: unknown) {
  // Material deliberadamente inválido; criptografia simulada, nenhuma credencial criada.
  vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
  vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new ArrayBuffer(1));
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
    .mockResolvedValueOnce(Response.json(permissoes));
  vi.stubGlobal('fetch', fetch);
  const porta = criarPortaDrive(
    JSON.stringify({
      client_email: 'ficticio@example.test',
      private_key: '-----BEGIN PRIVATE KEY-----YQ==-----END PRIVATE KEY-----',
    }),
    new AbortController().signal,
  );
  return { porta, fetch };
}
describe('FR-031 conferência somente leitura', () => {
  it('sinaliza público mesmo para audiência familiar e nunca escreve permissões', async () => {
    const { porta, fetch } = preparar({ permissions: [{ type: 'anyone' }] });
    expect(await porta.consultarCompartilhamento?.('arquivo-ficticio', 'equipe_e_familia')).toBe(
      'divergente',
    );
    const [url, pedido] = fetch.mock.calls[1] ?? [];
    expect(String(url)).toContain('/permissions?');
    expect(pedido.method).toBe('GET');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('domínio não equivale à equipe vinculada', async () => {
    const { porta } = preparar({ permissions: [{ type: 'domain' }] });
    expect(await porta.consultarCompartilhamento?.('arquivo-ficticio', 'equipe')).toBe(
      'divergente',
    );
  });
  it('não presume vínculo de destinatário nominal', async () => {
    const { porta } = preparar({ permissions: [{ type: 'user' }] });
    expect(await porta.consultarCompartilhamento?.('arquivo-ficticio', 'equipe')).toBe(
      'revisao_necessaria',
    );
  });
  it('percorre páginas antes de avaliar compartilhamento', async () => {
    const { porta, fetch } = preparar({
      permissions: [{ type: 'user' }],
      nextPageToken: 'pagina-ficticia',
    });
    fetch.mockResolvedValueOnce(Response.json({ permissions: [{ type: 'anyone' }] }));
    expect(await porta.consultarCompartilhamento?.('arquivo-ficticio', 'equipe')).toBe(
      'divergente',
    );
    expect(String(fetch.mock.calls[2]?.[0])).toContain('pageToken=pagina-ficticia');
  });
  it('erro não aprova compartilhamento', async () => {
    const { porta } = preparar({ permissions: 'invalido' });
    await expect(porta.consultarCompartilhamento?.('arquivo-ficticio', 'equipe')).rejects.toThrow(
      'Guarda de documentos indisponível.',
    );
  });
});

it.each(['existente', 'nova', 'concorrente'])(
  'usa reserva distribuída e confere pasta %s por ID, marker e parent',
  async (estado) => {
    const { porta, fetch } = preparar({});
    const chave = 'p'.repeat(43);
    const pasta = {
      id: 'pasta-reservada',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['raiz-ficticia'],
      appProperties: { ffcm_paciente: chave },
      trashed: false,
    };
    const reservarPasta = vi.fn(async () => ({ id: 'pasta-reservada', marcador: chave }));
    fetch
      .mockReset()
      .mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
      .mockResolvedValueOnce(Response.json({ ids: ['candidata-ficticia'] }));
    if (estado === 'existente') fetch.mockResolvedValueOnce(Response.json(pasta));
    else
      fetch
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(
          estado === 'concorrente'
            ? new Response(null, { status: 409 })
            : Response.json({ id: pasta.id }),
        )
        .mockResolvedValueOnce(Response.json(pasta));
    fetch.mockResolvedValueOnce(Response.json({ id: 'arquivo-novo-ficticio' }));
    await expect(
      porta.enviar({
        nome: 'identificador-opaco',
        tipo: 'application/pdf',
        bytes: new Uint8Array([1]),
        pastaRaiz: 'raiz-ficticia',
        pastaPaciente: chave,
        reservarPasta,
      }),
    ).resolves.toEqual({ file_id: 'arquivo-novo-ficticio' });
    expect(reservarPasta).toHaveBeenCalledWith('raiz-ficticia', 'candidata-ficticia');
    const upload = fetch.mock.calls.at(-1);
    expect(new TextDecoder().decode(upload?.[1].body as Uint8Array)).toContain(
      '"parents":["pasta-reservada"]',
    );
    const criacao = fetch.mock.calls.find(
      (call) =>
        typeof call[1].body === 'string' &&
        call[1].body.includes('application/vnd.google-apps.folder'),
    );
    if (estado !== 'existente')
      expect(JSON.parse(criacao?.[1].body as string)).toMatchObject({
        id: 'pasta-reservada',
        name: `caso-${chave}`,
        parents: ['raiz-ficticia'],
      });
    expect(
      fetch.mock.calls.some((call) => ['PATCH', 'DELETE'].includes(call[1].method ?? 'GET')),
    ).toBe(false);
    expect(fetch.mock.calls.some((call) => String(call[0]).includes('q='))).toBe(false);
  },
);
it.each(['parent', 'marcador', 'tipo', 'lixeira'])(
  'não adota pasta reservada incompatível: %s',
  async (divergencia) => {
    const { porta, fetch } = preparar({});
    const chave = 'p'.repeat(43);
    const pasta = {
      id: 'pasta-reservada',
      mimeType: divergencia === 'tipo' ? 'application/pdf' : 'application/vnd.google-apps.folder',
      parents: [divergencia === 'parent' ? 'raiz-alheia' : 'raiz'],
      appProperties: { ffcm_paciente: divergencia === 'marcador' ? 'outro-caso' : chave },
      trashed: divergencia === 'lixeira',
    };
    fetch
      .mockReset()
      .mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
      .mockResolvedValueOnce(Response.json({ ids: ['candidata'] }))
      .mockResolvedValueOnce(Response.json(pasta));
    await expect(
      porta.enviar({
        nome: 'opaco',
        tipo: 'application/pdf',
        bytes: new Uint8Array([1]),
        pastaRaiz: 'raiz',
        pastaPaciente: chave,
        reservarPasta: async () => ({ id: 'pasta-reservada', marcador: chave }),
      }),
    ).rejects.toThrow('Guarda de documentos indisponível.');
    expect(fetch).toHaveBeenCalledTimes(3);
  },
);
it('timeout ao criar pasta é recuperável usando mesma reserva, sem segundo create', async () => {
  const { porta, fetch } = preparar({});
  const chave = 'p'.repeat(43);
  const entrada = {
    nome: 'opaco',
    tipo: 'application/pdf',
    bytes: new Uint8Array([1]),
    pastaRaiz: 'raiz',
    pastaPaciente: chave,
    reservarPasta: async () => ({ id: 'pasta-reservada', marcador: chave }),
  };
  fetch
    .mockReset()
    .mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
    .mockResolvedValueOnce(Response.json({ ids: ['candidata-1'] }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockRejectedValueOnce(new Error('create confirmado, resposta perdida'));
  await expect(porta.enviar(entrada)).rejects.toThrow();
  fetch
    .mockResolvedValueOnce(Response.json({ access_token: 'ficticio' }))
    .mockResolvedValueOnce(Response.json({ ids: ['candidata-2'] }))
    .mockResolvedValueOnce(
      Response.json({
        id: 'pasta-reservada',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['raiz'],
        appProperties: { ffcm_paciente: chave },
        trashed: false,
      }),
    )
    .mockResolvedValueOnce(Response.json({ id: 'arquivo-novo' }));
  await expect(porta.enviar(entrada)).resolves.toEqual({ file_id: 'arquivo-novo' });
  expect(
    fetch.mock.calls.filter(
      (call) =>
        typeof call[1].body === 'string' &&
        call[1].body.includes('application/vnd.google-apps.folder'),
    ),
  ).toHaveLength(1);
});
