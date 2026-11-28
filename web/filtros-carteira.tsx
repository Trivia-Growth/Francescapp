import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { FiltrosCarteira } from '../packages/contracts/src/cadastro.js';
import {
  avisoSinalOperacional,
  rotulosEstadoSinal,
  type SinalCarteira as SinalCarteiraDoCaso,
} from '../packages/contracts/src/pendencia.js';
import { rotulosSituacao, type ResponsavelOpcao } from './acompanhamento-caso.js';
import { Botao } from './componentes/ui/botao.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { ilhaSincrona, nodeDe } from './telas/ilha-sincrona.js';

/** FR-026: filtros da carteira. A busca por nome que já existe continua valendo só dentro
 * da página carregada, porque o nome é cifrado e o banco não o compara; estes filtros são
 * de outra natureza — vão para o servidor e recortam a carteira inteira antes de paginar.
 *
 * `responsavel` e `situacao` só aparecem para o Administrador, que é quem o servidor
 * autoriza a lê-los. Esconder o controle é conveniência; a recusa está no banco. */
export type AoFiltrar = (filtros: FiltrosCarteira) => void;

const REVISAO: [NonNullable<FiltrosCarteira['revisao']>, string][] = [
  ['vencida', 'Revisão vencida'],
  ['proxima', 'Revisão próxima'],
  ['sem_data', 'Sem revisão marcada'],
];
const PENDENCIA: [NonNullable<FiltrosCarteira['pendencia']>, string][] = [
  ['abertas', 'Com pendência em aberto'],
  ['nenhuma', 'Sem pendência em aberto'],
];

type Recorte = {
  nome: keyof FiltrosCarteira;
  rotulo: string;
  vazio: string;
  opcoes: [string, string][];
};

function recortes(
  administrador: boolean,
  responsaveis: readonly ResponsavelOpcao[] | undefined,
): Recorte[] {
  const lista: Recorte[] = [];
  if (administrador) {
    lista.push(
      {
        nome: 'responsavel',
        rotulo: 'Responsável',
        vazio: 'Qualquer responsável',
        opcoes: [
          ['nenhum', 'Sem responsável indicado'],
          ...(responsaveis ?? []).map((item): [string, string] => [
            item.usuario_id,
            item.ativo ? item.rotulo : `${item.rotulo} (inativo)`,
          ]),
        ],
      },
      {
        nome: 'situacao',
        rotulo: 'Situação do caso',
        vazio: 'Qualquer situação',
        opcoes: [
          ...(Object.entries(rotulosSituacao) as [string, string][]),
          ['a_completar', 'A completar'],
        ],
      },
    );
  }
  lista.push(
    { nome: 'revisao', rotulo: 'Revisão', vazio: 'Qualquer revisão', opcoes: REVISAO },
    { nome: 'pendencia', rotulo: 'Pendências', vazio: 'Com ou sem pendência', opcoes: PENDENCIA },
  );
  return lista;
}

export type PropsFiltrosCarteira = {
  administrador: boolean;
  responsaveis?: readonly ResponsavelOpcao[];
  inicial?: FiltrosCarteira;
  aoFiltrar: AoFiltrar;
};

/** Barra de filtros. Não consulta nada: entrega o recorte escolhido a quem carrega a
 *  carteira, para que a paginação continue sendo de uma camada só.
 *
 *  Os `<select>` continuam NÃO CONTROLADOS, e quem escuta é um ouvinte nativo de `change`
 *  instalado sobre o nó — não `onChange` do React. A razão é de contrato, não de gosto:
 *  a tela da carteira e os testes de comportamento disparam `new Event('change')` direto
 *  no controle, e um evento desses não sobe até a raiz onde o React delega. Trocar o
 *  modelo de evento mudaria comportamento observável, que é o que VIS-018 proíbe numa
 *  migração de aparência. O DOM segue dono do valor, como já era. */
