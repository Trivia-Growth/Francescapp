import { montarVinculoAgenda } from './agenda-vinculo.js';
import { montarOperacoesAgenda } from './agenda-operacoes.js';

type Compromisso = { id: string; inicio: string; fim: string; titulo: string; etag?: string };

export function montarAgendaIndividual(
  raiz: HTMLElement,
  sessaoId: string,
  usuarioId: string,
  listarPacientes: (
    cursor?: string,
  ) => Promise<{ itens: readonly { id: string; nome: string }[]; proximo_cursor: string | null }>,
): () => void {
  let ativa = true;
  let consulta = 0;
  let suspensa = true;
  const marcadorDesconexao = `ffcm-agenda-desconexao-incerta:${usuarioId}`;
  type PedidoDesconexao = { operacao_id: string; versao: string };
  let pedidoDesconexao: PedidoDesconexao | null = null;
  let armazenamentoDisponivel = true;
  try {
    const salvo = localStorage.getItem(marcadorDesconexao);
    if (salvo) {
      const valor: unknown = JSON.parse(salvo);
      if (
        !valor ||
        typeof valor !== 'object' ||
        !('operacao_id' in valor) ||
        typeof valor.operacao_id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(valor.operacao_id) ||
        !('versao' in valor) ||
        typeof valor.versao !== 'string' ||
        !/^\d{1,20}$/.test(valor.versao)
      )
        throw new Error();
      pedidoDesconexao = { operacao_id: valor.operacao_id, versao: valor.versao };
    }
  } catch {
    armazenamentoDisponivel = false;
  }
  let versaoConexao: string | null = null;
  let autorizacaoDesconexao: string | null = null;
  let operacaoConexao: string | null = null;
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
  const desconectar = document.createElement('button');
  desconectar.type = 'button';
  desconectar.className = 'button-secondary';
  desconectar.textContent = 'Desconectar agenda Google';
  const reconciliarDesconexao = document.createElement('button');
  reconciliarDesconexao.type = 'button';
  reconciliarDesconexao.className = 'button-secondary';
  reconciliarDesconexao.textContent = 'Verificar desconexão';
  reconciliarDesconexao.hidden = true;
  const cancelarDesconexao = document.createElement('button');
  cancelarDesconexao.type = 'button';
  cancelarDesconexao.className = 'button-secondary';
  cancelarDesconexao.textContent = 'Cancelar tentativa de desconexão';
  cancelarDesconexao.hidden = true;
  const acoes = document.createElement('div');
  acoes.className = 'agenda-acoes';
  acoes.append(atualizar, conectar, desconectar, reconciliarDesconexao, cancelarDesconexao);
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
  const vinculos = montarVinculoAgenda(
    operacoesRaiz,
    cabecalhos,
    listarPacientes,
    () => void carregar(),
  );
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
      const estadosVinculo = new Map<string, HTMLElement>();
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
        const estadoVinculo = document.createElement('span');
        estadoVinculo.textContent = 'Consultando vínculo…';
        estadosVinculo.set(item.id, estadoVinculo);
        linha.append(nome, horario, estadoVinculo);
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
      for (let indice = 0; indice < itens.length; indice += 250) {
        const lote = itens.slice(indice, indice + 250).map((item) => item.id);
        try {
          const headers = cabecalhos();
          headers.set('Content-Type', 'application/json');
          const respostaVinculos = await fetch('/api/agenda/google/vinculos/consulta', {
            method: 'POST',
            headers,
            body: JSON.stringify({ eventos_ids: lote }),
            credentials: 'same-origin',
            cache: 'no-store',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(20000),
          });
          if (!respostaVinculos.ok) throw new Error();
          const dados: unknown = await respostaVinculos.json();
          if (
            !dados ||
            typeof dados !== 'object' ||
            !('dados' in dados) ||
            !Array.isArray(dados.dados) ||
            !dados.dados.every(
              (v: unknown) =>
                v &&
                typeof v === 'object' &&
                'evento_id' in v &&
                typeof v.evento_id === 'string' &&
                lote.includes(v.evento_id) &&
                'paciente_id' in v &&
                typeof v.paciente_id === 'string' &&
                'vinculo_id' in v &&
                typeof v.vinculo_id === 'string' &&
                'nome' in v &&
                typeof v.nome === 'string' &&
                v.nome.length > 0,
            )
          )
            throw new Error();
          if (!ativa || versao !== consulta) return;
          const encontrados = new Map<
            string,
            { nome: string; paciente_id: string; vinculo_id: string }
          >(
            dados.dados.map(
              (v: { evento_id: string; nome: string; paciente_id: string; vinculo_id: string }) => [
                v.evento_id,
                v,
              ],
            ),
          );
          for (const id of lote) {
            const destino = estadosVinculo.get(id);
            if (!destino) continue;
            const vinculo = encontrados.get(id);
            if (!vinculo) {
              destino.textContent = 'Vínculo não disponível';
              continue;
            }
            destino.textContent = `Paciente: ${vinculo.nome}`;
            const retirar = document.createElement('button');
            retirar.type = 'button';
            retirar.className = 'button-secondary';
            retirar.textContent = 'Retirar vínculo';
            retirar.setAttribute('aria-label', `Retirar vínculo com ${vinculo.nome}`);
            retirar.addEventListener('click', async () => {
              if (
                !window.confirm(
                  `Retirar o vínculo com ${vinculo.nome}? O compromisso permanecerá no Google Calendar.`,
                )
              )
                return;
              retirar.disabled = true;
              destino.textContent = 'Retirando vínculo…';
              try {
                const headers = cabecalhos();
                headers.set('Content-Type', 'application/json');
                const resposta = await fetch('/api/agenda/google/vinculos/retirar', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    evento_id: id,
                    paciente_id: vinculo.paciente_id,
                    vinculo_id: vinculo.vinculo_id,
                  }),
                  credentials: 'same-origin',
                  cache: 'no-store',
                  redirect: 'error',
                  referrerPolicy: 'no-referrer',
                  signal: AbortSignal.timeout(20000),
                });
                if (!resposta.ok) throw new Error();
                const resultado: unknown = await resposta.json();
                if (!ativa || versao !== consulta) return;
                if (
                  !resultado ||
                  typeof resultado !== 'object' ||
                  !('estado' in resultado) ||
                  (resultado.estado !== 'retirado' && resultado.estado !== 'nao_encontrado')
                )
                  throw new Error();
                destino.textContent =
                  resultado.estado === 'retirado'
                    ? 'Vínculo retirado. O compromisso permanece na agenda.'
                    : 'Vínculo não encontrado. Atualize a agenda.';
                retirar.remove();
              } catch {
                if (ativa && versao === consulta) {
                  destino.textContent =
                    'Não foi possível confirmar a retirada. Tente novamente ou atualize a agenda.';
                  retirar.disabled = false;
                }
              }
            });
            destino.after(retirar);
          }
        } catch {
          if (!ativa || versao !== consulta) return;
          for (const id of lote) {
            const destino = estadosVinculo.get(id);
            if (destino) destino.textContent = 'Não foi possível consultar o vínculo';
          }
        }
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
  const ocultarDados = () => {
    if (document.hidden) {
      consulta += 1;
      lista.replaceChildren();
      vinculos.ocultar();
    } else if (ativa && !suspensa) void carregar();
  };
  document.addEventListener('visibilitychange', ocultarDados);
  atualizar.addEventListener('click', () => void carregar());
  function aplicarConexao(estado: 'conectado' | 'desconectado', versao: string): void {
    versaoConexao = versao;
    suspensa = estado !== 'conectado';
    conectar.disabled = estado === 'conectado';
    desconectar.disabled = estado !== 'conectado';
    atualizar.disabled = estado !== 'conectado';
    operacoesRaiz.hidden = estado !== 'conectado';
    if (estado === 'conectado') void carregar();
  }
  async function verificarConexao(): Promise<void> {
    try {
      const resposta = await fetch('/api/agenda/google/conexao', {
        headers: cabecalhos(),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!ativa) return;
      if (
        !dados ||
        typeof dados !== 'object' ||
        !('estado' in dados) ||
        (dados.estado !== 'conectado' && dados.estado !== 'desconectado') ||
        !('versao' in dados) ||
        typeof dados.versao !== 'string' ||
        !/^\d{1,20}$/.test(dados.versao) ||
        !('operacao_id' in dados) ||
        typeof dados.operacao_id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(dados.operacao_id) ||
        !('autorizacao' in dados) ||
        typeof dados.autorizacao !== 'string' ||
        dados.autorizacao.length === 0 ||
        dados.autorizacao.length > 8192
      )
        throw new Error();
      operacaoConexao = dados.operacao_id;
      autorizacaoDesconexao = dados.autorizacao;
      aplicarConexao(dados.estado, dados.versao);
      if (dados.estado === 'desconectado')
        status.textContent = 'Agenda desconectada. Autorize a conexão para consultá-la.';
    } catch {
      if (ativa)
        status.textContent =
          'Não foi possível verificar a conexão. Recarregue a página para tentar novamente.';
    }
  }
  async function enviarDesconexao(): Promise<void> {
    if (!pedidoDesconexao || !autorizacaoDesconexao) return;
    reconciliarDesconexao.disabled = true;
    status.textContent = 'Verificando desconexão…';
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/desconectar', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...pedidoDesconexao, autorizacao: autorizacaoDesconexao }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!ativa) return;
      if (
        !dados ||
        typeof dados !== 'object' ||
        !('estado' in dados) ||
        (dados.estado !== 'desconectado' && dados.estado !== 'conflito') ||
        !('conexao_atual' in dados) ||
        (dados.conexao_atual !== 'conectado' && dados.conexao_atual !== 'desconectado') ||
        !('versao_atual' in dados) ||
        typeof dados.versao_atual !== 'string' ||
        !/^\d{1,20}$/.test(dados.versao_atual) ||
        !('revogacao_google' in dados) ||
        dados.revogacao_google !== 'nao_comprovada'
      )
        throw new Error();
      localStorage.removeItem(marcadorDesconexao);
      pedidoDesconexao = null;
      reconciliarDesconexao.hidden = true;
      cancelarDesconexao.hidden = true;
      await verificarConexao();
      status.textContent =
        dados.estado === 'conflito'
          ? 'A conexão mudou antes da desconexão. Confira a situação atual.'
          : 'Desconexão no aplicativo confirmada. A revogação no Google não foi comprovada; pendências anteriores permanecem.';
    } catch {
      if (ativa) {
        reconciliarDesconexao.hidden = false;
        status.textContent =
          'Não foi possível confirmar a desconexão. Use “Verificar desconexão” para consultar o resultado da mesma operação.';
      }
    } finally {
      if (ativa) reconciliarDesconexao.disabled = false;
    }
  }
  desconectar.addEventListener('click', () => {
    if (
      !versaoConexao ||
      !operacaoConexao ||
      !autorizacaoDesconexao ||
      !armazenamentoDisponivel ||
      !window.confirm(
        'Desconectar a agenda Google? Será necessário autorizar novamente para voltar a usá-la.',
      )
    )
      return;
    const pedido = { operacao_id: operacaoConexao, versao: versaoConexao };
    try {
      localStorage.setItem(marcadorDesconexao, JSON.stringify(pedido));
    } catch {
      status.textContent = 'Não foi possível preparar a desconexão com segurança.';
      return;
    }
    pedidoDesconexao = pedido;
    suspensa = true;
    conectar.disabled = desconectar.disabled = atualizar.disabled = true;
    consulta += 1;
    lista.replaceChildren();
    vinculos.ocultar();
    operacoesRaiz.hidden = true;
    void enviarDesconexao();
  });
  reconciliarDesconexao.addEventListener('click', async () => {
    if (!pedidoDesconexao) return;
    reconciliarDesconexao.disabled = true;
    status.textContent = 'Consultando recibo…';
    try {
      const url = new URL('/api/agenda/google/desconexao/recibo', window.location.origin);
      url.searchParams.set('operacao_id', pedidoDesconexao.operacao_id);
      const resposta = await fetch(url, {
        headers: cabecalhos(),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!ativa) return;
      if (!dados || typeof dados !== 'object' || !('estado' in dados)) throw new Error();
      if (dados.estado === 'desconhecido') {
        cancelarDesconexao.hidden = false;
        status.textContent =
          'O recibo ainda não está disponível. Você pode verificar mais tarde ou cancelar a tentativa de desconexão.';
        return;
      }
      if (
        (dados.estado !== 'desconectado' &&
          dados.estado !== 'conflito' &&
          dados.estado !== 'cancelada') ||
        !('conexao_atual' in dados) ||
        (dados.conexao_atual !== 'conectado' && dados.conexao_atual !== 'desconectado') ||
        !('versao_atual' in dados) ||
        typeof dados.versao_atual !== 'string' ||
        !/^\d{1,20}$/.test(dados.versao_atual) ||
        !('revogacao_google' in dados) ||
        dados.revogacao_google !== 'nao_comprovada'
      )
        throw new Error();
      localStorage.removeItem(marcadorDesconexao);
      pedidoDesconexao = null;
      reconciliarDesconexao.hidden = true;
      cancelarDesconexao.hidden = true;
      await verificarConexao();
      status.textContent =
        dados.estado === 'cancelada'
          ? 'Tentativa de desconexão cancelada.'
          : dados.estado === 'conflito'
            ? 'A conexão mudou antes da desconexão. Confira a situação atual.'
            : 'Desconexão no aplicativo confirmada. A revogação no Google não foi comprovada; pendências anteriores permanecem.';
    } catch {
      if (ativa)
        status.textContent = 'Não foi possível consultar o recibo. Tente novamente mais tarde.';
    } finally {
      if (ativa) reconciliarDesconexao.disabled = false;
    }
  });
  cancelarDesconexao.addEventListener('click', async () => {
    if (!pedidoDesconexao || !window.confirm('Cancelar a tentativa pendente de desconexão?'))
      return;
    cancelarDesconexao.disabled = reconciliarDesconexao.disabled = true;
    status.textContent = 'Cancelando tentativa…';
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/desconexao/cancelar', {
        method: 'POST',
        headers,
        body: JSON.stringify(pedidoDesconexao),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!ativa) return;
      if (
        !dados ||
        typeof dados !== 'object' ||
        !('estado' in dados) ||
        !['cancelada', 'desconectado', 'conflito'].includes(String(dados.estado)) ||
        !('conexao_atual' in dados) ||
        (dados.conexao_atual !== 'conectado' && dados.conexao_atual !== 'desconectado') ||
        !('versao_atual' in dados) ||
        typeof dados.versao_atual !== 'string' ||
        !/^\d{1,20}$/.test(dados.versao_atual) ||
        !('revogacao_google' in dados) ||
        dados.revogacao_google !== 'nao_comprovada'
      )
        throw new Error();
      localStorage.removeItem(marcadorDesconexao);
      pedidoDesconexao = null;
      cancelarDesconexao.hidden = reconciliarDesconexao.hidden = true;
      await verificarConexao();
      status.textContent =
        dados.estado === 'cancelada'
          ? 'Tentativa de desconexão cancelada.'
          : dados.estado === 'desconectado'
            ? 'A desconexão já havia sido confirmada no aplicativo. A revogação no Google não foi comprovada.'
            : 'A conexão mudou; confira a situação atual.';
    } catch {
      if (ativa)
        status.textContent =
          'Não foi possível confirmar o cancelamento. Tente novamente ou consulte o recibo.';
    } finally {
      if (ativa) cancelarDesconexao.disabled = reconciliarDesconexao.disabled = false;
    }
  });
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
      if (ativa && !pedidoDesconexao) conectar.disabled = false;
    }
  });
  conectar.disabled = desconectar.disabled = atualizar.disabled = true;
  operacoesRaiz.hidden = true;
  if (!armazenamentoDisponivel) {
    status.textContent =
      'Não foi possível recuperar a situação da desconexão. Procure suporte antes de continuar.';
  } else if (pedidoDesconexao) {
    reconciliarDesconexao.hidden = false;
    status.textContent =
      'Uma desconexão não foi confirmada. Verifique o resultado antes de continuar.';
  } else void verificarConexao();
  return () => {
    ativa = false;
    document.removeEventListener('visibilitychange', ocultarDados);
    operacoes.desmontar();
    vinculos.desmontar();
    consulta += 1;
    raiz.replaceChildren();
  };
}
