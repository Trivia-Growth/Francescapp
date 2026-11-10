// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAMINHO_EQUIPE,
  entradaCasoNovo,
  equipeFicticia,
  ID_RESPONSAVEL,
  preencherCasoNovo,
  respostaEquipe,
} from './teste-caso-novo.js';

const id = '10000000-0000-4000-8000-000000000001';
const COMPLETAS = ['administrar_cadastro', 'administrar_concessoes'];
const envelope = (dados: unknown) => Response.json({ dados, request_id: id });
const el = <T extends HTMLElement>(nome: string) => document.getElementById(nome) as T;

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-tecnica', '20000000-0000-4000-8000-000000000001');
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

type Chamada = { caminho: string; metodo: string; corpo: unknown; chave: string | null };

/** Abre o cadastro como Administrador, já liberado para criar; a equipe vem de `equipe`. */
async function abrir(
  opcoes: {
    capacidades?: string[];
    equipe?: () => Response | Promise<Response>;
  } = {},
) {
  const { capacidades = COMPLETAS, equipe = () => respostaEquipe() } = opcoes;
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const sessao = {
    session_id: '20000000-0000-4000-8000-000000000001',
    usuario: { id, perfil: 'administrador', ativo: true, versao: 1 },
    capacidades,
  };
  const chamadas: Chamada[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    chamadas.push({
      caminho: url.pathname,
      metodo: init.method ?? 'GET',
      corpo: init.body ? JSON.parse(String(init.body)) : null,
      chave: new Headers(init.headers).get('x-chave-idempotencia'),
    });
    if (url.pathname === '/api/sessao') return envelope(sessao);
    if (url.pathname === '/api/sessao/sair')
      return envelope({ encerrada_localmente: true, pendencia_externa: false });
    if (url.pathname === CAMINHO_EQUIPE) return equipe();
    if (url.pathname === '/api/cadastro/barreira')
      return envelope({ epoca: 1, reserva: null, resultado_pendente: null });
    if (url.pathname === '/api/cadastro/barreira/encerrar') return envelope({ estado: 'vazia' });
    if (url.pathname === '/api/cadastro/barreira/reservar') return envelope({ estado: 'aberta' });
    if (url.pathname === '/api/pacientes' && init.method === 'GET')
      return envelope({ itens: [], proximo_cursor: null });
    if (url.pathname === '/api/pacientes' && init.method === 'POST')
      return envelope({
        id,
        nome: 'Paciente fictício',
        nome_preferencia: 'Pac',
        data_nascimento: '2000-01-31',
        contatos: [],
        versao: 1,
      });
    throw new Error(`Rota inesperada: ${url.pathname}`);
  });
  await import('./main.js');
  const botao = () => document.querySelector<HTMLButtonElement>('#cadastro button[data-acao]');
  await vi.waitFor(() => expect(botao()?.dataset.acao).toBe('encerrar'));
  botao()?.click();
  await vi.waitFor(() => expect(el<HTMLButtonElement>('create-submit').disabled).toBe(false));
  return {
    chamadas,
    postagens: () =>
      chamadas.filter(
        (chamada) => chamada.caminho === '/api/pacientes' && chamada.metodo === 'POST',
      ),
    chamadasEquipe: () => chamadas.filter((chamada) => chamada.caminho === CAMINHO_EQUIPE),
    /** Envia e dá tempo para qualquer chamada assíncrona que o envio dispararia aparecer. */
    enviar: async () => {
      el('create-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
  };
}

const CONTROLES = [
  { controle: 'patient-name', erro: 'name-error' },
  { controle: 'preferred-name', erro: 'preferred-error' },
  { controle: 'birth-date', erro: 'birth-error' },
  { controle: 'contact-value-1', erro: 'contacts-error' },
  { controle: 'case-status', erro: 'status-error' },
  { controle: 'case-manager', erro: 'manager-error' },
] as const;

const invalidos = () =>
  CONTROLES.filter(({ controle }) => el(controle).getAttribute('aria-invalid') === 'true').map(
    ({ controle }) => controle,
  );

describe('orientação ao Administrador', () => {
  it('a lista vazia e o painel dizem que todos os campos são exigidos, sem prometer opcionais', async () => {
    await abrir();
    await vi.waitFor(() => expect(el('list-empty').hidden).toBe(false));
    expect(el('empty-description').textContent).toBe(
      'Cadastre o primeiro paciente informando todos os campos exigidos.',
    );
    expect(el('cadastro').textContent).toContain('Todos os campos são obrigatórios');
    expect(el('cadastro').textContent).not.toContain('opcional');
  });
});

describe('envio incompleto', () => {
  it('formulário vazio não envia e marca todos os campos com aria-invalid e mensagem', async () => {
    const tela = await abrir();
    await vi.waitFor(() => expect(tela.chamadasEquipe()).toHaveLength(1));
    await tela.enviar();

    expect(tela.postagens()).toHaveLength(0);
    expect(tela.chamadas.some((chamada) => chamada.caminho.endsWith('/reservar'))).toBe(false);
    expect(invalidos()).toEqual(CONTROLES.map(({ controle }) => controle));
    for (const { erro } of CONTROLES) expect(el(erro).textContent, erro).not.toBe('');
    expect(el('create-feedback').textContent).toContain('Confira os campos');
    expect(document.activeElement).toBe(el('patient-name'));
  });

  it.each(CONTROLES)(
    'só $controle vazio: não envia e marca apenas esse campo',
    async ({ controle, erro }) => {
      const tela = await abrir();
      await preencherCasoNovo();
      el<HTMLInputElement | HTMLSelectElement>(controle).value = '';

      await tela.enviar();

      expect(tela.postagens()).toHaveLength(0);
      expect(tela.chamadas.some((chamada) => chamada.caminho.endsWith('/reservar'))).toBe(false);
      expect(invalidos()).toEqual([controle]);
      for (const outro of CONTROLES)
        expect(el(outro.erro).textContent === '', outro.erro).toBe(outro.erro !== erro);
      expect(document.activeElement).toBe(el(controle));
      expect(el('create-feedback').textContent).toContain('Confira os campos');
    },
  );

  it('contato inválido marca só a linha errada; data futura é recusada; nada é enviado', async () => {
    const tela = await abrir();
    await preencherCasoNovo();
    el<HTMLButtonElement>('add-contact').click();
    el<HTMLInputElement>('contact-value-2').value = 'sem arroba';
    el<HTMLInputElement>('birth-date').value = `${new Date().getFullYear() + 1}-01-01`;

    await tela.enviar();

    expect(tela.postagens()).toHaveLength(0);
    expect(el('contact-value-1').hasAttribute('aria-invalid')).toBe(false);
    expect(el('contact-value-2').getAttribute('aria-invalid')).toBe('true');
    expect(el('contacts-error').textContent).not.toBe('');
    expect(el('birth-date').getAttribute('aria-invalid')).toBe('true');
    expect(el('birth-error').textContent).toContain('não seja futura');
  });

  it('situação e responsável deixam de ser marcados quando o valor é escolhido', async () => {
    const tela = await abrir();
    await vi.waitFor(() =>
      expect(el<HTMLSelectElement>('case-manager').options.length).toBeGreaterThan(1),
    );
    await tela.enviar();
    expect(invalidos()).toContain('case-status');
    expect(invalidos()).toContain('case-manager');

    el<HTMLSelectElement>('case-status').value = 'pausado';
    el('case-status').dispatchEvent(new Event('input'));
    el<HTMLSelectElement>('case-manager').value = ID_RESPONSAVEL;
    el('case-manager').dispatchEvent(new Event('input'));

    expect(el('case-status').hasAttribute('aria-invalid')).toBe(false);
    expect(el('status-error').textContent).toBe('');
    expect(el('case-manager').hasAttribute('aria-invalid')).toBe(false);
    expect(el('manager-error').textContent).toBe('');
  });

  it('contato corrigido deixa de ser marcado sem esperar o próximo envio', async () => {
    const tela = await abrir();
    await tela.enviar();
    expect(el('contact-value-1').getAttribute('aria-invalid')).toBe('true');

    el<HTMLInputElement>('contact-value-1').value = 'contato@exemplo.test';
    // O evento de digitação real sobe pelo DOM.
    el('contact-value-1').dispatchEvent(new Event('input', { bubbles: true }));

    expect(el('contact-value-1').hasAttribute('aria-invalid')).toBe(false);
    expect(el('contacts-error').textContent).toBe('');
  });
});

describe('equipe indisponível', () => {
  it('enquanto a equipe carrega mostra "Carregando equipe…" e o envio completo não sai', async () => {
    let liberar!: (resposta: Response) => void;
    const tela = await abrir({
      equipe: () =>
        new Promise<Response>((resolve) => {
          liberar = resolve;
        }),
    });
    expect(el('manager-state').textContent).toBe('Carregando equipe…');
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);
    el<HTMLInputElement>('patient-name').value = 'Paciente fictício';
    el<HTMLInputElement>('preferred-name').value = 'Pac';
    el<HTMLInputElement>('birth-date').value = '2000-01-31';
    el<HTMLInputElement>('contact-value-1').value = 'contato@exemplo.test';
    el<HTMLSelectElement>('case-status').value = 'ativo';

    await tela.enviar();

    expect(tela.postagens()).toHaveLength(0);
    expect(invalidos()).toEqual(['case-manager']);

    liberar(respostaEquipe());
    await preencherCasoNovo();
    expect(el('manager-state').textContent).toBe('');
    await tela.enviar();
    await vi.waitFor(() => expect(tela.postagens()).toHaveLength(1));
  });

  it('falha ao carregar a equipe bloqueia o envio, avisa e a nova tentativa libera', async () => {
    let respostas = 0;
    const tela = await abrir({
      equipe: () => (respostas++ === 0 ? new Response(null, { status: 503 }) : respostaEquipe()),
    });
    await vi.waitFor(() => expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(false));
    expect(el('manager-state').textContent).toContain('Não foi possível carregar a equipe');
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);
    el<HTMLInputElement>('patient-name').value = 'Paciente fictício';
    el<HTMLInputElement>('preferred-name').value = 'Pac';
    el<HTMLInputElement>('birth-date').value = '2000-01-31';
    el<HTMLInputElement>('contact-value-1').value = 'contato@exemplo.test';
    el<HTMLSelectElement>('case-status').value = 'ativo';

    await tela.enviar();

    expect(tela.postagens()).toHaveLength(0);
    expect(el('create-feedback').textContent).not.toBe('');
    expect(el('case-manager').getAttribute('aria-invalid')).toBe('true');

    el<HTMLButtonElement>('manager-retry').click();
    await preencherCasoNovo();
    expect(tela.chamadasEquipe()).toHaveLength(2);
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    await tela.enviar();
    await vi.waitFor(() => expect(tela.postagens()).toHaveLength(1));
  });

  it('equipe sem pessoa ativa avisa e não permite enviar', async () => {
    const tela = await abrir({
      equipe: () =>
        respostaEquipe({
          ...equipeFicticia,
          itens: equipeFicticia.itens.map((item) => ({ ...item, ativo: false })),
        }),
    });
    await vi.waitFor(() =>
      expect(el('manager-state').textContent).toContain('Nenhuma pessoa ativa da equipe'),
    );
    expect(el<HTMLSelectElement>('case-manager').options).toHaveLength(1);
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);

    await tela.enviar();

    expect(tela.postagens()).toHaveLength(0);
    expect(el('case-manager').getAttribute('aria-invalid')).toBe('true');
  });

  it('sem administrar_concessoes a rota da equipe não é chamada e o cadastro não pode ser enviado', async () => {
    const tela = await abrir({ capacidades: ['administrar_cadastro'] });
    expect(el('cadastro').hidden).toBe(false);
    expect(el('manager-state').textContent).toContain('o cadastro não pode ser enviado');
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    el<HTMLInputElement>('patient-name').value = 'Paciente fictício';
    el<HTMLInputElement>('preferred-name').value = 'Pac';
    el<HTMLInputElement>('birth-date').value = '2000-01-31';
    el<HTMLInputElement>('contact-value-1').value = 'contato@exemplo.test';
    el<HTMLSelectElement>('case-status').value = 'ativo';

    await tela.enviar();

    expect(tela.chamadasEquipe()).toHaveLength(0);
    expect(tela.postagens()).toHaveLength(0);
    expect(el('case-manager').getAttribute('aria-invalid')).toBe('true');
    expect(el('create-feedback').textContent).toContain('Confira os campos');
  });

  it('revalidar o acesso do mesmo usuário não consulta a equipe de novo', async () => {
    const tela = await abrir();
    await vi.waitFor(() => expect(tela.chamadasEquipe()).toHaveLength(1));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() =>
      expect(tela.chamadas.filter((c) => c.caminho === '/api/sessao').length).toBeGreaterThan(1),
    );
    await vi.waitFor(() => expect(el('patients-view').hidden).toBe(false));
    expect(tela.chamadasEquipe()).toHaveLength(1);
    expect(el<HTMLSelectElement>('case-manager').options.length).toBeGreaterThan(1);
  });
});

