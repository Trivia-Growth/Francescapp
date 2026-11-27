// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';

const id = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });

afterEach(() => {
  Reflect.deleteProperty(document, 'hidden');
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('abre plano do paciente pela rota HTTP e trata dispatcher inativo sem simular sucesso', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  const caminhos: string[] = [];
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = new URL(String(url), 'http://localhost').pathname;
    caminhos.push(caminho);
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === '/api/admin/campo-extra-plano') return envelope([]);
    if (caminho === `/api/pacientes/${id}/plano`) return new Response(null, { status: 404 });
    throw new Error('Rota inesperada');
  });
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(document.querySelector('button[data-paciente-id]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('button[data-paciente-id]')?.click();
  document.getElementById('ficha-aba-plano')?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('[data-secao="plano"] button')?.textContent).toBe(
      'Tentar novamente',
    ),
  );
  expect(caminhos).toContain(`/api/pacientes/${id}/plano`);
  expect(document.querySelector('[data-secao="plano"] form')).toBeNull();
  expect(document.activeElement?.id).toBe('ficha-title');
  document.getElementById('ficha-voltar')?.click();
  expect(document.getElementById('ficha-view')?.textContent).toBe('');
  expect(document.activeElement).toBe(document.querySelector('button[data-paciente-id]'));
});

it('encerra acesso e limpa plano quando permissão é revogada após retorno à aba', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  let consultouVisao = false;
  let voltouParaAba = false;
  let responder: ((resposta: Response) => void) | undefined;
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = new URL(String(url), 'http://localhost').pathname;
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === '/api/admin/campo-extra-plano') return envelope([]);
    if (caminho === `/api/pacientes/${id}/plano`) {
      if (!voltouParaAba) {
        consultouVisao = true;
        return envelope({ itens: [], proximo_cursor: null });
      }
      return new Promise<Response>((resolve) => {
        responder = resolve;
      });
    }
    throw new Error('Rota inesperada');
  });
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(document.querySelector('button[data-paciente-id]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('button[data-paciente-id]')?.click();
  // As duas ilhas podem consultar o mesmo endpoint. Deixe a Visão iniciar antes de sair.
  await vi.waitFor(() => expect(consultouVisao).toBe(true));
  document.getElementById('ficha-aba-plano')?.click();
  await vi.waitFor(() =>
    expect(document.querySelector('[data-secao="plano"]')?.textContent).toContain(
      'Nenhum objetivo',
    ),
  );
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  voltouParaAba = true;
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(responder).toBeDefined());
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  responder?.(
    Response.json(
      { erro: { codigo: 'sem_permissao', mensagem: 'Operação não permitida.' }, request_id: id },
      { status: 403 },
    ),
  );
  // Desde 24/11/2026 permissão revogada limpa o conteúdo sem derrubar a sessão: a pessoa
  // continua dentro e a área diz que não está liberada. Derrubar mentia sobre a causa.
  await vi.waitFor(() =>
    expect(document.getElementById('workspace-feedback')?.textContent).toContain(
      'não está liberada',
    ),
  );
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
  expect(document.getElementById('login-view')?.hidden).toBe(true);
  expect(document.getElementById('workspace-feedback')?.getAttribute('role')).toBe('status');
  expect(document.getElementById('workspace-feedback')?.getAttribute('aria-live')).toBe('polite');
  /* Afirmação ajustada em 25/11/2026 junto com a mudança de comportamento, e a garantia
     que ela cobre ficou MAIOR, não menor.
     Antes: a ficha inteira era desmontada, e a prova era `ficha-view` vazia. O efeito
     colateral medido é que o Administrador recusado numa aba era devolvido à lista e não
     conseguia alcançar "Equipe com acesso" do mesmo caso.
     Agora o tamanho do que sai da tela corresponde ao tamanho da recusa: some a ÁREA
     negada, fica a moldura do caso. A prova passa a ser o que de fato importa — nenhum
     conteúdo da área negada permanece visível — e acrescenta que a pessoa continua
     podendo trocar de aba, que é justamente o que não funcionava. Recusa da visão do
     caso continua fechando a ficha inteira: ali a negativa é do caso, não da área. */
  const secaoPlano = document.querySelector('[data-secao="plano"]');
  expect(secaoPlano?.textContent ?? '').toBe('');
  expect(document.getElementById('ficha-view')?.hidden).toBe(false);
  expect(document.getElementById('ficha-aba-visao')).not.toBeNull();
  // A tela de acesso não é mais usada aqui, então não há mensagem de login a conferir: o
  // aviso que importa é o da área de trabalho, já verificado acima.
  expect(document.getElementById('login-feedback')?.textContent).toBe('');
});

it('recusa de uma área não fecha o caso: a pessoa troca de aba e segue', async () => {
  /* O defeito que isto conserta, medido em 25/11/2026: qualquer 403 fechava a ficha
     inteira, e o Administrador que esbarrasse numa área não liberada era devolvido à
     lista — sem conseguir alcançar "Equipe com acesso" do MESMO caso, que ele tem
     direito de ver. A recusa quase sempre é da área, não do caso.

     A garantia de sigilo não é afrouxada: o conteúdo da área negada some. O que muda é
     que a moldura do caso fica, porque nada nela foi negado. */
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  vi.stubGlobal('fetch', async (url: URL | string) => {
    const caminho = new URL(String(url), 'http://localhost').pathname;
    if (caminho === '/api/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (caminho === '/api/pacientes')
      return envelope({
        itens: [{ id, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (caminho === '/api/admin/campo-extra-plano') return envelope([]);
    if (caminho === `/api/pacientes/${id}/plano`)
      return Response.json(
        { erro: { codigo: 'sem_permissao', mensagem: 'Operação não permitida.' }, request_id: id },
        { status: 403 },
      );
    return envelope({ itens: [], proximo_cursor: null });
  });
  await montarCascaParaTeste();
  await vi.waitFor(() => expect(document.querySelector('button[data-paciente-id]')).not.toBeNull());
  document.querySelector<HTMLButtonElement>('button[data-paciente-id]')?.click();
  document.getElementById('ficha-aba-plano')?.click();

  await vi.waitFor(() =>
    expect(document.getElementById('workspace-feedback')?.textContent).toContain(
      'não está liberada',
    ),
  );
  // Some a área negada.
  expect(document.querySelector('[data-secao="plano"]')?.textContent ?? '').toBe('');
  // Fica o caso, e as outras abas continuam alcançáveis — o que não acontecia antes.
  expect(document.getElementById('ficha-view')?.hidden).toBe(false);
  const outraAba = document.getElementById('ficha-aba-visao');
  expect(outraAba).not.toBeNull();
  outraAba?.click();
  await vi.waitFor(() => expect(document.querySelector('[data-secao="visao"]')).not.toBeNull());
});
