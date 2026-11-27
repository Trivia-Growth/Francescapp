import { ChevronRight } from 'lucide-react';
import type { PacienteLista } from '../packages/contracts/src/cadastro.js';
import { rotulosSituacao } from './acompanhamento-caso.js';
import { iniciais } from './ficha-paciente.js';
import { SinalCarteira } from './filtros-carteira.js';

export function LinhasCarteira({
  pacientes,
  aoAbrir,
}: {
  pacientes: readonly PacienteLista[];
  aoAbrir: (paciente: PacienteLista) => void;
}) {
  return pacientes.map((paciente) => (
    <li key={paciente.id}>
      <button
        type="button"
        className="ui-linha"
        data-paciente-id={paciente.id}
        onClick={() => aoAbrir(paciente)}
      >
        <span className="avatar" aria-hidden="true">
          {iniciais(paciente.nome)}
        </span>
        <span className="ui-linha__texto">
          <span className="ui-linha__principal">{paciente.nome}</span>
          <span className="ui-linha__secundario">
            {paciente.nome_preferencia
              ? `Preferência: ${paciente.nome_preferencia}`
              : 'Preferência não informada'}
          </span>
          {paciente.situacao === undefined ? null : (
            <span className="pessoa-situacao" data-situacao={paciente.situacao ?? 'completar'}>
              {paciente.situacao === null
                ? 'Situação a completar'
                : `Situação: ${rotulosSituacao[paciente.situacao]}`}
            </span>
          )}
          {paciente.sinal ? <SinalCarteira sinal={paciente.sinal} /> : null}
          <span className="sr-only">Abrir ficha</span>
        </span>
        <ChevronRight className="ui-linha__seta" aria-hidden="true" size={16} />
      </button>
    </li>
  ));
}
