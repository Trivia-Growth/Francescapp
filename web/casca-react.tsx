import { createRef, type ComponentProps, type ReactElement, useEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { PacienteLista } from '../packages/contracts/src/cadastro.js';
import { lerRotaFicha, type RotaFicha } from './ficha-paciente.js';
import { TelaHomeProfissional, type ServicoHome } from './home-profissional.js';
import { LimiteErroPainel } from './limite-erro-painel.js';
import { LinhasCarteira } from './linhas-carteira.js';
import { TelaRegrasAtendimento } from './regras-atendimento.js';
import type { ServicoRegrasAtendimento } from './servico-regras-atendimento-http.js';
import { type ComandoGaveta, type EstadoNavegacao, NavegacaoCasca } from './navegacao-casca.js';

type Navegacao = ComponentProps<typeof NavegacaoCasca>;
type Carteira = { raiz: HTMLElement; abrir: (paciente: PacienteLista) => void };

type Rota =
  | { tipo: 'ficha'; ficha: RotaFicha }
  | { tipo: 'administracao'; area: string }
  | { tipo: 'home' | 'regras' | 'carteira' };

type Vista =
  | {
      tipo: 'home';
      destino: HTMLElement;
      servico: ServicoHome;
      acessoPerdido: (erro: unknown) => void;
    }
  | { tipo: 'regras'; destino: HTMLElement; servico: ServicoRegrasAtendimento }
  | {
      tipo: 'administracao' | 'ficha';
      destino: HTMLElement;
      chave: string;
      tela: ReactElement;
      aoTentarNovamente: () => void;
    };

let enderecoTratado = '';

export function lerRota(hash = window.location.hash): Rota {
  const ficha = lerRotaFicha(hash);
  if (ficha) return { tipo: 'ficha', ficha };
  const area = /^#administracao\/([a-z-]{1,32})$/.exec(hash)?.[1];
  if (area) return { tipo: 'administracao', area };
  if (hash === '#regras') return { tipo: 'regras' };
  return { tipo: hash === '' || hash === '#home' ? 'home' : 'carteira' };
}

export function gravarRota(hash: string, acao: 'push' | 'replace'): void {
  const destino = hash === '#home' ? '' : hash;
  const { pathname, search } = window.location;
  window.history[`${acao}State`](window.history.state, '', `${pathname}${search}${destino}`);
  enderecoTratado = window.location.href;
}

function conteudoDaVista(vista: Vista): ReactElement {
  switch (vista.tipo) {
    case 'home':
      return (
        <TelaHomeProfissional
          servico={vista.servico}
          acessoPerdido={vista.acessoPerdido}
          nivelTitulo={2}
        />
      );
    case 'regras':
      return <TelaRegrasAtendimento servico={vista.servico} />;
    case 'administracao':
    case 'ficha':
      return (
        <LimiteErroPainel
          key={`${vista.tipo}:${vista.chave}`}
          aoTentarNovamente={vista.aoTentarNovamente}
        >
          {vista.tela}
        </LimiteErroPainel>
      );
  }
}

function Casca({
  vista,
  aoHistorico,
  navegacao,
  carteira,
}: {
  vista: Vista | null;
  aoHistorico: () => void;
  navegacao: Navegacao;
  carteira: Carteira & { pacientes: readonly PacienteLista[] };
}) {
  useEffect(() => {
    const eventos = new window.AbortController();
    enderecoTratado = window.location.href;
    const voltarOuAvancar = () => {
      enderecoTratado = window.location.href;
      aoHistorico();
    };
    window.addEventListener('popstate', voltarOuAvancar, { signal: eventos.signal });
    window.addEventListener(
      'hashchange',
      () => {
        // Uma mesma navegação pode disparar popstate e hashchange, nesta ordem.
        if (window.location.href !== enderecoTratado) voltarOuAvancar();
      },
      { signal: eventos.signal },
    );
    return () => eventos.abort();
  }, [aoHistorico]);

  return (
    <>
      <NavegacaoCasca {...navegacao} />
      {createPortal(
        <LinhasCarteira pacientes={carteira.pacientes} aoAbrir={carteira.abrir} />,
        carteira.raiz,
      )}
      {vista ? createPortal(conteudoDaVista(vista), vista.destino) : null}
    </>
  );
}

/** Durante a transição, as vistas convertidas são renderizadas dentro dos
 * contêineres existentes, preservando os pontos de foco e a montagem do HTML. */
export function iniciarCasca(
  raiz: HTMLElement,
  aoHistorico: () => void,
  opcoes: Omit<Navegacao, 'comando' | 'estado'>,
  carteira: Carteira,
) {
  const arvore = createRoot(raiz);
  const comando = createRef<ComandoGaveta>();
  let encerrada = false;
  let vista: Vista | null = null;
  let pacientes: readonly PacienteLista[] = [];
  let estado: EstadoNavegacao = {
    visivel: false,
    destino: 'home',
    home: false,
    administracao: false,
    perfil: '',
    pessoa: '',
    area: '',
    busca: null,
    avisos: null,
  };
  const atualizar = () => {
    if (!encerrada)
      flushSync(() =>
        arvore.render(
          <Casca
            vista={vista}
            aoHistorico={aoHistorico}
            navegacao={{ ...opcoes, estado, comando }}
            carteira={{ ...carteira, pacientes }}
          />,
        ),
      );
  };
  atualizar();
  return {
    desenhar(proxima: Vista | null) {
      vista = proxima;
      atualizar();
    },
    fecharVista(tipo: Vista['tipo']) {
      if (vista?.tipo !== tipo) return;
      vista = null;
      atualizar();
    },
    atualizarNavegacao(dados: Partial<EstadoNavegacao>) {
      estado = { ...estado, ...dados };
      atualizar();
    },
    atualizarLista(itens: readonly PacienteLista[]) {
      pacientes = itens;
      atualizar();
    },
    fecharGaveta() {
      flushSync(() => comando.current?.fechar());
    },
    encerrar() {
      if (encerrada) return;
      encerrada = true;
      arvore.unmount();
    },
  };
}
