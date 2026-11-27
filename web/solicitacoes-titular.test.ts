// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';
import { FalhaApi } from './api.ts';
import { montarSolicitacoesTitular } from './solicitacoes-titular.tsx';
import type { SolicitacaoTitular } from '../packages/contracts/src/solicitacao-titular.ts';
import type { ServicoSolicitacaoTitular } from './servico-solicitacao-titular-http.ts';

/** Dados fictícios. */
const caso = '10000000-0000-4000-8000-00000000000a';
const outroCaso = '10000000-0000-4000-8000-00000000000b';
const solicitacao = '60000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';

function pedido(parcial: Partial<SolicitacaoTitular> = {}): SolicitacaoTitular {
  return {
    solicitacao_id: solicitacao,
    paciente_id: caso,
    tipo: 'exclusao',
    recebida_em: '2026-11-03T12:00:00.000Z',
    estado: 'recebida',
    medida: null,
    versao: 3,
    registrada_por_usuario_id: usuarioId,
    respondida_por_usuario_id: null,
    respondida_em: null,
    ...parcial,
  } as SolicitacaoTitular;
}

function servicoFalso(parcial: Partial<ServicoSolicitacaoTitular> = {}): ServicoSolicitacaoTitular {
  return {
    listar: vi.fn(async () => ({ itens: [pedido()], proximo_cursor: null })),
    registrar: vi.fn(async () => pedido()),
    responder: vi.fn(async () => pedido({ estado: 'recebida' })),
    ...parcial,
  } as ServicoSolicitacaoTitular;
}

function botao(raiz: HTMLElement, texto: string): HTMLButtonElement {
  const alvo = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!alvo) throw new Error(`Botão ausente: ${texto}`);
  return alvo;
}

const recusa = Object.assign(new FalhaApi('sem_permissao', 403), { codigo: 'sem_permissao' });

