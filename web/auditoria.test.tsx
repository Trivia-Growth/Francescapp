// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fireEvent } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FalhaApi } from './api.ts';
import { montarAuditoria } from './auditoria.tsx';
import type { EventoAuditoria } from '../packages/contracts/src/auditoria.ts';
import type { FiltrosAuditoria, ServicoAuditoria } from './servico-auditoria-http.ts';

/** Dados fictícios. */
const caso = '10000000-0000-4000-8000-00000000000a';
const outroCaso = '10000000-0000-4000-8000-00000000000b';
const eventoId = '70000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';

function evento(parcial: Partial<EventoAuditoria> = {}): EventoAuditoria {
  return {
    id: eventoId,
    instante: '2026-11-03T15:30:00.000Z',
    ator_usuario_id: usuarioId,
    ator_auth_id: null,
    operador_restrito: null,
    acao: 'api.consultar_auditoria',
    tipo_objeto: 'auditoria',
    objeto_id: eventoId,
    paciente_id: caso,
    resultado: 'permitido',
    ...parcial,
  } as EventoAuditoria;
}

function servicoFalso(
  consultar: ServicoAuditoria['consultar'] = vi.fn(async () => ({
    itens: [evento()],
    proximo_cursor: null,
  })),
): ServicoAuditoria {
  return { consultar } as ServicoAuditoria;
}

function botao(raiz: HTMLElement, texto: string): HTMLButtonElement {
  const alvo = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!alvo) throw new Error(`Botão ausente: ${texto}`);
  return alvo;
}

/** O formulário de filtros é único na tela: basta o elemento, sem depender de classe. */
function enviarFiltros(raiz: HTMLElement) {
  const formulario = raiz.querySelector('form');
  if (!formulario) throw new Error('Formulário de filtros ausente');
  fireEvent.submit(formulario);
}

/* REESCRITO na migração para React (VIS-018 manda nomear).
 *
 * A versão imperativa desenhava `<table>`/`<tbody>`/`<tr>`/`<td>`, e os testes antigos liam
 * a trilha por essa forma de nó. A migração troca a tabela por `Lista` (registro é LINHA,
 * não cartão — VIS-016), que é `<ul aria-label="…">` com um `<li>` por evento e um `<span>`
 * por coluna. O comportamento observado — quantos registros aparecem, o texto de cada
 * coluna, a ordem — é o mesmo; só a forma do nó mudou, e os auxiliares abaixo passaram a
 * seguir essa forma em vez da tabela. */
function linhas(raiz: HTMLElement): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>('ul[aria-label="Registros de auditoria"] > li')];
}

/** As colunas de uma linha, na ordem em que a tela declara (Quando, Quem, Operação, Objeto,
 *  Resultado). `div > span` pega só o span de cada coluna — o span aninhado do título da
 *  operação e o da marca de resultado têm `span` como pai, não `div`, e ficam de fora. */
function colunasDaLinha(linha: HTMLElement): string[] {
  return [...linha.querySelectorAll('div > span')].map((celula) => celula.textContent ?? '');
}

const recusa = Object.assign(new FalhaApi('sem_permissao', 403), { codigo: 'sem_permissao' });

