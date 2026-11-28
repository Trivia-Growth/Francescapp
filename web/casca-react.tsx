import { createRef, type ComponentProps, type ReactElement, useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Confirmacoes } from './confirmacao.js';
import type { PacienteLista } from '../packages/contracts/src/cadastro.js';
import { EstadoDeRede } from './estado-rede.js';
import { lerRotaFicha, type RotaFicha } from './ficha-paciente.js';
import { TelaHomeProfissional, type ServicoHome } from './home-profissional.js';
import { LimiteErroPainel } from './limite-erro-painel.js';
import { LinhasCarteira } from './linhas-carteira.js';
import { TelaRegrasAtendimento } from './regras-atendimento.js';
import type { ServicoRegrasAtendimento } from './servico-regras-atendimento-http.js';
import { type ComandoGaveta, type EstadoNavegacao, NavegacaoCasca } from './navegacao-casca.js';

type Navegacao = ComponentProps<typeof NavegacaoCasca>;
type Carteira = {
  raiz: HTMLElement;
  destinoFiltros: HTMLElement;
  abrir: (paciente: PacienteLista) => void;
};
type Entrada = {
  destinoLogin: HTMLElement;
  destinoRede: HTMLElement;
  destinoCadastro: HTMLElement;
  login: ReactElement;
  cadastro: ReactElement;
  focarCadastro: () => void;
};

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

function PainelCasca({
  children,
  itemDaLista = false,
  aoTentarNovamente,
}: {
  children: ReactElement;
  itemDaLista?: boolean;
  aoTentarNovamente?: () => void;
}) {
  const [tentativa, definirTentativa] = useState(0);
  return (
    <LimiteErroPainel
      key={tentativa}
      aoTentarNovamente={() => {
        aoTentarNovamente?.();
        definirTentativa((anterior) => anterior + 1);
      }}
      itemDaLista={itemDaLista}
    >
      {children}
    </LimiteErroPainel>
  );
}

function conteudoDaVista(vista: Vista): ReactElement {
  switch (vista.tipo) {
    case 'home':
      return (
        <PainelCasca key="home">
          <TelaHomeProfissional
            servico={vista.servico}
            acessoPerdido={vista.acessoPerdido}
            nivelTitulo={2}
          />
        </PainelCasca>
      );
    case 'regras':
      return (
        <PainelCasca key="regras">
          <TelaRegrasAtendimento servico={vista.servico} />
        </PainelCasca>
      );
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
  agenda,
  destinoAgenda,
  entrada,
}: {
  vista: Vista | null;
  aoHistorico: () => void;
  navegacao: Navegacao;
  carteira: Carteira & { pacientes: readonly PacienteLista[]; filtros: ReactElement | null };
  agenda: ReactElement | null;
  destinoAgenda: HTMLElement;
  entrada: Entrada;
}) {
  const [tentativaAgenda, definirTentativaAgenda] = useState(0);
  const [tentativaEntrada, definirTentativaEntrada] = useState(0);
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
      <Confirmacoes />
      {navegacao.estado.visivel
        ? createPortal(
            <PainelCasca>
              <NavegacaoCasca {...navegacao} />
            </PainelCasca>,
            navegacao.barra,
          )
        : null}
      {createPortal(
        <PainelCasca aoTentarNovamente={entrada.focarCadastro}>{entrada.cadastro}</PainelCasca>,
        entrada.destinoCadastro,
      )}
      {createPortal(
        <PainelCasca>
          <EstadoDeRede />
        </PainelCasca>,
        entrada.destinoRede,
      )}
      {createPortal(
        <LimiteErroPainel
          key={tentativaEntrada}
          aoTentarNovamente={() => definirTentativaEntrada((anterior) => anterior + 1)}
        >
          {entrada.login}
        </LimiteErroPainel>,
        entrada.destinoLogin,
      )}
      {createPortal(
        <PainelCasca itemDaLista>
          <LinhasCarteira pacientes={carteira.pacientes} aoAbrir={carteira.abrir} />
        </PainelCasca>,
        carteira.raiz,
      )}
      {carteira.filtros
        ? createPortal(<PainelCasca>{carteira.filtros}</PainelCasca>, carteira.destinoFiltros)
        : null}
      {vista ? createPortal(conteudoDaVista(vista), vista.destino) : null}
      {agenda
        ? createPortal(
            <LimiteErroPainel
              key={`${agenda.key}:${tentativaAgenda}`}
              aoTentarNovamente={() => definirTentativaAgenda((anterior) => anterior + 1)}
            >
              {agenda}
            </LimiteErroPainel>,
            destinoAgenda,
          )
        : null}
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
  destinoAgenda: HTMLElement,
  entrada: Entrada,
) {
  const arvore = createRoot(raiz);
  const comando = createRef<ComandoGaveta>();
  let encerrada = false;
  let vista: Vista | null = null;
  let agenda: ReactElement | null = null;
  let filtros: ReactElement | null = null;
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
            carteira={{ ...carteira, pacientes, filtros }}
            agenda={agenda}
            destinoAgenda={destinoAgenda}
            entrada={entrada}
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
    desenharAgenda(tela: ReactElement | null) {
      agenda = tela;
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
    desenharFiltros(tela: ReactElement | null) {
      filtros = tela;
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
