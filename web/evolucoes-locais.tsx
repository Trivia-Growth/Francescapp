/* Evoluções da demonstração local (prévia com dados fictícios), reconstruídas em React
 * sobre a ilha (`web/ponte/ilha.ts`).
 *
 * Contrato: `montarEvolucoesLocais(raiz, dados) => desmontar`. O único chamador é
 * `web/demonstracao.ts`, que remonta na mesma raiz a cada abertura (a ilha tolera) e
 * pendura um ouvinte `input` no `<form>` desenhado aqui para saber se há rascunho.
 *
 * O que NÃO mudou, de propósito:
 *
 * - `dados.evolucoes` continua sendo MUTADO por referência (`splice`) só depois de
 *   `aoSalvar` confirmar — falha preserva o rascunho digitado e a lista.
 * - Os controles são NÃO controlados: o DOM é dono do valor e a leitura é por `name`
 *   (`valorDe`), como em `web/orientacoes-local.tsx`.
 * - A validação nativa (`required`) continua ligada: sem `noValidate`, como na versão
 *   imperativa. A mensagem própria cobre o que ela não pega (texto só de espaços).
 *
 * O que mudou, e está no PR: a lista vazia virou um `<li>` — a versão imperativa escrevia
 * o texto direto dentro do `<ul>`, que não é conteúdo válido de lista. */
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';

export type EvolucaoLocal = {
  id: string;
  texto: string;
  data: string;
  autor: string;
  area: string;
  estado: 'rascunho' | 'publicada';
};

type Dados = {
  evolucoes: EvolucaoLocal[];
  aoSalvar: (evolucoes: EvolucaoLocal[]) => Promise<void>;
};

const rotuloEstado = (estado: EvolucaoLocal['estado']) =>
  estado === 'publicada' ? 'Publicada na prévia (simulação)' : 'Rascunho';

function EvolucoesLocais({ dados }: { dados: Dados }) {
  const [itens, definirItens] = useState<EvolucaoLocal[]>(() => [...dados.evolucoes]);
  const [salvando, definirSalvando] = useState(false);
  const [mensagem, definirMensagem] = useState('');

  async function enviar(formulario: HTMLFormElement) {
    if (salvando) return;
    const texto = valorDe(formulario, 'texto').trim();
    const data = valorDe(formulario, 'data');
    const autor = valorDe(formulario, 'autor').trim();
    const area = valorDe(formulario, 'area').trim();
    const estado = valorDe(formulario, 'estado');
    if (!texto || !data || !autor || !area || (estado !== 'rascunho' && estado !== 'publicada')) {
      definirMensagem('Informe texto, data, autor, área e estado.');
      return;
    }
    const proximas = [
      ...dados.evolucoes,
      { id: crypto.randomUUID(), texto, data, autor, area, estado } satisfies EvolucaoLocal,
    ];
    // Já estamos dentro do `flushSync` de `Formulario`: a trava entra no mesmo commit.
    definirSalvando(true);
    definirMensagem('Salvando…');
    try {
      await dados.aoSalvar(proximas);
      dados.evolucoes.splice(0, dados.evolucoes.length, ...proximas);
      flushSync(() => definirItens([...dados.evolucoes]));
      formulario.reset();
      definirMensagem('Evolução fictícia salva nesta prévia.');
    } catch {
      definirMensagem('Não foi possível guardar. O rascunho foi preservado.');
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <p className="m-0">
        Prévia fictícia: use somente dados fictícios. Publicação aqui é simulada.
      </p>
      <Formulario aoEnviar={enviar} className="grid min-w-0 max-w-[480px] gap-3">
        <AreaTexto
          id="evolucao-texto"
          name="texto"
          rotulo="Evolução fictícia"
          maxLength={5_000}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="evolucao-data"
          name="data"
          rotulo="Data"
          tipo="date"
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="evolucao-autor"
          name="autor"
          rotulo="Autor fictício"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="evolucao-area"
          name="area"
          rotulo="Área"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <SelecaoSimples
          id="evolucao-estado"
          name="estado"
          rotulo="Estado na prévia"
          disabled={salvando}
          classeEnvelope="mb-0"
        >
          <option value="rascunho">{rotuloEstado('rascunho')}</option>
          <option value="publicada">{rotuloEstado('publicada')}</option>
        </SelecaoSimples>
        <div className="flex flex-wrap gap-3">
          <Botao peso="principal" tipo="submit" disabled={salvando}>
            Registrar evolução fictícia
          </Botao>
        </div>
      </Formulario>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que a versão imperativa já expunha. */}
      <p role="status" className="m-0 empty:hidden">
        {mensagem}
      </p>
      <ul className="m-0 grid min-w-0 list-none gap-2 p-0">
        {!itens.length ? (
          <li>Nenhuma evolução fictícia registrada nesta prévia.</li>
        ) : (
          itens.map((item) => (
            <li key={item.id}>
              {`${rotuloEstado(item.estado)} · ${item.data} · ${item.autor} · ${item.area} · ${item.texto}`}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function montarEvolucoesLocais(raiz: HTMLElement, dados: Dados): () => void {
  return ilha(raiz, <EvolucoesLocais dados={dados} />);
}
