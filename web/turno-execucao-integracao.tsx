/** Turno próprio com execução do cuidado e consentimento de localização, numa árvore só
 *  (VIS-018).
 *
 *  Era o último módulo imperativo do bloco: criava duas `div`, montava o consentimento numa
 *  e o turno na outra, e entregava ao turno uma função que montava a execução numa terceira
 *  `div` criada pelo React. Agora consentimento, turno, execução e passagem são componentes
 *  da mesma árvore, e nenhum deles monta DOM em contêiner alheio.
 *
 *  O que continua igual: a pendência agregada (consentimento OU turno OU execução) é o que
 *  chega a quem hospeda; o consentimento é o mesmo controlador, entregue ao turno para a
 *  coleta na abertura e no encerramento; e desmontar encerra também o serviço da execução. */
import { useCallback, useRef } from 'react';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import type { ServicoTurnoHttp } from './servico-turno-http.ts';
import type { PortasConversaoOcorrencia } from './turno-execucao-conversao.js';
import { ConsentimentoTurno, usarConsentimentoTurno } from './turno-execucao-localizacao.js';
import { ExecucaoTurno } from './turno-execucao.js';
import { TelaTurnoProprio } from './turno-proprio.js';
import type { ServicosFichaPlantao } from './ficha-plantao.js';

type Opcoes = {
  usuarioId: string;
  administrador: boolean;
  acessoPerdido(erro?: unknown): void;
  alteracaoPendente(valor: boolean): void;
  conversao?: PortasConversaoOcorrencia;
  criarServicosFicha?(): ServicosFichaPlantao;
};

export function TurnoComExecucao({
  pacienteId,
  turno,
  execucao,
  opcoes,
}: {
  pacienteId: string;
  turno: ServicoTurnoHttp;
  execucao: ServicoTurnoExecucao;
  opcoes: Opcoes;
}) {
  const opcoesRef = useRef(opcoes);
  opcoesRef.current = opcoes;
  const pendencias = useRef(new Map<string, boolean>());
  const pendente = useCallback(
    (origem: string) => (valor: boolean) => {
      pendencias.current.set(origem, valor);
      opcoesRef.current.alteracaoPendente([...pendencias.current.values()].some(Boolean));
    },
    [],
  );
  const pendenteLocalizacao = useRef(pendente('localizacao'));
  const pendenteTurno = useRef(pendente('turno'));
  const localizacao = usarConsentimentoTurno(
    {
      consultar: () => execucao.consentimento(),
      gravar: (entrada, chave) => execucao.gravarConsentimento(entrada, chave),
      registrar: (entrada, chave) => execucao.registrarLocalizacao(entrada, chave),
    },
    {
      acessoPerdido: (erro) => opcoesRef.current.acessoPerdido(erro),
      alteracaoPendente: pendenteLocalizacao.current,
    },
  );
  return (
    <>
      <div>
        <ConsentimentoTurno controle={localizacao} />
      </div>
      <div>
        <TelaTurnoProprio
          pacienteId={pacienteId}
          servico={turno}
          opcoes={{
            acessoPerdido: () => opcoesRef.current.acessoPerdido(),
            alteracaoPendente: pendenteTurno.current,
            localizacao,
            renderizarExecucao: (atual, alteracaoPendente) => (
              <ExecucaoTurno
                pacienteId={pacienteId}
                turno={atual}
                servico={execucao}
                opcoes={{
                  ...opcoes,
                  acessoPerdido: (erro) => opcoesRef.current.acessoPerdido(erro),
                  alteracaoPendente,
                }}
              />
            ),
          }}
        />
      </div>
    </>
  );
}
