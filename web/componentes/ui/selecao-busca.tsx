/** Seleção com busca — o combobox que `componentes.md` §16 registra como lacuna.
 *
 *  A seleção sem busca (`web/ui/selecao.ts`) só tem salto por letra. Em lista longa —
 *  equipe, paciente, procedimento — isso não encontra nada: ou a pessoa sabe a primeira
 *  letra do rótulo exato, ou rola. Aqui o filtro é por qualquer pedaço do texto, sem
 *  acento e sem caixa, com `toLocaleLowerCase('pt-BR')`, que é o mesmo critério que
 *  `selecao.ts:177` já usa para o salto.
 *
 *  DECISÃO DE DONO DO VALOR — PENDENTE DE COORDENAÇÃO. `componentes.md` §4 diz, com todas
 *  as letras, que isto "é decisão a registrar na tarefa, não a improvisar": enquanto
 *  houver tela não migrada lendo o `<select>`, ou o componente continua emitindo
 *  `input`+`change` num `<select>` nativo espelhado, ou a tela migrada escreve no estado
 *  React e o adaptador HTTP recebe o valor direto. ESTE ARQUIVO IMPLEMENTA O SEGUNDO
 *  CAMINHO, e só ele: o valor é controlado por `valor`/`aoMudarValor`. Para o formulário
 *  não sair vazio (risco 13), `nome` monta um `<input type="hidden">` que o `FormData`
 *  enxerga. O espelho do `<select>` com `input`+`change` NÃO foi implementado; se alguma
 *  tela ainda depender dele, isso volta à coordenação em vez de ser inventado aqui.
 *
 *  O que se perde em relação à camada anterior, declarado e não disfarçado: ali o
 *  `<select>` nativo ficava no documento e uma falha de script devolvia um controle
 *  funcionando (`selecao.ts:53-55`, risco 20). Em React o nativo some por construção. A
 *  garantia muda de natureza; não foi preservada.
 */
import { Command } from 'cmdk';
import { type ReactNode, useId, useState } from 'react';
import { juntar } from './juntar';
import { ConteudoPopover, GatilhoPopover, Popover } from './popover';

export type OpcaoSelecao = {
  valor: string;
  rotulo: string;
  desligada?: boolean;
};

export type PedidoSelecaoBusca = {
  /** Rótulo da tela. É ele que nomeia o controle — nada de rótulo duplicado só para o
   *  widget, como já valia em `selecao.ts:82-88`. */
  rotulo: string;
  opcoes: readonly OpcaoSelecao[];
  valor: string;
  aoMudarValor: (valor: string) => void;
  /** Texto do gatilho quando nada foi escolhido. Pinta `--muted` por `data-vazio`. */
  textoVazio?: string;
  textoBusca?: string;
  /** O que aparece quando a busca não encontra nada. Diz o que fazer, não só "vazio". */
  textoSemResultado?: string;
  nome?: string;
  desligada?: boolean;
  invalida?: boolean;
  obrigatoria?: boolean;
  descritaPor?: string;
  classe?: string;
};

/** Mesmo critério de comparação do salto por letra da seleção atual, mais a retirada de
 *  acento: quem digita "jose" precisa achar "José", e quem digita "SAO" precisa achar
 *  "São". `NFD` separa o acento do caractere; o recorte apaga o acento. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

const GATILHO = juntar(
  'flex min-h-[48px] w-full min-w-0 items-center justify-between gap-3',
  'rounded-campo border border-borda-forte bg-superficie px-3 py-[10px]',
  'text-left text-2 text-texto',
  'aria-[invalid=true]:border-erro disabled:cursor-not-allowed disabled:opacity-60',
);

const OPCAO = juntar(
  'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-campo px-3 py-2',
  'text-2 text-texto',
  'data-[selected=true]:bg-superficie-2',
  // cmdk escreve `aria-selected` para a opção SOB O CURSOR; a escolhida é outra coisa.
  'data-[escolhida=true]:font-semibold',
  'data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-60',
);

export function SelecaoBusca({
  rotulo,
  opcoes,
  valor,
  aoMudarValor,
  textoVazio = 'Selecione',
  textoBusca = 'Buscar…',
  textoSemResultado = 'Nada encontrado com esse texto. Tente outro trecho do nome.',
  nome,
  desligada,
  invalida,
  obrigatoria,
  descritaPor,
  classe,
}: PedidoSelecaoBusca): ReactNode {
  const [aberta, definirAberta] = useState(false);
  const marca = useId();
  const escolhida = opcoes.find((opcao) => opcao.valor === valor);

  return (
    <div className={juntar('min-w-0', classe)} data-selecao-busca="">
      <span id={`${marca}-rotulo`} className="mb-1 block text-1 text-texto-suave">
        {rotulo}
      </span>
      <Popover open={aberta} onOpenChange={definirAberta}>
        <GatilhoPopover
          id={`${marca}-gatilho`}
          // biome-ignore lint/a11y/useSemanticElements: trocar o `<select>` é o propósito deste componente — o nativo não filtra, abre a roleta do sistema no celular e não segue a linguagem visual do produto (`selecao.ts:4-12`). O contrato de combobox é mantido à mão.
          role="combobox"
          aria-haspopup="listbox"
          aria-labelledby={`${marca}-rotulo ${marca}-gatilho`}
          {...(descritaPor ? { 'aria-describedby': descritaPor } : {})}
          {...(invalida ? { 'aria-invalid': true } : {})}
          {...(obrigatoria ? { 'aria-required': true } : {})}
          disabled={desligada}
          className={GATILHO}
        >
          <span
            className="truncate data-[vazio=sim]:text-texto-suave"
            data-vazio={escolhida ? 'nao' : 'sim'}
          >
            {escolhida?.rotulo ?? textoVazio}
          </span>
          {/* Seta: área e filete, nunca texto — o oliva não tem contraste de leitura. */}
          <span
            aria-hidden="true"
            className="size-[10px] flex-none rotate-45 border-r-2 border-b-2 border-marca"
          />
        </GatilhoPopover>
        <ConteudoPopover className="p-0">
          <Command
            // Nome distinto do gatilho de propósito: são dois controles diferentes, e dois
            // comboboxes com o mesmo nome deixam a leitura de tela ambígua.
            label={`Buscar ${rotulo}`}
            filter={(valorItem, busca) =>
              normalizar(valorItem).includes(normalizar(busca)) ? 1 : 0
            }
          >
            <Command.Input
              aria-label={`Buscar ${rotulo}`}
              placeholder={textoBusca}
              className="w-full min-w-0 border-0 border-b border-borda bg-superficie px-3 py-2 text-2 text-texto"
            />
            <Command.List className="max-h-[15rem] overflow-y-auto overscroll-contain p-1">
              <Command.Empty className="px-3 py-2 text-1 text-texto-suave">
                {textoSemResultado}
              </Command.Empty>
              {opcoes.map((opcao) => (
                <Command.Item
                  key={opcao.valor}
                  value={opcao.rotulo}
                  disabled={opcao.desligada}
                  data-escolhida={opcao.valor === valor}
                  className={OPCAO}
                  onSelect={() => {
                    aoMudarValor(opcao.valor);
                    definirAberta(false);
                  }}
                >
                  {opcao.rotulo}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </ConteudoPopover>
      </Popover>
      {/* Para o formulário não sair vazio: é o valor que o `FormData` envia. */}
      {nome ? <input type="hidden" name={nome} value={valor} /> : null}
    </div>
  );
}
