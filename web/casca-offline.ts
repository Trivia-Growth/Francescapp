/**
 * Lado da página da casca offline (FR-071).
 *
 * Três responsabilidades, todas testáveis sem `ServiceWorkerGlobalScope`:
 * registrar o worker sem quebrar quem não o suporta, limpar o aparelho no encerramento de
 * sessão (D3) e dizer, sem rodeio, quando o conteúdo não está disponível por falta de rede (D2).
 *
 * As regras do próprio worker estão em `public/casca-regras.js`.
 */

/** Endereço do worker. É também o endereço que a reversão sobrescreve (tarefa 1.6). */
export const ENDERECO_WORKER = '/sw.js';

/**
 * Chaves que sobrevivem ao encerramento de sessão em `localStorage`.
 *
 * São marcadores de operação externa sem confirmação: guardam que um envio ao Google Calendar
 * pode ter sido aplicado sem resposta, para avisar a pessoa na entrada seguinte. Apagá-los
 * removeria um aviso de segurança existente. Não contêm conteúdo de caso nem identificador de
 * sessão.
 *
 * O prefixo inclui os dois-pontos de propósito: só sobrevive a chave que identifica o usuário
 * dono do marcador, que é lida apenas por ele. O marcador antigo sem usuário
 * (`ffcm-agenda-operacao-incerta`, sem sufixo) é apagado: ele apareceria para a próxima pessoa
 * no mesmo aparelho, e o cenário "Segunda pessoa no mesmo aparelho" não admite isso.
 */
export const PREFIXOS_PRESERVADOS = [
  'ffcm-agenda-operacao-incerta:',
  'ffcm-agenda-desconexao-incerta:',
];

export type ResultadoRegistro = 'registrada' | 'sem-suporte' | 'falhou';

/**
 * Registra o service worker. Sem suporte, em contexto inseguro ou com falha de registro, a
 * aplicação continua igual: nada é mostrado e nada é bloqueado (cenário "Falha ao instalar não
 * bloqueia o uso").
 */
export async function registrarCascaOffline(
  navegador: Navigator = navigator,
): Promise<ResultadoRegistro> {
  const container = (navegador as Partial<Navigator>).serviceWorker;
  if (!container || typeof container.register !== 'function') return 'sem-suporte';
  try {
    await container.register(ENDERECO_WORKER, { scope: '/' });
    return 'registrada';
  } catch {
    return 'falhou';
  }
}

/** Publica o worker de reversão desregistrando o que estiver instalado. Ver tarefa 1.6. */
export async function desregistrarCascaOffline(navegador: Navigator = navigator): Promise<boolean> {
  const container = (navegador as Partial<Navigator>).serviceWorker;
  if (!container || typeof container.getRegistrations !== 'function') return false;
  try {
    const registros = await container.getRegistrations();
    for (const registro of registros) await registro.unregister();
    return true;
  } catch {
    return false;
  }
}

export type RelatorioLimpeza = {
  sessionStorage: boolean;
  localStorage: boolean;
  caches: boolean;
  indexedDB: boolean;
  preservadas: string[];
};

type JanelaLimpavel = {
  sessionStorage?: Storage;
  localStorage?: Storage;
  caches?: CacheStorage;
  indexedDB?: IDBFactory;
};

function chavesDe(armazenamento: Storage): string[] {
  const chaves: string[] = [];
  for (let indice = 0; indice < armazenamento.length; indice += 1) {
    const chave = armazenamento.key(indice);
    if (chave !== null) chaves.push(chave);
  }
  return chaves;
}

/**
 * Apaga o que a aplicação mantém no aparelho: `sessionStorage` inteiro, `localStorage` menos os
 * marcadores de `PREFIXOS_PRESERVADOS`, todos os caches da origem e todos os bancos IndexedDB.
 *
 * Cada parte falha fechada e isolada: um armazenamento indisponível não impede a limpeza dos
 * outros. O relatório diz o que foi efetivamente limpo, e é o que os testes conferem.
 */
export async function limparAparelho(
  janela: JanelaLimpavel = globalThis as JanelaLimpavel,
): Promise<RelatorioLimpeza> {
  const relatorio: RelatorioLimpeza = {
    sessionStorage: false,
    localStorage: false,
    caches: false,
    indexedDB: false,
    preservadas: [],
  };
  try {
    janela.sessionStorage?.clear();
    relatorio.sessionStorage = true;
  } catch {
    /* falha fechada: sem armazenamento não há o que apagar aqui */
  }
  try {
    const local = janela.localStorage;
    if (local) {
      for (const chave of chavesDe(local)) {
        if (PREFIXOS_PRESERVADOS.some((prefixo) => chave.startsWith(prefixo)))
          relatorio.preservadas.push(chave);
        else local.removeItem(chave);
      }
      relatorio.localStorage = true;
    }
  } catch {
    /* falha fechada */
  }
  try {
    const armazem = janela.caches;
    if (armazem) {
      for (const nome of await armazem.keys()) await armazem.delete(nome);
      relatorio.caches = true;
    }
  } catch {
    /* falha fechada */
  }
  try {
    const bancos = janela.indexedDB;
    if (bancos && typeof bancos.databases === 'function') {
      for (const banco of await bancos.databases())
        if (banco.name) bancos.deleteDatabase(banco.name);
      relatorio.indexedDB = true;
    }
  } catch {
    /* falha fechada */
  }
  return relatorio;
}

export const MENSAGEM_SEM_REDE =
  'Sem conexão. O conteúdo das áreas do aplicativo não é guardado no aparelho e volta a aparecer quando a rede voltar.';

type JanelaDeRede = {
  navigator: { onLine?: boolean };
  addEventListener: Window['addEventListener'];
  removeEventListener: Window['removeEventListener'];
};

/**
 * Mantém o aviso de indisponibilidade por falta de rede (D2). O aviso é um estado da casca, não
 * conteúdo: nenhuma área mostra dado anterior ou de exemplo, porque nenhuma resposta de API é
 * guardada no aparelho.
 */
export function montarEstadoDeRede(
  alvo: HTMLElement,
  janela: JanelaDeRede = window as unknown as JanelaDeRede,
): () => void {
  const aplicar = (): void => {
    const semRede = janela.navigator.onLine === false;
    alvo.textContent = semRede ? MENSAGEM_SEM_REDE : '';
    alvo.hidden = !semRede;
    if (alvo.ownerDocument?.body) alvo.ownerDocument.body.dataset.semRede = String(semRede);
  };
  aplicar();
  janela.addEventListener('online', aplicar);
  janela.addEventListener('offline', aplicar);
  return () => {
    janela.removeEventListener('online', aplicar);
    janela.removeEventListener('offline', aplicar);
  };
}
