import { useEffect, useRef, useState } from 'react';
import type { RegraAtendimento } from '../packages/contracts/src/regras-atendimento.ts';
import type { ServicoRegrasAtendimento } from './servico-regras-atendimento-http.ts';
import { Botao } from './componentes/ui/botao.js';
import { Superficie } from './componentes/ui/superficie.js';
import { MolduraTela } from './telas/moldura-tela.js';
import { ilha } from './ponte/ilha.js';

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeZone: 'America/Sao_Paulo',
});

/** Ordem em que as regras aparecem. "Onde pedir ajuda" vem primeiro de propósito: FR-041 diz que
 * a pessoa deve encontrar onde pedir ajuda "sem precisar ler termos extensos". Chave que não
 * estiver nesta lista aparece depois, em ordem alfabética — o catálogo pode crescer por migration
 * sem que esta tela precise mudar. */
const ORDEM = [
  'ffcm.regras.canais',
  'ffcm.regras.funcionamento',
  'ffcm.regras.periodos',
  'ffcm.regras.diario',
];

function ordenar(itens: readonly RegraAtendimento[]): RegraAtendimento[] {
  return [...itens].sort((a, b) => {
    const posicaoA = ORDEM.indexOf(a.chave);
    const posicaoB = ORDEM.indexOf(b.chave);
    if (posicaoA !== posicaoB)
      return (posicaoA < 0 ? ORDEM.length : posicaoA) - (posicaoB < 0 ? ORDEM.length : posicaoB);
    return a.chave.localeCompare(b.chave, 'pt-BR');
  });
}

/** Regras de funcionamento, períodos, canais de retorno e uso do diário (FR-041).
 *
 * Somente leitura. Quem edita o texto é Administrador, na tela de configuração do sistema —
 * aqui não há formulário de propósito, para que a tela sirva igual a profissional, paciente e
 * familiar sem precisar de um caminho diferente por perfil. */
export function TelaRegrasAtendimento({ servico }: { servico: ServicoRegrasAtendimento }) {
  const [tela, definirTela] = useState<{
    itens: readonly RegraAtendimento[];
    carregando: boolean;
    status: string;
  }>({ itens: [], carregando: true, status: 'Carregando…' });
  const ativa = useRef(true);
  const servicoRef = useRef(servico);
  servicoRef.current = servico;

  const carregar = async () => {
    definirTela((anterior) => ({ ...anterior, carregando: true, status: 'Carregando…' }));
    try {
      const itens = await servicoRef.current.consultar();
      if (!ativa.current) return;
      definirTela({
        itens,
        carregando: false,
        status: itens.length === 0 ? 'As regras ainda não foram publicadas.' : '',
      });
    } catch {
      if (!ativa.current) return;
      definirTela({
        itens: [],
        carregando: false,
        status: 'Não foi possível carregar as regras. Tente recarregar.',
      });
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela. A máquina lê serviço, textos e estado por referência viva, então uma lista de dependências aqui só criaria releitura a cada repintura.
  useEffect(() => {
    void carregar();
    return () => {
      ativa.current = false;
    };
  }, []);

  return (
    <MolduraTela
      titulo="Como funciona e onde pedir ajuda"
      acao={
        <Botao disabled={tela.carregando} aoAtivar={() => void carregar()}>
          Recarregar
        </Botao>
      }
      status={tela.status}
      ocupado={tela.carregando}
    >
      {tela.itens.length === 0
        ? null
        : ordenar(tela.itens).map((item) => {
            const quando = new Date(item.atualizado_em);
            return (
              <Superficie key={item.chave} titulo={item.rotulo}>
                <p className="m-0 max-w-[68ch] whitespace-pre-line">{item.valor}</p>
                {Number.isNaN(quando.getTime()) ? null : (
                  <p className="mt-3 mb-0 text-(length:--texto-1) text-texto-suave">
                    {`Atualizado em ${formatadorData.format(quando)}.`}
                  </p>
                )}
              </Superficie>
            );
          })}
    </MolduraTela>
  );
}

export function montarRegrasAtendimento(
  raiz: HTMLElement,
  servico: ServicoRegrasAtendimento,
): () => void {
  return ilha(raiz, <TelaRegrasAtendimento servico={servico} />);
}
