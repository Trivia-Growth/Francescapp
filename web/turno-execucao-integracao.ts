import type { ServicoTurnoHttp } from './servico-turno-http.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { montarTurnoProprio } from './turno-proprio.ts';
import { montarConsentimentoTurno } from './turno-execucao-localizacao.ts';
import { montarExecucaoTurno } from './turno-execucao.ts';
import type { PortasConversaoOcorrencia } from './turno-execucao-conversao.ts';
import { elementoTurno as el } from './turno-execucao-campos.ts';
export function montarTurnoComExecucao(
  raiz: HTMLElement,
  pacienteId: string,
  turno: ServicoTurnoHttp,
  execucao: ServicoTurnoExecucao,
  opcoes: {
    usuarioId: string;
    administrador: boolean;
    acessoPerdido(erro?: unknown): void;
    alteracaoPendente(valor: boolean): void;
    conversao?: PortasConversaoOcorrencia;
  },
) {
  const consentimentoRaiz = el('div');
  const turnoRaiz = el('div');
  raiz.replaceChildren(consentimentoRaiz, turnoRaiz);
  const pendencias = new Map<string, boolean>();
  const pendente = (origem: string) => (valor: boolean) => {
    pendencias.set(origem, valor);
    opcoes.alteracaoPendente([...pendencias.values()].some(Boolean));
  };
  const localizacao = montarConsentimentoTurno(
    consentimentoRaiz,
    {
      consultar: () => execucao.consentimento(),
      gravar: (entrada, chave) => execucao.gravarConsentimento(entrada, chave),
      registrar: (entrada, chave) => execucao.registrarLocalizacao(entrada, chave),
    },
    { acessoPerdido: opcoes.acessoPerdido, alteracaoPendente: pendente('localizacao') },
  );
  const desmontarTurno = montarTurnoProprio(turnoRaiz, pacienteId, turno, {
    acessoPerdido: () => opcoes.acessoPerdido(),
    alteracaoPendente: pendente('turno'),
    localizacao,
    montarExecucao: (destino, atual, alteracaoPendente) =>
      montarExecucaoTurno(destino, pacienteId, atual, execucao, {
        ...opcoes,
        acessoPerdido: opcoes.acessoPerdido,
        alteracaoPendente,
      }),
  });
  return () => {
    desmontarTurno();
    localizacao.desmontar();
    execucao.desmontar();
    pendencias.clear();
    raiz.replaceChildren();
  };
}
