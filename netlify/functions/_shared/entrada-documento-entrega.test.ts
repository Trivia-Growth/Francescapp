import { beforeEach, expect, it, vi } from 'vitest';
import { criarEntradaDocumentoCasoNativa } from './entrada-documento-caso-nativa.ts';
import { comporDocumentoCasoNativo } from './compor-documento-caso-nativo.ts';

vi.mock('./compor-documento-caso-nativo.ts', () => ({ comporDocumentoCasoNativo: vi.fn() }));
const compor = vi.mocked(comporDocumentoCasoNativo);
const paciente = 'c0000000-0000-4000-8000-000000000003';
const documento = 'd0000000-0000-4000-8000-000000000004';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const requestId = 'a0000000-0000-4000-8000-000000000001';
const entrada = criarEntradaDocumentoCasoNativa(
  {} as Parameters<typeof criarEntradaDocumentoCasoNativa>[0],
);
const pedido = (extra = '', method = 'GET') =>
  new Request(
    `https://exemplo.test/api/pacientes/${paciente}/documentos/${documento}/arquivo${extra}`,
    { method, headers: { 'x-sessao': sessao } },
  );
beforeEach(() => compor.mockReset());

it('entrega attachment binário sem refletir nome ativo em header', async () => {
  compor.mockResolvedValue({
    ok: true,
    request_id: requestId,
    dados: {
      arquivo: {
        bytes: new Uint8Array(new ArrayBuffer(3)).fill(1),
        nome: 'laudo"\r\n<script>.html',
      },
    },
  });
  const resposta = await entrada.atender(pedido());
  expect(resposta.status).toBe(200);
  expect(resposta.headers.get('Content-Type')).toBe('application/octet-stream');
  expect(resposta.headers.get('Content-Disposition')).toMatch(
    /^attachment; filename="documento"; filename\*=UTF-8''/,
  );
  expect(resposta.headers.get('Content-Disposition')).not.toContain('<script>');
  expect(resposta.headers.get('Content-Disposition')).not.toContain('\r');
  expect(resposta.headers.get('Cache-Control')).toBe('private, no-store');
  expect(resposta.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect([...new Uint8Array(await resposta.arrayBuffer())]).toEqual([1, 1, 1]);
  expect(compor.mock.calls[0]?.[1]).toEqual({
    operacao: 'entregar',
    paciente_id: paciente,
    documento_id: documento,
  });
});

it('negação conserva envelope público e não emite bytes', async () => {
  compor.mockResolvedValue({ ok: false, request_id: requestId, erro: { codigo: 'sem_permissao' } });
  const resposta = await entrada.atender(pedido());
  expect(resposta.status).toBe(403);
  expect(resposta.headers.get('Content-Disposition')).toBeNull();
  expect(await resposta.json()).toMatchObject({ erro: { codigo: 'sem_permissao' } });
});

it('recusa query e mutação na rota de entrega antes da composição', async () => {
  expect((await entrada.atender(pedido('?drive_file_id=alheio'))).status).toBe(400);
  expect((await entrada.atender(pedido('', 'POST'))).status).toBe(404);
  expect(compor).not.toHaveBeenCalled();
});
