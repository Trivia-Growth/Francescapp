/** Minha agenda (compromissos Google, vínculo com paciente e realização do cuidado),
 *  reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 *  Migra na MESMA leva que seus três corpos — `agenda-operacoes.tsx`,
 *  `agenda-vinculo.tsx` e `realizacao-compromisso.tsx` — porque os três só chegam ao
 *  produto por aqui (achado de arquitetura confirmado em `tasks.md`: nenhum dos três tem
 *  outro consumidor). Migrar um dos quatro isoladamente deixaria o hospedeiro imperativo
 *  por baixo, que é a direção que já custou um `NotFoundError` de um dia inteiro nesta
 *  migração: ilha React viva, contêiner esvaziado por fora. Aqui não há fora — hospedeiro
 *  e corpos vivem na MESMA raiz React, montados por `ilha()` uma única vez.
 *
 *  O contrato exportado NÃO muda: `montarAgendaIndividual(raiz, sessaoId, usuarioId,
 *  listarPacientes)` continua devolvendo a função de desmontagem, porque quem chama é
 *  `web/main.ts`, ainda imperativo.
 *
 *  VIS-012: a versão imperativa guardava `ativa` e testava `if (!ativa) return` em cada
 *  retomada de `await`. Aqui não sobra nenhuma — desmontar a ilha cancela os efeitos — mas
 *  o contador `consulta` continua existindo: ele não protege contra desmontagem, protege
 *  contra uma consulta mais antiga sobrescrever uma mais nova (clique duplo em "Atualizar",
 *  ocultar e voltar a mostrar a aba), uma corrida real que a migração não elimina. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OperacoesAgenda, type PunhoOperacoes } from './agenda-operacoes.js';
import { VinculoAgenda, type PunhoVinculo } from './agenda-vinculo.js';
import { Botao } from './componentes/ui/botao.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { confirmar } from './confirmacao.js';
import { ilha } from './ponte/ilha.js';
import {
  consultarRealizacoes,
  descreverRealizacao,
  RealizacaoAgenda,
  type PunhoRealizacao,
} from './realizacao-compromisso.js';
import { criarServicoRealizacaoCompromissoHttp } from './servico-realizacao-compromisso-http.js';
import type { RealizacaoCompromisso } from '../packages/contracts/src/realizacao-compromisso.ts';

type Compromisso = { id: string; inicio: string; fim: string; titulo: string; etag?: string };
type PaginaPacientes = {
  itens: readonly { id: string; nome: string }[];
  proximo_cursor: string | null;
};

type EstadoConexao =
  | { fase: 'verificando' }
  | {
      fase: 'pronta';
      estado: 'conectado' | 'desconectado';
      versao: string;
      operacaoId: string;
      autorizacao: string;
    };

type FaseLista =
  | { fase: 'ociosa' }
  | { fase: 'carregando' }
  | { fase: 'pronto'; itens: readonly Compromisso[] }
  | { fase: 'erro' };

type InfoVinculo = { nome: string; paciente_id: string; vinculo_id: string };
type EstadoVinculoItem =
  | { fase: 'consultando' }
  | { fase: 'erro' }
  | { fase: 'pronto'; info: InfoVinculo | null }
  | { fase: 'retirando'; info: InfoVinculo }
  | { fase: 'retirado' }
  | { fase: 'retirada-erro'; info: InfoVinculo };

type PedidoDesconexao = { operacao_id: string; versao: string };

function instanteFim(fim: string): string | null {
  // O Google devolve `fim` como instante ou como data (evento de dia inteiro, fim
  // exclusivo). A derivação de "realização não confirmada" só precisa saber se já
  // terminou.
  const texto = /^\d{4}-\d{2}-\d{2}$/.test(fim) ? `${fim}T00:00:00Z` : fim;
  const instante = new Date(texto);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

function formatarHorario(item: Compromisso): string {
  const data = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  const dia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' });
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.inicio) && /^\d{4}-\d{2}-\d{2}$/.test(item.fim)) {
    const inicio = new Date(`${item.inicio}T00:00:00Z`);
    const ultimoDia = new Date(new Date(`${item.fim}T00:00:00Z`).getTime() - 86400000);
    return inicio.getTime() === ultimoDia.getTime()
      ? `${dia.format(inicio)} · Dia inteiro`
      : `${dia.format(inicio)} – ${dia.format(ultimoDia)} · Dias inteiros`;
  }
  return `${data.format(new Date(item.inicio))} – ${data.format(new Date(item.fim))} · Horário de São Paulo`;
}

function lerPedidoDesconexao(usuarioId: string): {
  pedido: PedidoDesconexao | null;
  armazenamentoDisponivel: boolean;
} {
  const marcador = `ffcm-agenda-desconexao-incerta:${usuarioId}`;
  try {
    const salvo = localStorage.getItem(marcador);
    if (!salvo) return { pedido: null, armazenamentoDisponivel: true };
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
    return {
      pedido: { operacao_id: valor.operacao_id, versao: valor.versao },
      armazenamentoDisponivel: true,
    };
  } catch {
    return { pedido: null, armazenamentoDisponivel: false };
  }
}

function lerRetornoConsentimento(): boolean {
  const retornos = new URL(window.location.href).searchParams.getAll('agenda');
  return retornos.length === 1 && retornos[0] === 'autorizar-novamente';
}

type PropsAgendaIndividual = {
  sessaoId: string;
  usuarioId: string;
  listarPacientes: (cursor?: string) => Promise<PaginaPacientes>;
};

function AgendaIndividual({ sessaoId, usuarioId, listarPacientes }: PropsAgendaIndividual) {
  const marcadorDesconexao = `ffcm-agenda-desconexao-incerta:${usuarioId}`;
  const [{ pedido: pedidoInicial, armazenamentoDisponivel }] = useState(() =>
    lerPedidoDesconexao(usuarioId),
  );
  const [mostrarRetornoConsentimento] = useState(lerRetornoConsentimento);

  const [conexao, definirConexao] = useState<EstadoConexao>({ fase: 'verificando' });
  const [pedidoDesconexao, definirPedidoDesconexao] = useState<PedidoDesconexao | null>(
    pedidoInicial,
  );
  const [status, definirStatus] = useState('');
  const [lista, definirLista] = useState<FaseLista>({ fase: 'ociosa' });
  const [vinculoPorId, definirVinculoPorId] = useState<ReadonlyMap<string, EstadoVinculoItem>>(
    new Map(),
  );
  const [realizacaoFasePorId, definirRealizacaoFasePorId] = useState<
    ReadonlyMap<string, 'consultando' | 'pronto' | 'erro'>
  >(new Map());
  const [situacoes, definirSituacoes] = useState<ReadonlyMap<string, RealizacaoCompromisso>>(
    new Map(),
  );

  const [reconciliarVisivel, definirReconciliarVisivel] = useState(!!pedidoInicial);
  const [reconciliarDesligado, definirReconciliarDesligado] = useState(false);
  const [cancelarVisivel, definirCancelarVisivel] = useState(false);
  const [cancelarDesligado, definirCancelarDesligado] = useState(false);
  const [desconectando, definirDesconectando] = useState(false);
  const [conectando, definirConectando] = useState(false);

  const consultaRef = useRef(0);
  const conexaoRef = useRef<EstadoConexao>({ fase: 'verificando' });
  const pedidoDesconexaoRef = useRef<PedidoDesconexao | null>(pedidoInicial);
  const operacoesPunhoRef = useRef<PunhoOperacoes | null>(null);
  const vinculoPunhoRef = useRef<PunhoVinculo | null>(null);
  const realizacaoPunhoRef = useRef<PunhoRealizacao | null>(null);

  const cabecalhos = useCallback((): Headers => {
    const fluxo = sessionStorage.getItem('fluxo-google');
    if (
      sessionStorage.getItem('modo-acesso') !== 'google' ||
      !fluxo ||
      !/^[A-Za-z0-9_-]{22}$/.test(fluxo)
    )
      throw new Error();
    return new Headers({ Accept: 'application/json', 'x-sessao': sessaoId, 'x-fluxo': fluxo });
  }, [sessaoId]);

  const servicoRealizacao = useMemo(
    () => criarServicoRealizacaoCompromissoHttp(cabecalhos),
    [cabecalhos],
  );

  const carregar = useCallback(async (): Promise<void> => {
    const versao = ++consultaRef.current;
    definirLista({ fase: 'carregando' });
    definirStatus('Consultando agenda…');
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
      if (versao !== consultaRef.current) return;
      const itens = corpo.dados as Compromisso[];
      definirLista({ fase: 'pronto', itens });
      definirVinculoPorId(new Map(itens.map((item) => [item.id, { fase: 'consultando' }])));
      definirRealizacaoFasePorId(new Map(itens.map((item) => [item.id, 'consultando'])));
      definirStatus(
        itens.length
          ? `${itens.length} compromisso(s) no período.`
          : 'Nenhum compromisso nos próximos 30 dias.',
      );

      try {
        const registros = await consultarRealizacoes(
          servicoRealizacao,
          itens.map((item) => ({ evento_id: item.id, fim: instanteFim(item.fim) })),
        );
        if (versao !== consultaRef.current) return;
        definirSituacoes(registros);
        definirRealizacaoFasePorId(new Map(itens.map((item) => [item.id, 'pronto'])));
      } catch {
        if (versao !== consultaRef.current) return;
        definirRealizacaoFasePorId(new Map(itens.map((item) => [item.id, 'erro'])));
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
          if (versao !== consultaRef.current) return;
          const encontrados = new Map<string, InfoVinculo>(
            dados.dados.map((v: InfoVinculo & { evento_id: string }) => [v.evento_id, v]),
          );
          definirVinculoPorId((atual) => {
            const proximo = new Map(atual);
            for (const id of lote)
              proximo.set(id, { fase: 'pronto', info: encontrados.get(id) ?? null });
            return proximo;
          });
        } catch {
          if (versao !== consultaRef.current) return;
          definirVinculoPorId((atual) => {
            const proximo = new Map(atual);
            for (const id of lote) proximo.set(id, { fase: 'erro' });
            return proximo;
          });
        }
      }
    } catch {
      if (versao === consultaRef.current) {
        definirStatus(
          'Não foi possível consultar a agenda. Conecte sua conta Google ou tente atualizar novamente.',
        );
        definirLista({ fase: 'erro' });
      }
    }
  }, [cabecalhos, servicoRealizacao]);

  const aplicarConexao = useCallback(
    (
      estado: 'conectado' | 'desconectado',
      versao: string,
      operacaoId: string,
      autorizacao: string,
    ) => {
      const proxima: EstadoConexao = { fase: 'pronta', estado, versao, operacaoId, autorizacao };
      conexaoRef.current = proxima;
      definirConexao(proxima);
      if (estado === 'conectado') void carregar();
    },
    [carregar],
  );

  const verificarConexao = useCallback(async (): Promise<void> => {
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
      aplicarConexao(dados.estado, dados.versao, dados.operacao_id, dados.autorizacao);
      if (dados.estado === 'desconectado')
        definirStatus('Agenda desconectada. Autorize a conexão para consultá-la.');
    } catch {
      definirStatus(
        'Não foi possível verificar a conexão. Recarregue a página para tentar novamente.',
      );
    }
  }, [cabecalhos, aplicarConexao]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda uma única vez, na montagem — mesmo gatilho do bloco final do construtor imperativo. `armazenamentoDisponivel`/`pedidoInicial` vêm do `useState` inicial e não mudam depois; `verificarConexao` muda de identidade por causa de `cabecalhos`, e repeti-la recriaria uma segunda consulta que a versão imperativa nunca teve.
  useEffect(() => {
    if (!armazenamentoDisponivel) {
      definirStatus(
        'Não foi possível recuperar a situação da desconexão. Procure suporte antes de continuar.',
      );
    } else if (pedidoInicial) {
      definirStatus('Uma desconexão não foi confirmada. Verifique o resultado antes de continuar.');
    } else {
      void verificarConexao();
    }
  }, []);

  useEffect(() => {
    function ocultarDados(): void {
      if (document.hidden) {
        consultaRef.current += 1;
        definirLista({ fase: 'ociosa' });
        vinculoPunhoRef.current?.ocultar();
        realizacaoPunhoRef.current?.ocultar();
      } else if (
        conexaoRef.current.fase === 'pronta' &&
        conexaoRef.current.estado === 'conectado'
      ) {
        void carregar();
      }
    }
    document.addEventListener('visibilitychange', ocultarDados);
    return () => document.removeEventListener('visibilitychange', ocultarDados);
  }, [carregar]);

  const enviarDesconexao = useCallback(async (): Promise<void> => {
    const pedido = pedidoDesconexaoRef.current;
    const autorizacao =
      conexaoRef.current.fase === 'pronta' ? conexaoRef.current.autorizacao : null;
    if (!pedido || !autorizacao) return;
    definirReconciliarDesligado(true);
    definirStatus('Verificando desconexão…');
    definirDesconectando(true);
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/desconectar', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...pedido, autorizacao }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
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
      pedidoDesconexaoRef.current = null;
      definirPedidoDesconexao(null);
      definirReconciliarVisivel(false);
      definirCancelarVisivel(false);
      await verificarConexao();
      definirStatus(
        dados.estado === 'conflito'
          ? 'A conexão mudou antes da desconexão. Confira a situação atual.'
          : 'Desconexão no aplicativo confirmada. A revogação no Google não foi comprovada; pendências anteriores permanecem.',
      );
    } catch {
      definirReconciliarVisivel(true);
      definirStatus(
        'Não foi possível confirmar a desconexão. Use “Verificar desconexão” para consultar o resultado da mesma operação.',
      );
    } finally {
      definirDesconectando(false);
      definirReconciliarDesligado(false);
    }
  }, [cabecalhos, marcadorDesconexao, verificarConexao]);

  async function aoReconciliarDesconexao(): Promise<void> {
    const pedido = pedidoDesconexaoRef.current;
    if (!pedido) return;
    definirReconciliarDesligado(true);
    definirStatus('Consultando recibo…');
    try {
      const url = new URL('/api/agenda/google/desconexao/recibo', window.location.origin);
      url.searchParams.set('operacao_id', pedido.operacao_id);
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
      if (!dados || typeof dados !== 'object' || !('estado' in dados)) throw new Error();
      if (dados.estado === 'desconhecido') {
        definirCancelarVisivel(true);
        definirStatus(
          'O recibo ainda não está disponível. Você pode verificar mais tarde ou cancelar a tentativa de desconexão.',
        );
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
      pedidoDesconexaoRef.current = null;
      definirPedidoDesconexao(null);
      definirReconciliarVisivel(false);
      definirCancelarVisivel(false);
      await verificarConexao();
      definirStatus(
        dados.estado === 'cancelada'
          ? 'Tentativa de desconexão cancelada.'
          : dados.estado === 'conflito'
            ? 'A conexão mudou antes da desconexão. Confira a situação atual.'
            : 'Desconexão no aplicativo confirmada. A revogação no Google não foi comprovada; pendências anteriores permanecem.',
      );
    } catch {
      definirStatus('Não foi possível consultar o recibo. Tente novamente mais tarde.');
    } finally {
      definirReconciliarDesligado(false);
    }
  }

  async function aoCancelarDesconexao(): Promise<void> {
    const pedido = pedidoDesconexaoRef.current;
    if (!pedido) return;
    if (
      !(await confirmar({
        titulo: 'Cancelar a tentativa pendente de desconexão?',
        detalhe: 'A agenda continua conectada e a desconexão não será concluída.',
        acao: 'Cancelar a desconexão',
        cancelar: 'Manter a tentativa',
      }))
    )
      return;
    if (!pedidoDesconexaoRef.current) return;
    definirCancelarDesligado(true);
    definirReconciliarDesligado(true);
    definirStatus('Cancelando tentativa…');
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/desconexao/cancelar', {
        method: 'POST',
        headers,
        body: JSON.stringify(pedido),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
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
      pedidoDesconexaoRef.current = null;
      definirPedidoDesconexao(null);
      definirCancelarVisivel(false);
      definirReconciliarVisivel(false);
      await verificarConexao();
      definirStatus(
        dados.estado === 'cancelada'
          ? 'Tentativa de desconexão cancelada.'
          : dados.estado === 'desconectado'
            ? 'A desconexão já havia sido confirmada no aplicativo. A revogação no Google não foi comprovada.'
            : 'A conexão mudou; confira a situação atual.',
      );
    } catch {
      definirStatus(
        'Não foi possível confirmar o cancelamento. Tente novamente ou consulte o recibo.',
      );
    } finally {
      definirCancelarDesligado(false);
      definirReconciliarDesligado(false);
    }
  }

  async function aoDesconectar(): Promise<void> {
    if (conexao.fase !== 'pronta') return;
    if (
      !armazenamentoDisponivel ||
      !(await confirmar({
        titulo: 'Desconectar a agenda Google?',
        detalhe:
          'Os compromissos deixam de ser sincronizados e será necessário autorizar o Google de novo para voltar a usá-la.',
        acao: 'Desconectar a agenda',
        cancelar: 'Manter conectada',
      }))
    )
      return;
    const pedido = { operacao_id: conexao.operacaoId, versao: conexao.versao };
    try {
      localStorage.setItem(marcadorDesconexao, JSON.stringify(pedido));
    } catch {
      definirStatus('Não foi possível preparar a desconexão com segurança.');
      return;
    }
    pedidoDesconexaoRef.current = pedido;
    definirPedidoDesconexao(pedido);
    consultaRef.current += 1;
    definirLista({ fase: 'ociosa' });
    vinculoPunhoRef.current?.ocultar();
    realizacaoPunhoRef.current?.ocultar();
    void enviarDesconexao();
  }

  async function aoConectar(): Promise<void> {
    definirConectando(true);
    definirStatus('Preparando conexão com Google…');
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
      window.location.assign(destino.href);
    } catch {
      definirStatus(
        'Não foi possível iniciar a conexão. Tente novamente quando o serviço estiver disponível.',
      );
      definirConectando(false);
    }
  }

  async function aoRetirarVinculo(id: string, info: InfoVinculo): Promise<void> {
    if (
      !(await confirmar({
        titulo: `Retirar o vínculo com ${info.nome}?`,
        detalhe:
          'O compromisso continua existindo no Google Calendar; ele apenas deixa de aparecer ligado a esta pessoa.',
        acao: 'Retirar vínculo',
        cancelar: 'Manter vínculo',
      }))
    )
      return;
    definirVinculoPorId((atual) => new Map(atual).set(id, { fase: 'retirando', info }));
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/vinculos/retirar', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          evento_id: id,
          paciente_id: info.paciente_id,
          vinculo_id: info.vinculo_id,
        }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const resultado: unknown = await resposta.json();
      if (
        !resultado ||
        typeof resultado !== 'object' ||
        !('estado' in resultado) ||
        (resultado.estado !== 'retirado' && resultado.estado !== 'nao_encontrado')
      )
        throw new Error();
      definirVinculoPorId((atual) => new Map(atual).set(id, { fase: 'retirado' }));
    } catch {
      definirVinculoPorId((atual) => new Map(atual).set(id, { fase: 'retirada-erro', info }));
    }
  }

  const registrarOperacoes = useCallback((punho: PunhoOperacoes) => {
    operacoesPunhoRef.current = punho;
  }, []);
  const registrarVinculo = useCallback((punho: PunhoVinculo) => {
    vinculoPunhoRef.current = punho;
  }, []);
  const registrarRealizacao = useCallback((punho: PunhoRealizacao) => {
    realizacaoPunhoRef.current = punho;
  }, []);

  const conectado = conexao.fase === 'pronta' && conexao.estado === 'conectado';
  const carregandoLista = lista.fase === 'carregando';
  const itens = lista.fase === 'pronto' ? lista.itens : [];

  return (
    <div className="grid min-w-0 gap-4">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Minha agenda
      </h2>
      <p className="m-0">Consulte os compromissos da sua agenda Google para os próximos 30 dias.</p>
      {mostrarRetornoConsentimento ? (
        // biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as telas e as provas já usam.
        <p role="status" className="feedback m-0">
          A nova autorização da agenda não foi concluída: o Google não forneceu acesso para manter a
          conexão. Uma conexão anterior, se existir, foi preservada. Se a agenda estiver
          desconectada, use “Conectar agenda Google” para tentar autorizar novamente. Se persistir,
          peça ao administrador para conferir a configuração da integração.{' '}
          <a
            href="https://support.google.com/accounts/answer/13533235?hl=pt-BR"
            target="_blank"
            rel="noopener noreferrer"
          >
            Entenda as conexões da Conta Google
          </a>
          . Alterar ou remover acesso pode afetar outros acessos do projeto e não garante que uma
          nova autorização seja concluída.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Botao
          peso="secundario"
          disabled={!conectado || carregandoLista}
          aoAtivar={() => void carregar()}
        >
          Atualizar agenda
          {carregandoLista ? <span className="loading-indicator" aria-hidden="true" /> : null}
        </Botao>
        <Botao
          peso="secundario"
          disabled={conectado || conectando}
          aoAtivar={() => void aoConectar()}
        >
          Conectar agenda Google
        </Botao>
        <Botao
          peso="secundario"
          disabled={!conectado || desconectando}
          aoAtivar={() => void aoDesconectar()}
        >
          Desconectar agenda Google
        </Botao>
        {reconciliarVisivel ? (
          <Botao
            peso="secundario"
            disabled={reconciliarDesligado}
            aoAtivar={() => void aoReconciliarDesconexao()}
          >
            Verificar desconexão
          </Botao>
        ) : null}
        {cancelarVisivel ? (
          <Botao
            peso="secundario"
            disabled={cancelarDesligado}
            aoAtivar={() => void aoCancelarDesconexao()}
          >
            Cancelar tentativa de desconexão
          </Botao>
        ) : null}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p role="status" aria-live="polite" className="m-0">
        {status}
      </p>
      <div hidden={!conectado} className="grid min-w-0 gap-4">
        <OperacoesAgenda
          cabecalhos={cabecalhos}
          atualizar={() => void carregar()}
          usuarioId={usuarioId}
          registrar={registrarOperacoes}
        />
        <VinculoAgenda
          cabecalhos={cabecalhos}
          listar={listarPacientes}
          atualizado={() => void carregar()}
          registrar={registrarVinculo}
        />
        <RealizacaoAgenda
          servico={servicoRealizacao}
          aoRegistrar={(registros) => {
            definirSituacoes((atual) => {
              const proximo = new Map(atual);
              for (const registro of registros) proximo.set(registro.evento_id, registro);
              return proximo;
            });
            void carregar();
          }}
          registrar={registrarRealizacao}
        />
      </div>
      <Esqueleto ocupado={carregandoLista} className="min-w-0">
        <ul className="agenda-lista grid min-w-0 gap-3 list-none m-0 p-0">
          {itens.map((item) => {
            const horario = formatarHorario(item);
            const vinculo = vinculoPorId.get(item.id) ?? { fase: 'consultando' as const };
            const realizacaoFase = realizacaoFasePorId.get(item.id) ?? 'consultando';
            const textoRealizacao =
              realizacaoFase === 'consultando'
                ? 'Consultando situação…'
                : realizacaoFase === 'erro'
                  ? 'Não foi possível consultar a situação de realização'
                  : descreverRealizacao(situacoes.get(item.id));
            const textoVinculo =
              vinculo.fase === 'consultando'
                ? 'Consultando vínculo…'
                : vinculo.fase === 'erro'
                  ? 'Não foi possível consultar o vínculo'
                  : vinculo.fase === 'pronto'
                    ? vinculo.info
                      ? `Paciente: ${vinculo.info.nome}`
                      : 'Vínculo não disponível'
                    : vinculo.fase === 'retirando'
                      ? 'Retirando vínculo…'
                      : vinculo.fase === 'retirado'
                        ? 'Vínculo retirado. O compromisso permanece na agenda.'
                        : 'Não foi possível confirmar a retirada. Tente novamente ou atualize a agenda.';
            const vinculoRetirando = vinculo.fase === 'retirando';
            const infoParaRetirar =
              vinculo.fase === 'pronto' && vinculo.info
                ? vinculo.info
                : vinculo.fase === 'retirada-erro'
                  ? vinculo.info
                  : null;
            return (
              <li key={item.id} className="grid min-w-0 gap-2 border-b border-borda pb-3">
                <strong>{item.titulo}</strong>
                <span>{horario}</span>
                <span>{textoVinculo}</span>
                {infoParaRetirar ? (
                  <Botao
                    peso="secundario"
                    rotuloLeitura={`Retirar vínculo com ${infoParaRetirar.nome}`}
                    disabled={vinculoRetirando}
                    aoAtivar={() => void aoRetirarVinculo(item.id, infoParaRetirar)}
                  >
                    Retirar vínculo
                  </Botao>
                ) : null}
                <span className="agenda-realizacao">{textoRealizacao}</span>
                <Botao
                  peso="secundario"
                  rotuloLeitura={`Registrar realização do compromisso de ${horario}`}
                  aoAtivar={() =>
                    realizacaoPunhoRef.current?.abrir(item.id, horario, situacoes.get(item.id))
                  }
                >
                  Registrar realização
                </Botao>
                {item.etag ? (
                  <>
                    {!/^\d{4}-\d{2}-\d{2}$/.test(item.inicio) ? (
                      <Botao
                        peso="secundario"
                        rotuloLeitura={`Alterar compromisso de ${horario}`}
                        aoAtivar={() => operacoesPunhoRef.current?.editar(item)}
                      >
                        Alterar
                      </Botao>
                    ) : null}
                    <Botao
                      peso="secundario"
                      rotuloLeitura={`Cancelar compromisso de ${horario}`}
                      aoAtivar={() => operacoesPunhoRef.current?.cancelar(item)}
                    >
                      Cancelar compromisso
                    </Botao>
                  </>
                ) : null}
                <Botao
                  peso="secundario"
                  rotuloLeitura={`Vincular paciente ao compromisso de ${horario}`}
                  aoAtivar={() => vinculoPunhoRef.current?.abrir(item.id, horario)}
                >
                  Vincular paciente
                </Botao>
              </li>
            );
          })}
        </ul>
      </Esqueleto>
    </div>
  );
}

/** O mesmo contrato de sempre: `web/main.ts` chama `montarAgendaIndividual(raiz, …)` e
 *  desmonta com o retorno, sem saber que por dentro é React. */
export function montarAgendaIndividual(
  raiz: HTMLElement,
  sessaoId: string,
  usuarioId: string,
  listarPacientes: (cursor?: string) => Promise<PaginaPacientes>,
): () => void {
  return ilha(
    raiz,
    <AgendaIndividual
      sessaoId={sessaoId}
      usuarioId={usuarioId}
      listarPacientes={listarPacientes}
    />,
  );
}