export function BarraFiltrosCarteira({
  administrador,
  responsaveis,
  inicial,
  aoFiltrar,
}: PropsFiltrosCarteira) {
  const formulario = useRef<HTMLFormElement>(null);
  const avisar = useRef(aoFiltrar);
  avisar.current = aoFiltrar;
  const campos = recortes(administrador, responsaveis);
  const [ativos, definirAtivos] = useState(
    () => campos.filter(({ nome }) => inicial?.[nome]).length,
  );

  const selecoes = useCallback(
    (): HTMLSelectElement[] => [...(formulario.current?.querySelectorAll('select') ?? [])],
    [],
  );
  const aplicar = useCallback(() => {
    const atuais = selecoes();
    // `flushSync` porque o recorte chega por evento nativo ou por clique e o resumo do
    // painel é lido na mesma volta: sem ele, quem acabou de escolher um filtro ainda lê a
    // contagem anterior, e o painel passa a discordar dos controles.
    const escolhidos = atuais.filter((campo) => campo.value !== '');
    flushSync(() => definirAtivos(escolhidos.length));
    avisar.current(
      Object.fromEntries(escolhidos.map((campo) => [campo.name, campo.value])) as FiltrosCarteira,
    );
  }, [selecoes]);
  const limpar = useCallback(() => {
    for (const campo of selecoes()) campo.value = '';
    aplicar();
  }, [aplicar, selecoes]);

  useEffect(() => {
    const atuais = selecoes();
    for (const campo of atuais) campo.addEventListener('change', aplicar);
    return () => {
      for (const campo of atuais) campo.removeEventListener('change', aplicar);
    };
  }, [aplicar, selecoes]);

  return (
    <details className="filtros-carteira-painel">
      <summary>
        {ativos
          ? `Filtrar pessoas (${ativos} ${ativos === 1 ? 'filtro ativo' : 'filtros ativos'})`
          : 'Filtrar pessoas'}
      </summary>
      <form
        ref={formulario}
        noValidate
        className="filtros-carteira"
        onSubmit={(evento) => {
          evento.preventDefault();
          aplicar();
        }}
      >
        <h2 className="filtros-carteira-titulo">Filtrar carteira</h2>
        {campos.map((campo) => (
          <SelecaoSimples
            key={campo.nome}
            id={`filtro-carteira-${campo.nome}`}
            name={campo.nome}
            rotulo={campo.rotulo}
            defaultValue={inicial?.[campo.nome] ?? ''}
            classeEnvelope="mb-0"
          >
            <option value="">{campo.vazio}</option>
            {campo.opcoes.map(([valorOpcao, legenda]) => (
              <option key={valorOpcao} value={valorOpcao}>
                {legenda}
              </option>
            ))}
          </SelecaoSimples>
        ))}
        <Botao peso="secundario" marca="limpar-filtros" aoAtivar={limpar}>
          Limpar filtros
        </Botao>
      </form>
    </details>
  );
}

export function montarFiltrosCarteira(
  raiz: HTMLElement,
  opcoes: {
    administrador: boolean;
    responsaveis?: readonly ResponsavelOpcao[];
    inicial?: FiltrosCarteira;
  },
  aoFiltrar: AoFiltrar,
): () => void {
  return ilhaSincrona(raiz, <BarraFiltrosCarteira {...opcoes} aoFiltrar={aoFiltrar} />);
}

/** Selo do sinal operacional em um item da lista (FR-028).
 *
 * O aviso de que isto não é avaliação clínica fica no `title` e num texto lido por leitor
 * de tela — não pode depender de o motivo caber visualmente na linha da lista. */
export function SinalCarteira({ sinal }: { sinal: SinalCarteiraDoCaso }) {
  return (
    <span
      className="sinal-carteira max-w-full wrap-anywhere whitespace-normal"
      data-estado={sinal.estado}
      title={avisoSinalOperacional}
    >
      <strong>{rotulosEstadoSinal[sinal.estado]}</strong>
      <span className="sinal-carteira-motivos">{sinal.motivos.join(' · ')}</span>
      <span className="sr-only">{avisoSinalOperacional}</span>
    </span>
  );
}

/** O selo como nó solto, para `web/main.ts`, que ainda compõe a linha da carteira juntando
 *  `Node`s. Uma implementação só: o React acima é a fonte, e isto é a tomada. */
export function montarSinalCarteira(sinal: SinalCarteiraDoCaso): HTMLElement {
  return nodeDe(<SinalCarteira sinal={sinal} />);
}