describe('solicitações do titular sobre dados pessoais (FR-040)', () => {
  it('quem pode consultar vê os pedidos e registra a resposta com a versão esperada', async () => {
    const raiz = document.createElement('div');
    const responder = vi.fn(async () => pedido());
    const listar = vi
      .fn<ServicoSolicitacaoTitular['listar']>()
      .mockResolvedValueOnce({ itens: [pedido()], proximo_cursor: null })
      .mockResolvedValue({
        itens: [
          pedido({
            estado: 'respondida',
            medida: 'recusada',
            respondida_em: '2026-11-04T12:00:00.000Z',
            respondida_por_usuario_id: usuarioId,
            versao: 4,
          }),
        ],
        proximo_cursor: null,
      });
    montarSolicitacoesTitular(raiz, servicoFalso({ listar, responder }));

    await vi.waitFor(() => expect(raiz.textContent).toContain('Exclusão'));
    expect(raiz.textContent).toContain('Sem resposta registrada');

    const texto = raiz.querySelector<HTMLTextAreaElement>(`#solicitacao-resposta-${solicitacao}`);
    const medida = raiz.querySelector<HTMLSelectElement>(`#solicitacao-medida-${solicitacao}`);
    if (!texto || !medida) throw new Error('Formulário de resposta ausente');
    medida.value = 'recusada';
    texto.value = 'Guarda legal fictícia mantida; nada foi apagado.';
    raiz
      .querySelector('.solicitacoes-titular__resposta')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await vi.waitFor(() => expect(responder).toHaveBeenCalledTimes(1));
    expect(responder).toHaveBeenCalledWith({
      solicitacao_id: solicitacao,
      paciente_id: caso,
      medida: 'recusada',
      resposta: 'Guarda legal fictícia mantida; nada foi apagado.',
      versao_esperada: 3,
    });
    // Respondida deixa de oferecer o formulário e passa a mostrar a medida adotada.
    await vi.waitFor(() => expect(raiz.textContent).toContain('Não atendida em'));
    expect(raiz.querySelector('.solicitacoes-titular__resposta')).toBeNull();
  });

  it('recusa de permissão na leitura não mostra pedido nenhum e diz a causa', async () => {
    const raiz = document.createElement('div');
    montarSolicitacoesTitular(raiz, servicoFalso({ listar: vi.fn().mockRejectedValue(recusa) }));

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain(
        'Sua conta não pode ver as solicitações sobre dados pessoais.',
      ),
    );
    expect(raiz.querySelectorAll('.solicitacoes-titular__item')).toHaveLength(0);
    expect(raiz.textContent).not.toContain('Exclusão');
    expect(raiz.querySelector('.solicitacoes-titular__lista')?.hasAttribute('aria-busy')).toBe(
      false,
    );
  });

  it('recusa de permissão ao responder não finge que a resposta foi registrada', async () => {
    const raiz = document.createElement('div');
    const listar = vi.fn(async () => ({ itens: [pedido()], proximo_cursor: null }));
    montarSolicitacoesTitular(
      raiz,
      servicoFalso({ listar, responder: vi.fn().mockRejectedValue(recusa) }),
    );

    await vi.waitFor(() => expect(raiz.textContent).toContain('Exclusão'));
    const texto = raiz.querySelector<HTMLTextAreaElement>(`#solicitacao-resposta-${solicitacao}`);
    if (!texto) throw new Error('Campo de resposta ausente');
    texto.value = 'Resposta fictícia.';
    raiz
      .querySelector('.solicitacoes-titular__resposta')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Sua conta não pode responder solicitações.'),
    );
    // A lista não foi recarregada: nada mudou, e a tela não sugere que mudou.
    expect(listar).toHaveBeenCalledTimes(1);
    expect(raiz.textContent).toContain('Sem resposta registrada');
    expect(botao(raiz, 'Registrar resposta').disabled).toBe(false);
  });

  it('resposta concorrente é recusada por versão e manda recarregar em vez de sobrescrever', async () => {
    const raiz = document.createElement('div');
    const conflito = Object.assign(new FalhaApi('conflito_versao', 409), {
      codigo: 'conflito_versao',
    });
    montarSolicitacoesTitular(
      raiz,
      servicoFalso({ responder: vi.fn().mockRejectedValue(conflito) }),
    );

    await vi.waitFor(() => expect(raiz.textContent).toContain('Exclusão'));
    const texto = raiz.querySelector<HTMLTextAreaElement>(`#solicitacao-resposta-${solicitacao}`);
    if (!texto) throw new Error('Campo de resposta ausente');
    texto.value = 'Resposta fictícia.';
    raiz
      .querySelector('.solicitacoes-titular__resposta')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain(
        'Alguém respondeu esta solicitação enquanto você escrevia',
      ),
    );
  });

  it('fora de um caso não há como registrar solicitação, só consultar', async () => {
    const raiz = document.createElement('div');
    const registrar = vi.fn(async () => pedido());
    montarSolicitacoesTitular(raiz, servicoFalso({ registrar }));

    await vi.waitFor(() => expect(raiz.textContent).toContain('Exclusão'));
    expect(raiz.querySelector('.solicitacoes-titular__registro')).toBeNull();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('dentro de um caso, o registro vai sempre para esse caso e a recusa é dita', async () => {
    const raiz = document.createElement('div');
    const listar = vi.fn(async () => ({ itens: [], proximo_cursor: null }));
    const registrar = vi.fn().mockRejectedValue(recusa);
    montarSolicitacoesTitular(raiz, servicoFalso({ listar, registrar }), { pacienteId: caso });

    await vi.waitFor(() => expect(listar).toHaveBeenCalledWith({ limite: 25, paciente_id: caso }));
    const descricao = raiz.querySelector<HTMLTextAreaElement>('#solicitacao-descricao');
    if (!descricao) throw new Error('Campo de descrição ausente');
    descricao.value = 'Pedido fictício chegado por e-mail.';
    raiz
      .querySelector('.solicitacoes-titular__registro')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Sua conta não pode registrar solicitações.'),
    );
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ paciente_id: caso, tipo: 'acesso' }),
    );
    // O texto digitado continua no campo: nada foi registrado, nada foi perdido.
    expect(descricao.value).toBe('Pedido fictício chegado por e-mail.');
  });

  it('a listagem do caso não pede nem exibe solicitação de outro caso', async () => {
    const raiz = document.createElement('div');
    const listar = vi.fn(async () => ({
      itens: [pedido({ paciente_id: caso })],
      proximo_cursor: null,
    }));
    const nomeDoPaciente = vi.fn((id: string) =>
      id === outroCaso ? 'Paciente de Outro Caso' : 'Paciente Fictício',
    );
    montarSolicitacoesTitular(raiz, servicoFalso({ listar }), {
      pacienteId: caso,
      nomeDoPaciente,
    });

    await vi.waitFor(() => expect(raiz.textContent).toContain('Exclusão'));
    expect(listar).toHaveBeenCalledWith({ limite: 25, paciente_id: caso });
    expect(listar).not.toHaveBeenCalledWith(expect.objectContaining({ paciente_id: outroCaso }));
    expect(raiz.textContent).not.toContain('Paciente de Outro Caso');
  });

  it('a listagem não traz o texto do pedido nem o da resposta para o navegador', async () => {
    const raiz = document.createElement('div');
    montarSolicitacoesTitular(
      raiz,
      servicoFalso({
        listar: vi.fn(async () => ({
          itens: [
            pedido({
              estado: 'respondida',
              medida: 'atendida',
              respondida_em: '2026-11-05T12:00:00.000Z',
              respondida_por_usuario_id: usuarioId,
            }),
          ],
          proximo_cursor: null,
        })),
      }),
    );

    await vi.waitFor(() => expect(raiz.textContent).toContain('Atendida em'));
    // Identificadores e conteúdo do pedido não aparecem: a listagem é só tipo, data e medida.
    expect(raiz.textContent).not.toContain(solicitacao);
    expect(raiz.textContent).not.toContain(caso);
    expect(raiz.textContent).not.toContain(usuarioId);
  });
});

