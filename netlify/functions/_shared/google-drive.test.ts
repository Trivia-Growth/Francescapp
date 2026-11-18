import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarPortaDrive } from './google-drive.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
