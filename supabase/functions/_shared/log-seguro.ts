export type EventoOperacionalSeguro =
  | {
      acao: 'configuracao';
      resultado: 'pronto';
      status: 200;
      codigo: 'configuracao_validada';
    }
  | {
      acao: 'configuracao';
      resultado: 'indisponivel';
      status: 503;
      codigo: 'configuracao_indisponivel';
    };

export type RegistradorDeEventoSeguro = (evento: EventoOperacionalSeguro) => boolean;

export const eventosOperacionaisSeguros = Object.freeze({
  configuracaoValidada: Object.freeze({
    acao: 'configuracao',
    resultado: 'pronto',
    status: 200,
    codigo: 'configuracao_validada',
  } as const),
  configuracaoIndisponivel: Object.freeze({
    acao: 'configuracao',
    resultado: 'indisponivel',
    status: 503,
    codigo: 'configuracao_indisponivel',
  } as const),
});

const chavesPermitidas = ['acao', 'codigo', 'resultado', 'status'];
const combinacoesPermitidas = new Set(
  Object.values(eventosOperacionaisSeguros).map((evento) =>
    JSON.stringify([evento.acao, evento.resultado, evento.status, evento.codigo]),
  ),
);

function copiarEventoPermitido(entrada: unknown): EventoOperacionalSeguro | null {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return null;
  }

  const descritores = Object.getOwnPropertyDescriptors(entrada);
  const chaves = Object.keys(descritores).sort();
  if (JSON.stringify(chaves) !== JSON.stringify(chavesPermitidas)) {
    return null;
  }
  if (
    chaves.some((chave) => {
      const descritor = descritores[chave];
      return descritor === undefined || !('value' in descritor);
    })
  ) {
    return null;
  }

  const combinacao = JSON.stringify([
    descritores.acao?.value,
    descritores.resultado?.value,
    descritores.status?.value,
    descritores.codigo?.value,
  ]);
  if (!combinacoesPermitidas.has(combinacao)) {
    return null;
  }

  return {
    acao: descritores.acao?.value,
    resultado: descritores.resultado?.value,
    status: descritores.status?.value,
    codigo: descritores.codigo?.value,
  } as EventoOperacionalSeguro;
}

export function criarRegistradorDeLogSeguro(
  destino: (linha: string) => void = (linha) => console.info(linha),
): RegistradorDeEventoSeguro {
  return (entrada: EventoOperacionalSeguro): boolean => {
    const evento = copiarEventoPermitido(entrada);
    if (evento === null) {
      return false;
    }

    try {
      destino(JSON.stringify(evento));
      return true;
    } catch {
      return false;
    }
  };
}
