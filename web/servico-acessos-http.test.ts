// @vitest-environment jsdom
// PREPARADO, NÃO EXECUTADO. Sem conta real, senha real ou integração Auth.
import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoAcessosHttp, criarServicoConfirmacaoInterna } from './servico-acessos-http.ts';
import { exigeNovoAcesso } from './api.ts';
import { criarErroPublicoSemCampos } from '../packages/contracts/src/erros.ts';
const id = '10000000-0000-4000-8000-000000000001';
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('sessão interna preserva fluxo próprio e rejeita metadados com senha', async () => {
  sessionStorage.setItem('modo-acesso', 'interno');
  sessionStorage.setItem('fluxo-interno', 'a'.repeat(22));
  const buscar = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () =>
      Response.json({
        dados: { itens: [], proximo_cursor: null, senha: 'eco-ficticio-invalido' },
        request_id: id,
      }),
  );
  vi.stubGlobal('fetch', buscar);
  const servico = criarServicoAcessosHttp(() => ({ usuario_id: id, session_id: id }));
  await expect(servico.listar()).rejects.toMatchObject({ codigo: 'servico_indisponivel' });
  expect(buscar.mock.calls[0]?.[1]).toMatchObject({
    headers: { 'x-fluxo': 'a'.repeat(22), 'x-sessao': id },
    credentials: 'same-origin',
  });
  servico.desmontar();
});
it('confirmação OTP não envia cookie ou senha e só aceita resposta genérica', async () => {
  const buscar = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => Response.json({ dados: { recebido: true }, request_id: id }),
  );
  vi.stubGlobal('fetch', buscar);
  const servico = criarServicoConfirmacaoInterna();
  await servico.solicitar('pessoa@example.test');
  await servico.verificar('pessoa@example.test', '000000');
  expect(buscar.mock.calls[1]).toEqual([
    '/api/auth/interno/confirmacao/verificar',
    expect.objectContaining({
      credentials: 'omit',
      body: JSON.stringify({ email: 'pessoa@example.test', codigo: '000000' }),
    }),
  ]);
  expect(JSON.stringify(buscar.mock.calls)).not.toContain('senha');
  servico.desmontar();
});

it.each([401, 403])(
  'continua exigindo novo acesso quando servidor recusa autenticação/permissão HTTP %s',
  async (status) => {
    sessionStorage.setItem('modo-acesso', 'interno');
    sessionStorage.setItem('fluxo-interno', 'a'.repeat(22));
    vi.stubGlobal('fetch', async () =>
      Response.json(
        criarErroPublicoSemCampos(status === 401 ? 'nao_autenticado' : 'sem_permissao', id),
        { status },
      ),
    );
    const servico = criarServicoAcessosHttp(() => ({ usuario_id: id, session_id: id }));
    const erro: unknown = await servico
      .criar(
        {
          operacao_id: id,
          nome: 'Pessoa fictícia',
          email: 'pessoa@example.test',
          funcao: 'familia',
          metodo: 'interno',
          senha: 'senha-ficticia-sem-valor',
          motivo: 'Teste fictício',
        },
        id,
      )
      .catch((falha: unknown) => falha);
    expect(exigeNovoAcesso(erro)).toBe(true);
    servico.desmontar();
  },
);