describe('consulta da trilha de auditoria (FR-039)', () => {
  it('quem pode consultar vê os registros com quem, quando, operação e resultado', async () => {
    const raiz = document.createElement('div');
    const consultar = vi.fn(async () => ({ itens: [evento()], proximo_cursor: null }));
    montarAuditoria(raiz, servicoFalso(consultar), {
      nomeDoUsuario: (id) => (id === usuarioId ? 'Pessoa Fictícia' : undefined),
    });

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    expect(consultar).toHaveBeenCalledWith({ limite: 25 });
    const celulas = colunasDaLinha(linhas(raiz)[0] as HTMLElement);
    expect(celulas).toEqual([
      expect.stringContaining('03/11/2026'),
      'Pessoa Fictícia',
      'Consultar auditoria',
      `auditoria ${eventoId.slice(0, 8)}`,
      'Permitido',
    ]);
    expect(raiz.textContent).toContain('1 registro nesta página.');
  });

  it('recusa de permissão esvazia a listagem e diz que a conta não pode consultar', async () => {
    const raiz = document.createElement('div');
    montarAuditoria(raiz, servicoFalso(vi.fn().mockRejectedValue(recusa)));

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Sua conta não pode consultar o registro de acessos.'),
    );
    expect(linhas(raiz)).toHaveLength(0);
    expect(raiz.textContent).not.toContain('Consultar auditoria');
    // Sem sucesso silencioso e sem paginação para frente a partir de uma recusa.
    expect(botao(raiz, 'Próxima página').disabled).toBe(true);
    expect(
      raiz.querySelector('ul[aria-label="Registros de auditoria"]')?.hasAttribute('aria-busy'),
    ).toBe(false);
  });

  it('recusa depois de uma consulta boa retira os registros já mostrados', async () => {
    const raiz = document.createElement('div');
    const consultar = vi
      .fn<ServicoAuditoria['consultar']>()
      .mockResolvedValueOnce({ itens: [evento()], proximo_cursor: null })
      .mockRejectedValue(recusa);
    montarAuditoria(raiz, servicoFalso(consultar));

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    enviarFiltros(raiz);

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Sua conta não pode consultar o registro de acessos.'),
    );
    expect(linhas(raiz)).toHaveLength(0);
  });

  it('falha passageira não vira recusa de permissão', async () => {
    const raiz = document.createElement('div');
    montarAuditoria(
      raiz,
      servicoFalso(vi.fn().mockRejectedValue(new FalhaApi('servico_indisponivel'))),
    );

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Não foi possível carregar o registro.'),
    );
    expect(raiz.textContent).not.toContain('Sua conta não pode consultar');
  });

  it('a trilha não traz conteúdo: nem motivo, nem request_id, nem identificador inteiro', async () => {
    const raiz = document.createElement('div');
    const comExtras = {
      ...evento(),
      motivo_cifrado: 'conteudo-ficticio-que-nao-deve-aparecer',
      request_id: '80000000-0000-4000-8000-000000000001',
    } as unknown as EventoAuditoria;
    montarAuditoria(
      raiz,
      servicoFalso(vi.fn(async () => ({ itens: [comExtras], proximo_cursor: null }))),
    );

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    expect(raiz.textContent).not.toContain('conteudo-ficticio-que-nao-deve-aparecer');
    expect(raiz.textContent).not.toContain('80000000-0000-4000-8000-000000000001');
    expect(raiz.textContent).not.toContain(eventoId);
    expect(colunasDaLinha(linhas(raiz)[0] as HTMLElement)).toHaveLength(5);
  });

  it('sem lista de casos autorizada, não existe filtro por caso para digitar identificador', async () => {
    const raiz = document.createElement('div');
    montarAuditoria(raiz, servicoFalso());

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    expect(raiz.querySelector('#auditoria-caso')).toBeNull();
  });

  it('o filtro por caso só oferece os casos já autorizados e avisa que a lista é incompleta', async () => {
    const raiz = document.createElement('div');
    const consultar = vi.fn(async () => ({ itens: [], proximo_cursor: null }));
    montarAuditoria(raiz, servicoFalso(consultar as ServicoAuditoria['consultar']), {
      listarCasos: async () => [{ id: caso, nome: 'Paciente Fictício' }],
    });

    const filtroCaso = await vi.waitFor(() => {
      const campo = raiz.querySelector<HTMLSelectElement>('#auditoria-caso');
      if (!campo || campo.options.length < 2) throw new Error('Filtro por caso ainda não chegou');
      return campo;
    });
    expect([...filtroCaso.options].map((opcao) => opcao.value)).toEqual(['', caso]);
    expect([...filtroCaso.options].map((opcao) => opcao.value)).not.toContain(outroCaso);

    fireEvent.change(filtroCaso, { target: { value: caso } });
    enviarFiltros(raiz);

    await vi.waitFor(() =>
      expect(consultar).toHaveBeenCalledWith(
        expect.objectContaining({ paciente_id: caso } as FiltrosAuditoria),
      ),
    );
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain(
        'Registros anteriores a esta função não guardavam o caso e não aparecem neste filtro.',
      ),
    );
  });

  it('falha ao listar casos não some com o filtro no meio da investigação', async () => {
    const raiz = document.createElement('div');
    montarAuditoria(raiz, servicoFalso(), {
      listarCasos: async () => {
        throw new FalhaApi('sem_permissao', 403);
      },
    });

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    const filtroCaso = raiz.querySelector<HTMLSelectElement>('#auditoria-caso');
    expect(filtroCaso).not.toBeNull();
    expect([...(filtroCaso?.options ?? [])].map((opcao) => opcao.value)).toEqual(['']);
  });

  it('os campos de filtro usam o tamanho de fonte que não dispara zoom no iOS', async () => {
    const raiz = document.createElement('div');
    montarAuditoria(raiz, servicoFalso(), {
      listarCasos: async () => [{ id: caso, nome: 'Paciente Fictício' }],
    });

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    await vi.waitFor(() => expect(raiz.querySelector('#auditoria-caso')).not.toBeNull());
    for (const id of ['auditoria-caso', 'auditoria-acao', 'auditoria-de', 'auditoria-ate']) {
      const controle = raiz.querySelector(`#${id}`);
      expect(controle?.className ?? '').toContain('text-(length:--texto-2)');
    }
  });

  it('a listagem não segura a largura do conteúdo: o envelope usa min-w-0', async () => {
    const raiz = document.createElement('div');
    montarAuditoria(raiz, servicoFalso());

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    // O envelope que precisa de `min-w-0` é a região de conteúdo da moldura da tela
    // (`Esqueleto`, dentro de `MolduraTela`): é ela quem é item de grade e quem, sem a
    // classe, prendia a largura do que havia dentro — o defeito medido a 390px.
    const lista = raiz.querySelector('ul[aria-label="Registros de auditoria"]');
    const envelope = lista?.closest('[aria-busy]');
    expect(envelope?.className).toContain('min-w-0');
  });

  it('paginação avança e volta sem perder a posição anterior', async () => {
    const raiz = document.createElement('div');
    const consultar = vi
      .fn<ServicoAuditoria['consultar']>()
      .mockResolvedValueOnce({ itens: [evento()], proximo_cursor: 'cursor-2' })
      .mockResolvedValueOnce({
        itens: [
          evento({
            id: 'abcdef00-0000-4000-8000-000000000002',
            objeto_id: 'abcdef00-0000-4000-8000-000000000002',
          }),
        ],
        proximo_cursor: null,
      })
      .mockResolvedValueOnce({ itens: [evento()], proximo_cursor: 'cursor-2' });
    montarAuditoria(raiz, servicoFalso(consultar));

    await vi.waitFor(() => expect(linhas(raiz)).toHaveLength(1));
    expect(botao(raiz, 'Página anterior').disabled).toBe(true);
    expect(botao(raiz, 'Próxima página').disabled).toBe(false);

    botao(raiz, 'Próxima página').click();
    // Espera a SEGUNDA página terminar de carregar (o novo registro aparece), e não só o
    // instante em que o botão fica desabilitado — que também é verdade, por um triz, durante
    // o próprio carregamento.
    await vi.waitFor(() => expect(raiz.textContent).toContain('abcdef00'));
    expect(botao(raiz, 'Próxima página').disabled).toBe(true);
    expect(botao(raiz, 'Página anterior').disabled).toBe(false);

    botao(raiz, 'Página anterior').click();
    await vi.waitFor(() =>
      expect(consultar).toHaveBeenLastCalledWith({ limite: 25, cursor: undefined }),
    );
    await vi.waitFor(() =>
      expect(
        raiz.querySelector('ul[aria-label="Registros de auditoria"]')?.hasAttribute('aria-busy'),
      ).toBe(false),
    );
    expect(botao(raiz, 'Página anterior').disabled).toBe(true);
  });
});