describe('envio completo', () => {
  it('envia todos os campos, só os contatos preenchidos, e limpa o formulário depois', async () => {
    const tela = await abrir();
    await preencherCasoNovo('  Paciente Completo  ');
    el<HTMLButtonElement>('add-contact').click();
    el<HTMLSelectElement>('contact-type-2').value = 'telefone';
    el<HTMLSelectElement>('contact-type-2').dispatchEvent(new Event('change'));
    el<HTMLInputElement>('contact-value-2').value = '+55 11 90000-0000';
    el<HTMLButtonElement>('add-contact').click();
    el<HTMLSelectElement>('case-status').value = 'entrada';

    await tela.enviar();
    await vi.waitFor(() => expect(tela.postagens()).toHaveLength(1));

    const [postagem] = tela.postagens();
    expect(postagem?.chave).toBeTruthy();
    expect(postagem?.corpo).toMatchObject({
      entrada: {
        ...entradaCasoNovo('Paciente Completo'),
        contatos: [
          { tipo: 'email', valor: 'contato@exemplo.test' },
          { tipo: 'telefone', valor: '+55 11 90000-0000' },
        ],
        situacao: 'entrada',
      },
    });
    expect(Object.keys((postagem?.corpo as { entrada: object }).entrada).sort()).toEqual([
      'contatos',
      'data_nascimento',
      'nome',
      'nome_preferencia',
      'responsavel_id',
      'situacao',
    ]);

    await vi.waitFor(() =>
      expect(el('workspace-feedback').textContent).toBe('Paciente cadastrado. Lista atualizada.'),
    );
    expect(el<HTMLInputElement>('patient-name').value).toBe('');
    expect(el<HTMLInputElement>('preferred-name').value).toBe('');
    expect(el<HTMLInputElement>('birth-date').value).toBe('');
    expect(document.querySelectorAll('#contacts-list .contact-row')).toHaveLength(1);
    expect(el<HTMLInputElement>('contact-value-1').value).toBe('');
    expect(el<HTMLSelectElement>('case-status').value).toBe('');
    expect(el<HTMLSelectElement>('case-manager').value).toBe('');
    expect(invalidos()).toEqual([]);
  });

  it('oferece só pessoas ativas da equipe e envia o responsável escolhido', async () => {
    const outra = '30000000-0000-4000-8000-000000000002';
    const tela = await abrir({
      equipe: () =>
        respostaEquipe({
          proximo_cursor: null,
          itens: [
            ...equipeFicticia.itens,
            {
              ...equipeFicticia.itens[0],
              id: outra,
              usuario_id: outra,
              email: 'inativa@exemplo.test',
              ativo: false,
            },
          ],
        }),
    });
    await preencherCasoNovo();
    expect([...el<HTMLSelectElement>('case-manager').options].map((o) => o.value)).toEqual([
      '',
      ID_RESPONSAVEL,
    ]);
    await tela.enviar();
    await vi.waitFor(() => expect(tela.postagens()).toHaveLength(1));
    expect(tela.postagens()[0]?.corpo).toMatchObject({
      entrada: { responsavel_id: ID_RESPONSAVEL },
    });
  });
});

