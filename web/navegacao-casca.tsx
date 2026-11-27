import * as Dialog from '@radix-ui/react-dialog';
import {
  BookOpen,
  ChevronLeft,
  House,
  LogOut,
  Menu,
  Shield,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import {
  type MouseEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { useTravaRolagem } from './componentes/ui/trava-rolagem.js';
import { TelaAvisos, type ServicoAvisos } from './avisos.js';

const logo = new URL('./assets/ffcm-logo-branco.jpg', import.meta.url).href;
const destinos = [
  { id: 'home', hash: '#home', rotulo: 'Seu dia', Icone: House },
  { id: 'carteira', hash: '#carteira', rotulo: 'Pessoas acompanhadas', Icone: UsersRound },
  {
    id: 'administracao',
    hash: '#administracao/configuracao',
    rotulo: 'Administração',
    Icone: Shield,
  },
  { id: 'regras', hash: '#regras', rotulo: 'Como funciona', Icone: BookOpen },
] as const;

export type DestinoCasca = (typeof destinos)[number]['id'];
export type EstadoNavegacao = {
  visivel: boolean;
  destino: DestinoCasca;
  home: boolean;
  administracao: boolean;
  perfil: string;
  pessoa: string;
  area: string;
  busca: string | null;
  avisos: { identidade: string; revisao: number; servico: ServicoAvisos } | null;
};
export type ComandoGaveta = { fechar(): void };

const CHAVE_RECOLHIDA = 'navegacao-recolhida';
function preferenciaRecolhida(): boolean {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === 'sim';
  } catch {
    return false;
  }
}

const janelaEstreita = () => window.innerWidth < 1024;

function Marca() {
  return (
    <div className="casca-marca">
      <img src={logo} width={44} height={44} alt="" />
      <span>
        FFCMApp <small>Francescato</small>
      </span>
    </div>
  );
}

export function NavegacaoCasca({
  barra,
  lateral,
  estado,
  comando,
  aoNavegar,
  aoSair,
  aoBuscar,
}: {
  barra: HTMLElement;
  lateral: HTMLElement;
  estado: EstadoNavegacao;
  comando: Ref<ComandoGaveta>;
  aoNavegar: (hash: string) => void;
  aoSair: () => void;
  aoBuscar: (texto: string) => void;
}) {
  const [recolhida, definirRecolhida] = useState(preferenciaRecolhida);
  const [aberta, definirAberta] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const recolher = useRef<HTMLButtonElement>(null);
  const gaveta = useRef<HTMLDivElement>(null);
  const primeiroControle = useRef<HTMLButtonElement>(null);
  const conta = useRef<HTMLDetailsElement>(null);
  const devolverFoco = useRef(true);
  const transferirFoco = useRef(false);
  const assinarJanela = useCallback(
    (notificar: () => void) => {
      let eraEstreita = janelaEstreita();
      const redimensionar = () => {
        const agoraEstreita = janelaEstreita();
        if (agoraEstreita !== eraEstreita) {
          const ativo = document.activeElement;
          transferirFoco.current =
            lateral.contains(ativo) ||
            Boolean(gaveta.current?.contains(ativo)) ||
            ativo === menu.current;
          eraEstreita = agoraEstreita;
        }
        notificar();
      };
      window.addEventListener('resize', redimensionar);
      return () => window.removeEventListener('resize', redimensionar);
    },
    [lateral],
  );
  const estreita = useSyncExternalStore(assinarJanela, janelaEstreita);
  const gavetaVisivel = estado.visivel && estreita && aberta;
  const avisos = estado.avisos ? (
    <div className="avisos" id="avisos" key={estado.avisos.identidade}>
      <TelaAvisos servico={estado.avisos.servico} revisao={estado.avisos.revisao} />
    </div>
  ) : null;
  useTravaRolagem(gavetaVisivel);

  useLayoutEffect(() => {
    if (!transferirFoco.current) return;
    transferirFoco.current = false;
    (estreita ? menu.current : recolher.current)?.focus();
  }, [estreita]);

  useEffect(() => {
    document.body.classList.toggle('casca-recolhida', recolhida && !estreita);
    return () => document.body.classList.remove('casca-recolhida');
  }, [recolhida, estreita]);

  useEffect(() => {
    if (!estreita || !estado.visivel) definirAberta(false);
  }, [estreita, estado.visivel]);

  useImperativeHandle(
    comando,
    () => ({
      fechar() {
        devolverFoco.current = false;
        definirAberta(false);
        if (conta.current) conta.current.open = false;
      },
    }),
    [],
  );

  function alternarLateral() {
    const proxima = !recolhida;
    definirRecolhida(proxima);
    try {
      if (proxima) localStorage.setItem(CHAVE_RECOLHIDA, 'sim');
      else localStorage.removeItem(CHAVE_RECOLHIDA);
    } catch {
      // A preferência muda nesta janela mesmo sem armazenamento.
    }
  }

  function seguir(evento: MouseEvent<HTMLAnchorElement>, hash: string) {
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey)
      return;
    evento.preventDefault();
    aoNavegar(hash);
  }

  function lista(movel: boolean) {
    return (
      <nav aria-label="Área de trabalho" className="casca-destinos">
        {destinos.map(({ id, hash, rotulo, Icone }) => (
          <div
            key={id}
            hidden={
              (id === 'home' && !estado.home) || (id === 'administracao' && !estado.administracao)
            }
          >
            {movel && id === 'regras' ? avisos : null}
            <a
              id={`nav-${id}`}
              href={hash}
              aria-current={estado.destino === id ? 'page' : undefined}
              aria-label={rotulo}
              className="casca-destino"
              onClick={(evento) => seguir(evento, hash)}
            >
              <Icone aria-hidden="true" size={20} />
              <span>{rotulo}</span>
              {movel ? null : (
                <span className="casca-rotulo-trilho" aria-hidden="true">
                  {rotulo}
                </span>
              )}
            </a>
          </div>
        ))}
      </nav>
    );
  }

  if (!estado.visivel) return null;
  const titulo = destinos.find(({ id }) => id === estado.destino)?.rotulo;
  const caminho = estado.pessoa || estado.area;

  return (
    <Dialog.Root
      open={gavetaVisivel}
      onOpenChange={(proxima) => {
        devolverFoco.current = true;
        definirAberta(proxima);
      }}
    >
      {createPortal(
        <header className="topbar casca-topbar">
          {estreita ? (
            <Dialog.Trigger asChild>
              <button type="button" id="toggle-sidebar" ref={menu} className="casca-menu">
                <Menu aria-hidden="true" size={20} /> Menu
              </button>
            </Dialog.Trigger>
          ) : null}
          <h1 id="titulo-casca" tabIndex={-1}>
            {titulo}
          </h1>
          <div id="session-actions" className="casca-acoes">
            {!estreita && estado.busca !== null ? (
              <input
                className="casca-busca"
                type="search"
                aria-label="Buscar pessoas acompanhadas por nome"
                placeholder="Buscar por nome"
                value={estado.busca}
                onChange={(evento) => aoBuscar(evento.currentTarget.value)}
              />
            ) : null}
            {estreita ? null : avisos}
            <details
              className="casca-conta"
              ref={conta}
              onKeyDown={(evento) => {
                if (evento.key !== 'Escape' || !evento.currentTarget.open) return;
                evento.currentTarget.open = false;
                evento.currentTarget.querySelector('summary')?.focus();
              }}
            >
              <summary aria-label="Conta" title="Conta">
                <UserRound aria-hidden="true" size={20} />
              </summary>
              <div className="casca-conta-painel">
                <span id="session-role">{estado.perfil}</span>
                <button type="button" id="logout" className="casca-menu" onClick={aoSair}>
                  <LogOut aria-hidden="true" size={18} /> Sair
                </button>
              </div>
            </details>
          </div>
          <nav className="casca-contexto" aria-label="Caminho atual" hidden={!caminho}>
            <span id="crumb-paciente" hidden={!estado.pessoa}>
              {estado.pessoa}
            </span>
            {estado.area ? <span aria-current="page">{estado.area}</span> : null}
          </nav>
        </header>,
        barra,
      )}
      {estreita ? (
        <Dialog.Portal>
          <Dialog.Overlay
            id="sidebar-backdrop"
            className="casca-fundo-gaveta"
            onPointerDown={() => {
              devolverFoco.current = true;
              definirAberta(false);
            }}
          />
          <Dialog.Content
            id="patients-sidebar"
            ref={gaveta}
            className="casca-lateral casca-gaveta"
            aria-describedby={undefined}
            onOpenAutoFocus={(evento) => {
              evento.preventDefault();
              primeiroControle.current?.focus();
            }}
            onCloseAutoFocus={(evento) => {
              evento.preventDefault();
              if (devolverFoco.current) menu.current?.focus();
            }}
          >
            <div className="casca-moldura-marca">
              <Dialog.Title className="sr-only">Menu</Dialog.Title>
              <Marca />
              <Dialog.Close asChild>
                <button
                  type="button"
                  id="close-sidebar"
                  className="casca-menu"
                  ref={primeiroControle}
                  aria-label="Fechar menu"
                >
                  <X aria-hidden="true" size={22} />
                </button>
              </Dialog.Close>
            </div>
            {lista(true)}
          </Dialog.Content>
        </Dialog.Portal>
      ) : (
        createPortal(
          <aside id="patients-sidebar" aria-label="Área de trabalho" className="casca-lateral">
            <div className="casca-moldura-marca">
              <Marca />
            </div>
            {lista(false)}
            <button
              type="button"
              id="collapse-sidebar"
              ref={recolher}
              className="casca-recolher casca-menu"
              aria-controls="patients-sidebar"
              aria-expanded={!recolhida}
              aria-label={recolhida ? 'Expandir navegação' : 'Recolher navegação'}
              title={recolhida ? 'Expandir navegação' : 'Recolher navegação'}
              onClick={alternarLateral}
            >
              <ChevronLeft aria-hidden="true" size={18} />
              <span aria-hidden="true">{recolhida ? 'Expandir' : 'Recolher'}</span>
            </button>
          </aside>,
          lateral,
        )
      )}
    </Dialog.Root>
  );
}
