import type { ServicoTurnoHttp } from './servico-turno-http.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { montarTurnoProprio } from './turno-proprio.js';
import { montarConsentimentoTurno } from './turno-execucao-localizacao.js';
import { montarExecucaoTurno } from './turno-execucao.js';
import type { PortasConversaoOcorrencia } from './turno-execucao-conversao.js';
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
  /* Duas raízes próprias: o consentimento e o turno são ilhas independentes, e cada uma
     monta e desmonta a sua. Criadas pelo documento, não pela fábrica imperativa de
     `turno-execucao-campos` — este módulo compõe, não desenha. */
  const consentimentoRaiz = document.createElement('div');
  const turnoRaiz = document.createElement('div');
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
