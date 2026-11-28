import { useLayoutEffect, useSyncExternalStore } from 'react';

function observarRede(notificar: () => void) {
  window.addEventListener('online', notificar);
  window.addEventListener('offline', notificar);
  return () => {
    window.removeEventListener('online', notificar);
    window.removeEventListener('offline', notificar);
  };
}

function lerRede() {
  return window.navigator.onLine === false;
}

/** Aviso da casca (FR-071). A UI mantém apenas o estado da conexão. */
export function EstadoDeRede() {
  const semRede = useSyncExternalStore(observarRede, lerRede);
  useLayoutEffect(() => {
    document.body.dataset.semRede = String(semRede);
    return () => {
      delete document.body.dataset.semRede;
    };
  }, [semRede]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a região anuncia a perda da conexão.
    <p id="estado-rede" className="estado-rede" role="status" aria-live="polite" hidden={!semRede}>
      {semRede
        ? 'Sem conexão. O conteúdo das áreas do aplicativo não é guardado no aparelho e volta a aparecer quando a rede voltar.'
        : ''}
    </p>
  );
}
