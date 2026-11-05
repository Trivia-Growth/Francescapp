import { montarVinculoAgenda } from './agenda-vinculo.js';
import { montarOperacoesAgenda } from './agenda-operacoes.js';

type Compromisso = { id: string; inicio: string; fim: string; titulo: string; etag?: string };

export function montarAgendaIndividual(
  raiz: HTMLElement,
  sessaoId: string,
  listarPacientes: (
    cursor?: string,
  ) => Promise<{ itens: readonly { id: string; nome: string }[]; proximo_cursor: string | null }>,
): () => void {
  let ativa = true;
  let consulta = 0;
  const titulo = document.createElement('h2');
  titulo.textContent = 'Minha agenda';
  const descricao = document.createElement('p');
  descricao.textContent = 'Consulte os compromissos da sua agenda Google para os próximos 30 dias.';
  const status = document.createElement('p');
  status.className = 'feedback';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const lista = document.createElement('ul');
  lista.className = 'agenda-lista';
  const atualizar = document.createElement('button');
  atualizar.className = 'button-secondary';
  atualizar.type = 'button';
  atualizar.textContent = 'Atualizar agenda';
  const conectar = document.createElement('button');
  conectar.className = 'button-secondary';
  conectar.type = 'button';
  conectar.textContent = 'Conectar agenda Google';
  const acoes = document.createElement('div');
  acoes.className = 'agenda-acoes';
  acoes.append(atualizar, conectar);
  raiz.replaceChildren(titulo, descricao, acoes, status, lista);

  function cabecalhos(): Headers {
    const fluxo = sessionStorage.getItem('fluxo-google');
    if (
      sessionStorage.getItem('modo-acesso') !== 'google' ||
      !fluxo ||
      !/^[A-Za-z0-9_-]{22}$/.test(fluxo)
    )
      throw new Error();
    return new Headers({ Accept: 'application/json', 'x-sessao': sessaoId, 'x-fluxo': fluxo });
  }
  const operacoesRaiz = document.createElement('div');
  raiz.append(operacoesRaiz);
  const operacoes = montarOperacoesAgenda(operacoesRaiz, cabecalhos, () => void carregar());
  const vinculos = montarVinculoAgenda(operacoesRaiz, cabecalhos, listarPacientes);
  async function carregar(): Promise<void> {
    const versao = ++consulta;
    lista.replaceChildren();
    status.textContent = 'Consultando agenda…';
    atualizar.disabled = true;
    try {
      const inicio = new Date();
      const fim = new Date(inicio.getTime() + 30 * 86400000);
      const url = new URL('/api/agenda/google/compromissos', window.location.origin);
      url.searchParams.set('inicio', inicio.toISOString());
      url.searchParams.set('fim', fim.toISOString());
      const resposta = await fetch(url, {
        headers: cabecalhos(),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const corpo: unknown = await resposta.json();
      if (
        !corpo ||
        typeof corpo !== 'object' ||
        !('dados' in corpo) ||
        !Array.isArray(corpo.dados) ||
        !corpo.dados.every((item: unknown) => {
          if (!item || typeof item !== 'object') return false;
          const v = item as Record<string, unknown>;
          return (
            typeof v.id === 'string' &&
            typeof v.titulo === 'string' &&
            (v.etag === undefined || typeof v.etag === 'string') &&
            typeof v.inicio === 'string' &&
            typeof v.fim === 'string' &&
            Number.isFinite(Date.parse(v.inicio)) &&
            Number.isFinite(Date.parse(v.fim))
          );
        })
      )
        throw new Error();
      if (!ativa || versao !== consulta) return;
      const itens = corpo.dados as Compromisso[];
      const data = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      });
      const dia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' });
      for (const item of itens) {
        const linha = document.createElement('li');
        const nome = document.createElement('strong');
        nome.textContent = item.titulo;
        const horario = document.createElement('span');
        if (/^\d{4}-\d{2}-\d{2}$/.test(item.inicio) && /^\d{4}-\d{2}-\d{2}$/.test(item.fim)) {
          const inicio = new Date(`${item.inicio}T00:00:00Z`);
          const ultimoDia = new Date(new Date(`${item.fim}T00:00:00Z`).getTime() - 86400000);
          horario.textContent =
            inicio.getTime() === ultimoDia.getTime()
              ? `${dia.format(inicio)} · Dia inteiro`
              : `${dia.format(inicio)} – ${dia.format(ultimoDia)} · Dias inteiros`;
        } else {
          horario.textContent = `${data.format(new Date(item.inicio))} – ${data.format(new Date(item.fim))} · Horário de São Paulo`;
        }
        linha.append(nome, horario);
        if (item.etag) {
          const editar = document.createElement('button');
          editar.type = 'button';
          editar.className = 'button-secondary';
          editar.textContent = 'Alterar';
          editar.setAttribute('aria-label', `Alterar compromisso de ${horario.textContent}`);
          editar.addEventListener('click', () => operacoes.editar(item));
          const cancelar = document.createElement('button');
          cancelar.type = 'button';
          cancelar.className = 'button-secondary';
          cancelar.textContent = 'Cancelar compromisso';
          cancelar.setAttribute('aria-label', `Cancelar compromisso de ${horario.textContent}`);
          cancelar.addEventListener('click', () => operacoes.cancelar(item));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(item.inicio)) linha.append(editar);
          linha.append(cancelar);
        }
        const vincular = document.createElement('button');
        vincular.type = 'button';
        vincular.className = 'button-secondary';
        vincular.textContent = 'Vincular paciente';
        vincular.setAttribute(
          'aria-label',
          `Vincular paciente ao compromisso de ${horario.textContent}`,
        );
        vincular.addEventListener('click', () =>
          vinculos.abrir(item.id, horario.textContent ?? ''),
        );
        linha.append(vincular);
        lista.append(linha);
      }
      status.textContent = itens.length
        ? `${itens.length} compromisso(s) no período.`
        : 'Nenhum compromisso nos próximos 30 dias.';
    } catch {
      if (ativa && versao === consulta)
        status.textContent =
          'Não foi possível consultar a agenda. Conecte sua conta Google ou tente atualizar novamente.';
    } finally {
      if (ativa && versao === consulta) atualizar.disabled = false;
    }
  }
  atualizar.addEventListener('click', () => void carregar());
  conectar.addEventListener('click', async () => {
    conectar.disabled = true;
    status.textContent = 'Preparando conexão com Google…';
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/conectar', {
        method: 'POST',
        headers,
        body: '{}',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const corpo: unknown = await resposta.json();
      if (!corpo || typeof corpo !== 'object' || !('url' in corpo) || typeof corpo.url !== 'string')
        throw new Error();
      const destino = new URL(corpo.url);
      if (destino.protocol !== 'https:' || destino.hostname !== 'accounts.google.com')
        throw new Error();
      if (ativa) window.location.assign(destino.href);
    } catch {
      if (ativa)
        status.textContent =
          'Não foi possível iniciar a conexão. Tente novamente quando o serviço estiver disponível.';
    } finally {
      if (ativa) conectar.disabled = false;
    }
  });
  void carregar();
  return () => {
    ativa = false;
    operacoes.desmontar();
    vinculos.desmontar();
    consulta += 1;
    raiz.replaceChildren();
  };
}
