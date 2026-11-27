// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { montarAgendaIndividual } from './agenda-individual.tsx';

/* Prova de integração do hospedeiro com os três corpos (`agenda-operacoes.tsx`,
 * `agenda-vinculo.tsx`, `realizacao-compromisso.tsx`): o punho que cada corpo registra
 * via `registrar` precisa chegar ao clique na lista, na MESMA raiz React — sem isso, a
 * migração reproduziria o risco já conhecido de uma ilha tentar alcançar um nó que não é
 * mais dela. Os comportamentos internos de cada corpo já têm prova própria; aqui só a
 * ligação entre eles é o que importa. */

const UUID = '00000000-0000-4000-8000-000000000000';

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (entrada: string | URL | Request) => {
      const url = entrada instanceof Request ? entrada.url : String(entrada);
      if (url.endsWith('/conexao'))
        return Response.json({
          estado: 'conectado',
          versao: '1',
          operacao_id: UUID,
          autorizacao: 'comprovante-ficticio',
        });
      if (url.endsWith('/pendencia')) return Response.json({ estado: 'nenhuma' });
      if (url.includes('/compromissos'))
        return Response.json({
          dados: [
            {
              id: 'evt-1',
              titulo: 'Consulta fictícia',
              inicio: '2026-12-01T10:00:00Z',
              fim: '2026-12-01T11:00:00Z',
              etag: 'etag-1',
            },
          ],
        });
      if (url.endsWith('/realizacao/consulta'))
        return Response.json({
          dados: { agenda_usuario_id: UUID, compromissos: [] },
          request_id: UUID,
        });
      if (url.endsWith('/vinculos/consulta')) return Response.json({ dados: [] });
      throw new Error(`Rota inesperada: ${url}`);
    }),
  );
}

function montar() {
  sessionStorage.setItem('modo-acesso', 'google');
  sessionStorage.setItem('fluxo-google', 'a'.repeat(22));
  stubFetch();
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const desmontar = montarAgendaIndividual(
    raiz,
    'sessao-ficticia',
    'usuario-ficticio',
    async () => ({
      itens: [],
      proximo_cursor: null,
    }),
  );
  return { raiz, desmontar };
}

function clicarNaLista(raiz: HTMLElement, texto: string): void {
  const alvo = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!alvo) throw new Error(`Botão ausente na lista: ${texto}`);
  alvo.click();
}

it('abre o painel de vínculo ao clicar em "Vincular paciente" na lista', async () => {
  const { raiz, desmontar } = montar();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consulta fictícia'));
  clicarNaLista(raiz, 'Vincular paciente');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Vincular compromisso a paciente'));
  expect(raiz.querySelector('section')?.hidden).toBe(false);
  desmontar();
});

it('abre o formulário de realização ao clicar em "Registrar realização" na lista', async () => {
  const { raiz, desmontar } = montar();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consulta fictícia'));
  clicarNaLista(raiz, 'Registrar realização');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Registrar realização do compromisso'));
  desmontar();
});

it('abre o formulário de operações pré-preenchido ao clicar em "Alterar" na lista', async () => {
  const { raiz, desmontar } = montar();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consulta fictícia'));
  clicarNaLista(raiz, 'Alterar');
  await vi.waitFor(() => expect(raiz.textContent).toContain('Alterar compromisso'));
  const inicio = raiz.querySelector('#agenda-inicio') as HTMLInputElement;
  expect(inicio.value).not.toBe('');
  desmontar();
});
