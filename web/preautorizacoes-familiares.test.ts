// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FalhaApi } from './api.ts';
import {
  montarPreautorizacoesFamiliares,
  type Preautorizacao,
  type ServicoPreautorizacoes,
} from './preautorizacoes-familiares.tsx';

/** Dados fictícios. Nenhum e-mail, nome ou motivo aqui corresponde a pessoa real. */
const caso = '10000000-0000-4000-8000-00000000000a';
const outroCaso = '10000000-0000-4000-8000-00000000000b';
const convite = '40000000-0000-4000-8000-000000000001';
const acesso = '50000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';

const emailCifrado = {
  formato: 'aes_256_gcm',
  key_id: 'chave-ficticia',
  nonce: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'QkJCQkJC',
  tag: 'Q0NDQ0ND',
} as unknown as Preautorizacao['email'];

function preautorizacao(parcial: Partial<Preautorizacao> = {}): Preautorizacao {
  return {
    convite_id: convite,
    paciente_id: caso,
    estado: 'ativado',
    email: emailCifrado,
    criado_em: '2026-11-01T12:00:00.000Z',
    acesso_preautorizado_id: acesso,
    acesso_autorizado_em: '2026-11-02T12:00:00.000Z',
    acesso_revogado_em: null,
    ...parcial,
  };
}

function servicoFalso(parcial: Partial<ServicoPreautorizacoes> = {}): ServicoPreautorizacoes {
  return {
    listar: vi.fn(async () => [preautorizacao()]),
    cancelar: vi.fn(async () => {}),
    ...parcial,
  };
}

function campoMotivo(raiz: HTMLElement): HTMLInputElement {
  const campo = raiz.querySelector<HTMLInputElement>('input[type="text"]');
  if (!campo) throw new Error('Campo de motivo ausente');
  return campo;
}

describe('acesso da família: concessão de acesso a dado clínico', () => {
  it('quem administra concessões vê o acesso autorizado e consegue encerrá-lo', async () => {
    const raiz = document.createElement('div');
    const cancelar = vi.fn(async () => {});
    const listar = vi
      .fn<ServicoPreautorizacoes['listar']>()
      .mockResolvedValueOnce([preautorizacao()])
      .mockResolvedValue([preautorizacao({ acesso_revogado_em: '2026-11-20T12:00:00.000Z' })]);
    const acessoPerdido = vi.fn();
    montarPreautorizacoesFamiliares(raiz, caso, servicoFalso({ listar, cancelar }), acessoPerdido);

    await vi.waitFor(() => expect(raiz.querySelectorAll('li')).toHaveLength(1));
    expect(listar).toHaveBeenCalledWith(caso);
    expect(raiz.textContent).toContain('E-mail confirmado');
    expect(raiz.textContent).toContain('autorizado em');

    campoMotivo(raiz).value = 'Acompanhamento encerrado (dado fictício).';
    raiz
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await vi.waitFor(() => expect(raiz.textContent).toContain('Acesso encerrado.'));
    expect(cancelar).toHaveBeenCalledWith({
      convite_id: convite,
      acesso_id: acesso,
      motivo: 'Acompanhamento encerrado (dado fictício).',
    });
    // Depois de encerrar, a linha deixa de oferecer o encerramento: o acesso já está fechado.
    expect(raiz.querySelector('form')).toBeNull();
    expect(raiz.textContent).toContain('acesso encerrado em');
    expect(acessoPerdido).not.toHaveBeenCalled();
  });

  it('acesso já revogado não oferece encerramento e se declara encerrado', async () => {
    const raiz = document.createElement('div');
    const listar = vi.fn(async () => [
      preautorizacao({ acesso_revogado_em: '2026-11-10T12:00:00.000Z' }),
    ]);
    montarPreautorizacoesFamiliares(raiz, caso, servicoFalso({ listar }), vi.fn());

    await vi.waitFor(() => expect(raiz.querySelectorAll('li')).toHaveLength(1));
    expect(raiz.textContent).toContain('acesso encerrado em');
    expect(raiz.querySelector('form')).toBeNull();
    expect(raiz.querySelector('input[type="text"]')).toBeNull();
  });

  it('recusa de permissão na leitura retira a seção e devolve o erro a quem trata acesso', async () => {
    const raiz = document.createElement('div');
    const recusa = new FalhaApi('sem_permissao', 403);
    const cancelar = vi.fn(async () => {});
    const acessoPerdido = vi.fn();
    montarPreautorizacoesFamiliares(
      raiz,
      caso,
      servicoFalso({ listar: vi.fn().mockRejectedValue(recusa), cancelar }),
      acessoPerdido,
    );

    await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledWith(recusa));
    // Conteúdo protegido não fica na tela, e nada é apresentado como se tivesse dado certo.
    expect(raiz.querySelector('section')).toBeNull();
    expect(raiz.textContent).toBe('');
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('recusa de permissão no encerramento não vira sucesso silencioso', async () => {
    const raiz = document.createElement('div');
    const recusa = new FalhaApi('sem_permissao', 403);
    const acessoPerdido = vi.fn();
    const listar = vi.fn(async () => [preautorizacao()]);
    montarPreautorizacoesFamiliares(
      raiz,
      caso,
      servicoFalso({ listar, cancelar: vi.fn().mockRejectedValue(recusa) }),
      acessoPerdido,
    );

    await vi.waitFor(() => expect(raiz.querySelectorAll('li')).toHaveLength(1));
    campoMotivo(raiz).value = 'Motivo fictício.';
    raiz
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledWith(recusa));
    expect(raiz.textContent).not.toContain('Acesso encerrado.');
    expect(raiz.querySelector('section')).toBeNull();
    // A segunda leitura nunca aconteceu: a recusa interrompeu o fluxo em vez de seguir.
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it('falha passageira mantém a seção e pede nova tentativa, sem expulsar ninguém', async () => {
    const raiz = document.createElement('div');
    const acessoPerdido = vi.fn();
    montarPreautorizacoesFamiliares(
      raiz,
      caso,
      servicoFalso({ listar: vi.fn().mockRejectedValue(new Error('rede fictícia')) }),
      acessoPerdido,
    );

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Não foi possível carregar os acessos da família agora.'),
    );
    expect(acessoPerdido).not.toHaveBeenCalled();
    expect(raiz.querySelector('section')).not.toBeNull();
  });

  /** O convite familiar está desligado por decisão de produto e a recusa chega como
   * `servico_indisponivel`. Observação registrada em 25/11/2026: `servico-preautorizacoes-http`
   * usa esse mesmo código para falha de rede, então uma indisponibilidade passageira é
   * apresentada como "não foi liberado". Não é falha de autorização — nada é concedido a mais —,
   * mas a mensagem mente sobre a causa. Fica provado aqui o comportamento de hoje. */
  it('convite desligado por produto avisa que a família não entra, sem mandar repetir', async () => {
    const raiz = document.createElement('div');
    const acessoPerdido = vi.fn();
    montarPreautorizacoesFamiliares(
      raiz,
      caso,
      servicoFalso({ listar: vi.fn().mockRejectedValue(new FalhaApi('servico_indisponivel')) }),
      acessoPerdido,
    );

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('O acesso da família ainda não foi liberado.'),
    );
    expect(raiz.textContent).not.toContain('Tente de novo');
    expect(acessoPerdido).not.toHaveBeenCalled();
  });

  it('o encerramento exige motivo antes de chamar o serviço', async () => {
    const raiz = document.createElement('div');
    const cancelar = vi.fn(async () => {});
    montarPreautorizacoesFamiliares(raiz, caso, servicoFalso({ cancelar }), vi.fn());

    await vi.waitFor(() => expect(raiz.querySelectorAll('li')).toHaveLength(1));
    campoMotivo(raiz).value = '   ';
    raiz
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Informe o motivo para encerrar o acesso.'),
    );
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('não oferece encerramento para um acesso devolvido de outro paciente', async () => {
    const raiz = document.createElement('div');
    const listar = vi.fn(async () => [preautorizacao({ paciente_id: outroCaso })]);
    montarPreautorizacoesFamiliares(raiz, caso, servicoFalso({ listar }), vi.fn());

    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Nenhum familiar autorizado neste caso ainda.'),
    );
    expect(raiz.querySelector('li')).toBeNull();
    expect(raiz.querySelector('form')).toBeNull();
  });

  it('a leitura é sempre do caso aberto, nunca de outro', async () => {
    const raiz = document.createElement('div');
    const listar = vi.fn(async () => [] as Preautorizacao[]);
    const desmontar = montarPreautorizacoesFamiliares(
      raiz,
      caso,
      servicoFalso({ listar }),
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Nenhum familiar autorizado neste caso ainda.'),
    );
    desmontar();

    const outraRaiz = document.createElement('div');
    montarPreautorizacoesFamiliares(outraRaiz, outroCaso, servicoFalso({ listar }), vi.fn());
    await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
    expect(listar.mock.calls.map(([id]) => id)).toEqual([caso, outroCaso]);
  });
});

