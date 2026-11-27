import { useEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { lerRotaFicha, type RotaFicha } from './ficha-paciente.js';
import { TelaHomeProfissional, type ServicoHome } from './home-profissional.js';
import { TelaRegrasAtendimento } from './regras-atendimento.js';
import type { ServicoRegrasAtendimento } from './servico-regras-atendimento-http.js';

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
  | { tipo: 'regras'; destino: HTMLElement; servico: ServicoRegrasAtendimento };

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

function Casca({
  vista,
  aoHistorico,
}: {
  vista: Vista | null;
  aoHistorico: () => void;
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

  if (!vista) return null;
  return createPortal(
    vista.tipo === 'home' ? (
      <TelaHomeProfissional servico={vista.servico} acessoPerdido={vista.acessoPerdido} />
    ) : (
      <TelaRegrasAtendimento servico={vista.servico} />
    ),
    vista.destino,
  );
}

/** Durante a transição, as vistas convertidas são renderizadas dentro dos
 * contêineres existentes, preservando os pontos de foco e a montagem do HTML. */
export function iniciarCasca(raiz: HTMLElement, aoHistorico: () => void) {
  const arvore = createRoot(raiz);
  let encerrada = false;
  const desenhar = (vista: Vista | null) => {
    if (!encerrada)
      flushSync(() => arvore.render(<Casca vista={vista} aoHistorico={aoHistorico} />));
  };
  desenhar(null);
  return {
    desenhar,
    encerrar() {
      if (encerrada) return;
      encerrada = true;
      arvore.unmount();
    },
  };
}