describe('quem alcança a área de solicitações do titular', () => {
  let desmontarEventos = () => {};
  afterEach(() => {
    desmontarEventos();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.history.replaceState(null, '', '/');
  });

  /** Esconder não é autorizar: o servidor e o banco continuam recusando. Estes casos provam
   * que a interface não oferece a área a quem não é Administrador e que, forçando a rota,
   * nenhuma consulta de solicitação do titular sai do navegador. */
  function preparar(perfil: 'administrador' | 'profissional'): string[] {
    const janela = vi.spyOn(window, 'addEventListener');
    const documento = vi.spyOn(document, 'addEventListener');
    desmontarEventos = () => {
      for (const args of janela.mock.calls) window.removeEventListener(...args);
      for (const args of documento.mock.calls) document.removeEventListener(...args);
      janela.mockRestore();
      documento.mockRestore();
    };
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    window.history.replaceState(null, '', '#carteira');
    sessionStorage.setItem('modo-acesso', 'tecnica');
    sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-tecnica', sessionId);
    const caminhos: string[] = [];
    vi.stubGlobal('fetch', async (entrada: URL | string) => {
      const url = new URL(String(entrada), 'http://localhost');
      caminhos.push(url.pathname);
      if (url.pathname === '/api/sessao')
        return Response.json({
          dados: {
            session_id: sessionId,
            usuario: { id: usuarioId, perfil, ativo: true, versao: 1 },
            capacidades: [],
          },
          request_id: caso,
        });
      if (url.pathname === '/api/admin/solicitacoes-titular')
        return Response.json({
          dados: { itens: [pedido()], proximo_cursor: null },
          request_id: caso,
        });
      return Response.json({ dados: { itens: [], proximo_cursor: null }, request_id: caso });
    });
    return caminhos;
  }

  it('o Administrador abre a área e a consulta acontece', async () => {
    const caminhos = preparar('administrador');
    await montarCascaParaTeste();
    await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
    window.history.pushState(null, '', '#administracao/solicitacoes');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() =>
      expect(document.getElementById('administracao-conteudo')?.textContent).toContain(
        'Solicitações sobre dados pessoais',
      ),
    );
    expect(document.querySelector('a[href="#administracao/solicitacoes"]')).not.toBeNull();
    await vi.waitFor(() => expect(caminhos).toContain('/api/admin/solicitacoes-titular'));
  });

  it('rota forçada do profissional não monta a área nem consulta solicitações', async () => {
    const caminhos = preparar('profissional');
    await montarCascaParaTeste();
    await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
    window.history.pushState(null, '', '#administracao/solicitacoes');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('a[href="#administracao/solicitacoes"]')).toBeNull();
    expect(document.getElementById('administracao-conteudo')?.textContent).not.toContain(
      'Solicitações sobre dados pessoais',
    );
    expect(caminhos).not.toContain('/api/admin/solicitacoes-titular');
  });
});