describe('quem alcança a seção de acesso da família', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.history.replaceState(null, '', '/');
  });

  /** Esconder não é autorizar — o servidor e o banco continuam decidindo cada chamada. Estes
   * dois casos provam que a superfície de concessão não é apresentada a quem não administra
   * concessões e que, forçando a rota, nenhuma leitura de pré-autorização sai do navegador. */
  function prepararFicha(
    perfil: 'administrador' | 'profissional',
    capacidades: readonly string[],
  ): string[] {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
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
            capacidades,
          },
          request_id: caso,
        });
      if (url.pathname === '/api/pacientes')
        return Response.json({
          dados: {
            itens: [{ id: caso, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
            proximo_cursor: null,
          },
          request_id: caso,
        });
      return Response.json({ dados: { itens: [], proximo_cursor: null }, request_id: caso });
    });
    return caminhos;
  }

  it('quem administra concessões encontra a seção do acesso da família na ficha', async () => {
    const caminhos = prepararFicha('administrador', ['administrar_concessoes']);
    window.history.replaceState(null, '', `/#paciente/${caso}/acesso-familia`);
    await import('./main.js');
    await vi.waitFor(() =>
      expect(document.getElementById('ficha-painel')?.textContent).toContain(
        'Quem a equipe autorizou a acompanhar este caso',
      ),
    );
    expect(caminhos).toContain('/api/admin/preautorizacoes-familiares');
  });

  it('sem a capacidade de administrar concessões a seção não existe nem é consultada', async () => {
    const caminhos = prepararFicha('profissional', []);
    window.history.replaceState(null, '', `/#paciente/${caso}/acesso-familia`);
    await import('./main.js');
    await vi.waitFor(() => expect(document.getElementById('ficha-view')?.hidden).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById('ficha-aba-acesso-familia')).toBeNull();
    expect(document.getElementById('ficha-painel')?.textContent).not.toContain(
      'Quem a equipe autorizou a acompanhar este caso',
    );
    expect(caminhos).not.toContain('/api/admin/preautorizacoes-familiares');
  });
});
