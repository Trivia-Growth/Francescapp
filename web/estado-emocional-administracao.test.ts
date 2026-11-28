// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { criarTelaEstadoEmocional } from './estado-emocional-administracao.js';
import { ClienteFFCM, FalhaApi } from './api.ts';
import { chaveDaSessao, clienteConsultas, esquecerConsultas } from './consultas.js';

function montarEstadoEmocionalAdministracao(
  raiz: HTMLElement,
  ...args: Parameters<typeof criarTelaEstadoEmocional>
) {
  return render(criarTelaEstadoEmocional(...args), { container: raiz }).unmount;
}

/* Primeira prova desta tela (25/11/2026, migração para React). O vocabulário de estado
 * emocional observado é administrado só pelo Administrador. As duas pontas da autorização
 * precisam estar cobertas: quem pode administra, e quem não pode não vê nem grava.
 *
 * 27/11/2026, piloto do cache de leituras (`web/consultas.ts`): a volta à tela não relê,
 * e nenhuma leitura sobrevive à identidade que a fez — revogação, saída, troca de conta
 * e resposta atrasada da conta anterior. O cache é um módulo único, então cada teste
 * começa com ele vazio. */

const estadoId = 'c0000000-0000-4000-8000-000000000001';
const contaA = {
  usuario_id: 'a0000000-0000-4000-8000-00000000000a',
  session_id: 'a1000000-0000-4000-8000-00000000000a',
};
const contaB = {
  usuario_id: 'b0000000-0000-4000-8000-00000000000b',
  session_id: 'b1000000-0000-4000-8000-00000000000b',
};

function termo(estado = 'tranquilo fictício') {
  return { estado_id: estadoId, estado, ativo: true, de_fabrica: false, versao: 2 };
}

function servicoDe(identidade = contaA, consultar = vi.fn().mockResolvedValue([termo()])) {
  return { identidade, consultar, gravar: vi.fn().mockResolvedValue(undefined) };
}

function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

function botao(raiz: HTMLElement, texto: string) {
  const achado = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!achado) throw new Error(`Botão ausente: ${texto}`);
  return achado;
}

beforeEach(() => esquecerConsultas());
afterEach(() => vi.unstubAllGlobals());

it('positivo: quem administra desativa um termo sob a versão lida', async () => {
  const raiz = document.createElement('div');
  const servico = servicoDe();
  const perdido = vi.fn();
  const desmontar = montarEstadoEmocionalAdministracao(raiz, servico, perdido);
  try {
    await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo de termos atualizado'));
    botao(raiz, 'Desativar termo').click();
    await vi.waitFor(() =>
      expect(servico.gravar).toHaveBeenCalledWith(
        { estado_id: estadoId, estado: 'tranquilo fictício', ativo: false, versao_esperada: 2 },
        expect.any(String),
      ),
    );
    expect(perdido).not.toHaveBeenCalled();
  } finally {
    desmontar();
  }
});

it('negativo: recusa de permissão esvazia a tela e devolve o acesso perdido', async () => {
  const raiz = document.createElement('div');
  const servico = servicoDe(contaA, vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)));
  const perdido = vi.fn();
  montarEstadoEmocionalAdministracao(raiz, servico, perdido);
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
  expect(raiz.textContent).toBe('');
  expect(servico.gravar).not.toHaveBeenCalled();
});

it('cinco voltas à tela fazem um GET só, e a lista volta desenhada no primeiro quadro', async () => {
  const servico = servicoDe();
  for (let volta = 0; volta < 5; volta += 1) {
    const raiz = document.createElement('div');
    const desmontar = montarEstadoEmocionalAdministracao(raiz, servico, vi.fn());
    if (volta === 0) {
      await vi.waitFor(() => expect(raiz.textContent).toContain('tranquilo fictício'));
    } else {
      // Síncrono: nenhuma espera entre montar e conferir. Sem esqueleto ocupado.
      expect(raiz.textContent).toContain('tranquilo fictício');
      expect(raiz.querySelector('[aria-busy="true"]')).toBeNull();
    }
    desmontar();
  }
  expect(servico.consultar).toHaveBeenCalledOnce();
});

it('sair e voltar antes da resposta não dispara um segundo GET', async () => {
  const resposta = adiada<ReturnType<typeof termo>[]>();
  const servico = servicoDe(contaA, vi.fn().mockReturnValue(resposta.promessa));
  montarEstadoEmocionalAdministracao(document.createElement('div'), servico, vi.fn())();
  const raiz = document.createElement('div');
  const desmontar = montarEstadoEmocionalAdministracao(raiz, servico, vi.fn());
  resposta.resolver([termo()]);
  await vi.waitFor(() => expect(raiz.textContent).toContain('tranquilo fictício'));
  expect(servico.consultar).toHaveBeenCalledOnce();
  desmontar();
});

it('Atualizar fica desabilitado durante a consulta e relê ao fim dela', async () => {
  const resposta = adiada<ReturnType<typeof termo>[]>();
  const consultar = vi.fn().mockResolvedValueOnce([termo()]).mockReturnValueOnce(resposta.promessa);
  const raiz = document.createElement('div');
  const desmontar = montarEstadoEmocionalAdministracao(raiz, servicoDe(contaA, consultar), vi.fn());
  try {
    const atualizar = botao(raiz, 'Atualizar catálogo de termos');
    await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo de termos atualizado'));
    expect(atualizar.getAttribute('aria-disabled')).toBe('false');
    atualizar.click();
    await vi.waitFor(() => expect(atualizar.getAttribute('aria-disabled')).toBe('true'));
    atualizar.click();
    atualizar.click();
    expect(consultar).toHaveBeenCalledTimes(2);
    resposta.resolver([termo('agitado fictício')]);
    await vi.waitFor(() => expect(raiz.textContent).toContain('agitado fictício'));
    expect(atualizar.getAttribute('aria-disabled')).toBe('false');
  } finally {
    desmontar();
  }
});

