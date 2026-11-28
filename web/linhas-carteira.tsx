import { ChevronRight } from 'lucide-react';
import type { PacienteLista } from '../packages/contracts/src/cadastro.js';
import { rotulosSituacao } from './acompanhamento-caso.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { ListaRotulada } from './componentes/ui/tabela.js';
import { iniciais } from './ficha-paciente.js';
import { SinalCarteira } from './filtros-carteira.js';

export function LinhasCarteira({
  pacientes,
  aoAbrir,
}: {
  pacientes: readonly PacienteLista[];
  aoAbrir: (paciente: PacienteLista) => void;
}) {
  return (
    <ListaRotulada
      itens={pacientes}
      chave={(paciente) => paciente.id}
      rotulo="Pacientes retornados pelo serviço para seu acesso atual"
      colunas={[
        {
          titulo: 'Pessoa',
          celula: (paciente) => (
            <button
              type="button"
              className="flex w-full min-w-0 min-h-14 cursor-pointer items-start gap-sistema-3 rounded-sistema-controle border-0 bg-transparent px-sistema-2 py-sistema-1 text-left text-sistema-texto hover:bg-sistema-hoje"
              data-paciente-id={paciente.id}
              onClick={() => aoAbrir(paciente)}
            >
              <span
                className="inline-grid size-10 shrink-0 place-items-center rounded-full bg-sistema-hoje text-meta font-semibold text-sistema-acao"
                aria-hidden="true"
              >
                {iniciais(paciente.nome)}
              </span>
              <span className="grid min-w-0 flex-1 justify-items-start gap-sistema-1 wrap-anywhere">
                <span className="text-lg leading-6 font-semibold">{paciente.nome}</span>
                <span className="text-meta font-normal text-sistema-texto-secundario">
                  {paciente.nome_preferencia
                    ? `Preferência: ${paciente.nome_preferencia}`
                    : 'Preferência não informada'}
                </span>
                {paciente.situacao === undefined ? null : (
                  <MarcaEstado
                    tom={paciente.situacao === null ? 'contorno' : 'padrao'}
                    className="text-meta font-semibold"
                    data-situacao={paciente.situacao ?? 'completar'}
                  >
                    {paciente.situacao === null
                      ? 'Situação a completar'
                      : `Situação: ${rotulosSituacao[paciente.situacao]}`}
                  </MarcaEstado>
                )}
                {paciente.sinal ? <SinalCarteira sinal={paciente.sinal} /> : null}
                <span className="sr-only">Abrir ficha</span>
              </span>
              <ChevronRight
                aria-hidden="true"
                size={16}
                className="mt-sistema-1 shrink-0 text-sistema-acao"
              />
            </button>
          ),
        },
      ]}
    />
  );
}