describe('quem alcança o registro de acessos', () => {
  let desmontarEventos = () => {};
  afterEach(() => {
    desmontarEventos();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.history.replaceState(null, '', '/');
  });

  /** Esconder não é autorizar — a consulta continua sendo autorizada no servidor e no banco.
   * O que estes casos provam é que a área só é oferecida a quem tem a capacidade
   * `consultar_auditoria` e que, forçando a rota, nenhuma consulta à trilha sai do navegador. */
  function preparar(capacidades: readonly string[]): string[] {
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
            usuario: { id: usuarioId, perfil: 'administrador', ativo: true, versao: 1 },
            capacidades,
          },
          request_id: caso,
        });
      if (url.pathname === '/api/admin/auditoria')
        return Response.json({
          dados: { itens: [evento()], proximo_cursor: null },
          request_id: caso,
        });
      return Response.json({ dados: { itens: [], proximo_cursor: null }, request_id: caso });
    });
    return caminhos;
  }

  it('com a capacidade de consultar auditoria a área abre e consulta a trilha', async () => {
    const caminhos = preparar(['consultar_auditoria']);
    await import('./main.js');
    await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
    window.history.pushState(null, '', '#administracao/auditoria');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() =>
      expect(document.getElementById('administracao-conteudo')?.textContent).toContain(
        'Registro de acessos e alterações',
      ),
    );
    await vi.waitFor(() => expect(caminhos).toContain('/api/admin/auditoria'));
  });

  it('sem a capacidade, a rota forçada não monta a trilha nem a consulta', async () => {
    const caminhos = preparar([]);
    await import('./main.js');
    await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
    window.history.pushState(null, '', '#administracao/auditoria');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('a[href="#administracao/auditoria"]')).toBeNull();
    expect(document.getElementById('administracao-conteudo')?.textContent).not.toContain(
      'Registro de acessos e alterações',
    );
    expect(caminhos).not.toContain('/api/admin/auditoria');
  });
});