it('revogação: a sessão descartada pela API zera o cache e a volta relê', async () => {
  const servico = servicoDe();
  const raiz = document.createElement('div');
  montarEstadoEmocionalAdministracao(raiz, servico, vi.fn())();
  await vi.waitFor(() => expect(servico.consultar).toHaveBeenCalledOnce());
  await vi.waitFor(() =>
    expect(
      clienteConsultas.getQueryData(chaveDaSessao(contaA, 'admin', 'estado-emocional')),
    ).toBeDefined(),
  );
  // `mostrarAcesso` (401, revalidação recusada) e o fim de `sair` passam por aqui.
  new ClienteFFCM().limpar();
  expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(0);
  const volta = document.createElement('div');
  const desmontar = montarEstadoEmocionalAdministracao(volta, servico, vi.fn());
  expect(volta.textContent).not.toContain('tranquilo fictício');
  await vi.waitFor(() => expect(servico.consultar).toHaveBeenCalledTimes(2));
  desmontar();
});

it('revogação na própria tela: 403 ao atualizar descarta a leitura guardada', async () => {
  const consultar = vi
    .fn()
    .mockResolvedValueOnce([termo()])
    .mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
  const servico = servicoDe(contaA, consultar);
  const raiz = document.createElement('div');
  const perdido = vi.fn();
  montarEstadoEmocionalAdministracao(raiz, servico, perdido);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Catálogo de termos atualizado'));
  botao(raiz, 'Atualizar catálogo de termos').click();
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  const volta = document.createElement('div');
  montarEstadoEmocionalAdministracao(volta, servico, vi.fn());
  expect(volta.textContent).not.toContain('tranquilo fictício');
});

it('saída: o cache é apagado já no início, antes de o servidor confirmar', async () => {
  const servico = servicoDe();
  montarEstadoEmocionalAdministracao(document.createElement('div'), servico, vi.fn())();
  await vi.waitFor(() =>
    expect(clienteConsultas.getQueryCache().getAll()[0]?.state.data).toBeDefined(),
  );

  const encerramento = adiada<Response>();
  const envelope = (dados: unknown) => Response.json({ dados, request_id: contaA.usuario_id });
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.pathname === '/api/sessao')
      return envelope({
        session_id: contaA.session_id,
        usuario: { id: contaA.usuario_id, perfil: 'administrador', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (url.pathname === '/api/sessao/sair') return encerramento.promessa;
    throw new Error('Rota inesperada na fixture.');
  });
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', contaA.session_id);
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  const api = new ClienteFFCM();
  await api.consultarSessao();
  // A sessão foi aberta (o que chama `limpar`); a leitura volta a ser guardada.
  montarEstadoEmocionalAdministracao(document.createElement('div'), servico, vi.fn())();
  await vi.waitFor(() => expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(1));

  const saida = api.sair();
  expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(0);
  encerramento.resolver(envelope({ encerrada_localmente: true, pendencia_externa: false }));
  await saida;
  sessionStorage.clear();
});

it('troca de conta: a conta nova não encontra nada da anterior', async () => {
  const servicoA = servicoDe(contaA, vi.fn().mockResolvedValue([termo('da conta A')]));
  montarEstadoEmocionalAdministracao(document.createElement('div'), servicoA, vi.fn())();
  await vi.waitFor(() => expect(servicoA.consultar).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(clienteConsultas.getQueryCache().getAll()).toHaveLength(1));

  const servicoB = servicoDe(contaB, vi.fn().mockResolvedValue([termo('da conta B')]));
  const raiz = document.createElement('div');
  const desmontar = montarEstadoEmocionalAdministracao(raiz, servicoB, vi.fn());
  // Nem a entrada da conta A continua guardada: só a consulta da conta B, recém-aberta.
  expect(
    clienteConsultas
      .getQueryCache()
      .getAll()
      .map((consulta) => consulta.queryKey),
  ).toEqual([['sessao', contaB.usuario_id, contaB.session_id, 'admin', 'estado-emocional']]);
  expect(raiz.textContent).not.toContain('da conta A');
  await vi.waitFor(() => expect(raiz.textContent).toContain('da conta B'));
  desmontar();
});

it('resposta atrasada da conta anterior é descartada', async () => {
  const atrasada = adiada<ReturnType<typeof termo>[]>();
  const servicoA = servicoDe(contaA, vi.fn().mockReturnValue(atrasada.promessa));
  montarEstadoEmocionalAdministracao(document.createElement('div'), servicoA, vi.fn())();

  const servicoB = servicoDe(contaB, vi.fn().mockResolvedValue([termo('da conta B')]));
  const raiz = document.createElement('div');
  const desmontar = montarEstadoEmocionalAdministracao(raiz, servicoB, vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('da conta B'));

  atrasada.resolver([termo('da conta A')]);
  await new Promise((r) => setTimeout(r, 0));
  expect(raiz.textContent).not.toContain('da conta A');
  const chaves = clienteConsultas
    .getQueryCache()
    .getAll()
    .map((consulta) => consulta.queryKey);
  expect(chaves).toEqual([
    ['sessao', contaB.usuario_id, contaB.session_id, 'admin', 'estado-emocional'],
  ]);
  desmontar();

  const volta = document.createElement('div');
  const desmontarVolta = montarEstadoEmocionalAdministracao(volta, servicoB, vi.fn());
  expect(volta.textContent).toContain('da conta B');
  expect(volta.textContent).not.toContain('da conta A');
  desmontarVolta();
});