describe('fim da sessão', () => {
  it('sair apaga contatos, situação e responsável digitados, e não deixa a equipe no DOM', async () => {
    const tela = await abrir();
    await preencherCasoNovo('Paciente fictício');
    el<HTMLButtonElement>('add-contact').click();
    el<HTMLInputElement>('contact-value-2').value = 'segundo@exemplo.test';
    expect(tela.postagens()).toHaveLength(0);

    el('logout').click();
    await vi.waitFor(() => expect(el('login-view').hidden).toBe(false));

    expect(el<HTMLInputElement>('patient-name').value).toBe('');
    expect(el<HTMLInputElement>('preferred-name').value).toBe('');
    expect(el<HTMLInputElement>('birth-date').value).toBe('');
    expect(document.querySelectorAll('#contacts-list .contact-row')).toHaveLength(1);
    expect(el<HTMLInputElement>('contact-value-1').value).toBe('');
    expect(el<HTMLSelectElement>('case-status').value).toBe('');
    expect(el<HTMLSelectElement>('case-manager').value).toBe('');
    expect(document.documentElement.innerHTML).not.toContain('contato@exemplo.test');
    expect(document.documentElement.innerHTML).not.toContain('segundo@exemplo.test');
  });

  it('sair remove da tela os e-mails da equipe carregados para o responsável', async () => {
    await abrir();
    await preencherCasoNovo();
    expect(document.documentElement.innerHTML).toContain('equipe@exemplo.test');

    el('logout').click();
    await vi.waitFor(() => expect(el('login-view').hidden).toBe(false));

    expect(document.documentElement.innerHTML).not.toContain('equipe@exemplo.test');
  });
});
