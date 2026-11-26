import { Botao } from './componentes/ui/botao.js';
import { valor } from './componentes/ui/lista.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { ilhaSincrona } from './telas/ilha-sincrona.js';

export type SituacaoCarteiraLocal =
  | 'entrada'
  | 'ativo'
  | 'pausado'
  | 'encerrado'
  | 'transferido'
  | '';

type PacienteContado = { situacao?: Exclude<SituacaoCarteiraLocal, ''> };

type DadosIndicadoresCarteiraLocal = {
  pacientes: readonly PacienteContado[];
  filtrar?: (situacao: SituacaoCarteiraLocal) => void;
};

/** A ordem é a do percurso do caso, não a alfabética: entra, acompanha, pausa, encerra,
 *  transfere. "Não informada" fecha a fila porque é ausência de dado, não uma etapa. */
const SITUACOES: readonly [SituacaoCarteiraLocal, string][] = [
  ['entrada', 'Entrada'],
  ['ativo', 'Ativo'],
  ['pausado', 'Pausado'],
  ['encerrado', 'Encerrado'],
  ['transferido', 'Transferido'],
  ['', 'Não informada'],
];

/** Conta somente situações informadas nos registros já carregados.
 *
 *  Toda contagem aqui é CONFIRMADA: o conjunto está na mão, então zero é zero e aparece
 *  como `0` (VIS-014). Nenhuma delas pode virar `—`, e por isso `valor()` recebe sempre
 *  um número — a função está aqui para que a distinção continue explícita se um dia a
 *  contagem passar a vir do servidor e puder faltar. */
export function IndicadoresCarteiraLocal({ pacientes, filtrar }: DadosIndicadoresCarteiraLocal) {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
      {SITUACOES.map(([situacao, rotulo]) => {
        const quantidade = pacientes.filter(
          (paciente) => (paciente.situacao ?? '') === situacao,
        ).length;
        const texto = `${rotulo}: ${valor(quantidade)}`;
        return (
          <li key={situacao === '' ? 'nao-informada' : situacao}>
            {filtrar ? (
              <Botao
                peso="discreto"
                marca={`filtrar-${situacao === '' ? 'nao-informada' : situacao}`}
                aoAtivar={() => filtrar(situacao)}
              >
                {texto}
              </Botao>
            ) : (
              <MarcaEstado tom="suave">{texto}</MarcaEstado>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function montarIndicadoresCarteiraLocal(
  raiz: HTMLElement,
  dados: DadosIndicadoresCarteiraLocal,
): () => void {
  return ilhaSincrona(raiz, <IndicadoresCarteiraLocal {...dados} />);
}
