import { useEffect, useRef, useState } from 'react';
import {
  tipoConfiguracaoSchema,
  valorCompativel,
  valorConfiguracaoSchema,
  type ConfiguracaoSistema,
  type ValorConfiguracao,
} from '../packages/contracts/src/configuracao-sistema.ts';
import type { ServicoConfiguracaoSistema } from './servico-configuracao-sistema-http.ts';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { Superficie } from './componentes/ui/superficie.js';
import { CaixaDeMarcacao } from './telas/caixa-de-marcacao.js';
import { Formulario } from './telas/formulario.js';
import { MolduraTela } from './telas/moldura-tela.js';
import { ilha } from './ponte/ilha.js';

const formatadorInstante = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function instanteLegivel(iso: string): string | null {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? null : formatadorInstante.format(instante);
}

type ControleConfiguracao = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Converte o que a pessoa digitou no tipo que a chave espera. Devolve `undefined` quando o
 * texto não forma um valor válido — a tela recusa antes de chamar o servidor, e o servidor
 * recusa de novo contra o tipo gravado no banco. */
function lerCampo(
  tipo: ConfiguracaoSistema['tipo'],
  controle: ControleConfiguracao,
): ValorConfiguracao | undefined {
  if (tipo === 'booleano') return (controle as HTMLInputElement).checked;
  if (tipo === 'numero') {
    const numero = Number(controle.value.trim().replace(',', '.'));
    return controle.value.trim() && Number.isFinite(numero) ? numero : undefined;
  }
  if (tipo === 'texto') {
    const texto = controle.value.trim();
    // Vazio é valor legítimo do catálogo (por exemplo, raiz Drive não configurada).
    // Restrições por chave pertencem ao servidor/banco, não a um piso global na tela.
    return texto.length <= 600 ? texto : undefined;
  }
  const itens = controle.value
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);
  const validado = valorConfiguracaoSchema.safeParse(itens);
  return validado.success && Array.isArray(validado.data) ? validado.data : undefined;
}

function textoDoValor(valor: ValorConfiguracao): string {
  return Array.isArray(valor) ? valor.join('\n') : String(valor);
}

function ajudaDoItem(item: ConfiguracaoSistema, tipo: ConfiguracaoSistema['tipo']): string {
  const descricoes: string[] = [];
  if (item.descricao) descricoes.push(item.descricao);
  if (tipo === 'lista') descricoes.push('Escreva uma opção por linha.');
  if (typeof item.minimo === 'number' && typeof item.maximo === 'number')
    descricoes.push(`Valor aceito entre ${String(item.minimo)} e ${String(item.maximo)}.`);
  else if (typeof item.minimo === 'number')
    descricoes.push(`Valor mínimo: ${String(item.minimo)}.`);
  else if (typeof item.maximo === 'number')
    descricoes.push(`Valor máximo: ${String(item.maximo)}.`);
  return descricoes.join(' ');
}

function autoriaDoItem(
  item: ConfiguracaoSistema,
  nomeDoUsuario?: (usuarioId: string) => string | undefined,
): string {
  const quando = instanteLegivel(item.atualizado_em);
  if (!item.atualizado_por_usuario_id) return 'Ainda no valor original, sem alteração registrada.';
  const quem =
    nomeDoUsuario?.(item.atualizado_por_usuario_id) ??
    `usuário ${item.atualizado_por_usuario_id.slice(0, 8)}`;
  return quando ? `Última alteração por ${quem} em ${quando}.` : `Última alteração por ${quem}.`;
}

/** Tela de administração da configuração do sistema.
 *
 * O catálogo de chaves vem do banco (definido por migration): a tela edita VALOR, nunca cria,
 * renomeia ou muda o tipo de uma chave. Ligar um serviço aqui não concede permissão a ninguém —
 * autorização continua sendo verificada no servidor e no banco a cada chamada. */
function Tela({
  servico,
  nomeDoUsuario,
}: {
  servico: ServicoConfiguracaoSistema;
  nomeDoUsuario?: (usuarioId: string) => string | undefined;
}) {
  const [tela, definirTela] = useState<{
    itens: readonly ConfiguracaoSistema[];
    geracao: number;
    carregando: boolean;
    status: string;
  }>({ itens: [], geracao: 0, carregando: true, status: 'Carregando ajustes…' });
  const ativa = useRef(true);
  const servicoRef = useRef(servico);
  servicoRef.current = servico;

  const carregar = async (mensagemInicial = 'Carregando ajustes…') => {
    definirTela((anterior) => ({ ...anterior, carregando: true, status: mensagemInicial }));
    try {
      const itens = await servicoRef.current.listar();
      if (!ativa.current) return;
      definirTela((anterior) => ({
        itens,
        geracao: anterior.geracao + 1,
        carregando: false,
        status:
          itens.length === 0
            ? 'Nenhum ajuste disponível.'
            : `${String(itens.length)} ${itens.length === 1 ? 'ajuste disponível' : 'ajustes disponíveis'}.`,
      }));
    } catch {
      if (!ativa.current) return;
      definirTela((anterior) => ({
        itens: [],
        geracao: anterior.geracao + 1,
        carregando: false,
        status: 'Não foi possível carregar os ajustes. Tente recarregar.',
      }));
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
      titulo="Configuração do sistema"
      explicacao="Estes ajustes valem para toda a plataforma. Mudar um valor aqui não dá nem tira permissão de ninguém: quem pode ver e editar cada coisa continua sendo decidido pelo acesso de cada pessoa."
      acao={
        <Botao disabled={tela.carregando} aoAtivar={() => void carregar()}>
          Recarregar
        </Botao>
      }
      status={tela.status}
      ocupado={tela.carregando}
    >
      {tela.itens.length === 0 ? (
        tela.carregando ? null : (
          <EstadoVazio titulo="Nenhum ajuste disponível para esta conta." />
        )
      ) : (
        <div className="grid gap-4" key={`ajustes-${String(tela.geracao)}`}>
          {tela.itens.map((item) => (
            <Ajuste
              key={item.chave}
              item={item}
              bloqueado={tela.carregando}
              nomeDoUsuario={nomeDoUsuario}
              aoGravar={async (valor) => {
                const atualizado = await servicoRef.current.gravar({
                  configuracao_chave: item.chave,
                  valor,
                  versao_esperada: item.versao,
                });
                if (!ativa.current) return;
                // Recarrega a lista inteira: a versão mudou e outras pessoas podem ter
                // mexido em outras chaves enquanto esta estava aberta.
                void carregar(`“${atualizado.rotulo}” salvo.`);
              }}
            />
          ))}
        </div>
      )}
    </MolduraTela>
  );
}

function Ajuste({
  item,
  bloqueado,
  nomeDoUsuario,
  aoGravar,
}: {
  item: ConfiguracaoSistema;
  bloqueado: boolean;
  nomeDoUsuario?: (usuarioId: string) => string | undefined;
  aoGravar: (valor: ValorConfiguracao) => Promise<void>;
}) {
  const tipo = tipoConfiguracaoSchema.parse(item.tipo);
  const [salvando, definirSalvando] = useState(false);
  const [aviso, definirAviso] = useState('');
  const identificador = `configuracao-${item.chave.replace(/[^a-z0-9]+/g, '-')}`;
  const ajuda = ajudaDoItem(item, tipo);
  const descrita = ajuda ? { 'aria-describedby': `${identificador}-ajuda` } : {};
  const opcoesConhecidas = tipo === 'texto' && item.opcoes && item.opcoes.length > 0;
  // Valor atual fora do catálogo não é descartado em silêncio: ele aparece marcado,
  // para a pessoa ver o que está valendo antes de trocar.
  const foraDaLista =
    opcoesConhecidas && typeof item.valor === 'string' && !item.opcoes?.includes(item.valor)
      ? item.valor
      : null;

  const enviar = (formulario: HTMLFormElement) => {
    if (salvando || bloqueado) return;
    const controle = formulario.elements.namedItem('valor') as ControleConfiguracao | null;
    if (!controle) return;
    const valor = lerCampo(tipo, controle);
    if (valor === undefined || !valorCompativel(tipo, valor)) {
      definirAviso(
        tipo === 'lista'
          ? 'Escreva pelo menos uma opção, uma por linha.'
          : 'Confira o valor informado.',
      );
      controle.focus();
      return;
    }
    definirSalvando(true);
    definirAviso('Salvando…');
    void aoGravar(valor)
      .then(() => {
        definirAviso('Salvo.');
      })
      .catch((erro: unknown) => {
        const codigo =
          erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
        definirAviso(
          codigo === 'conflito_versao'
            ? 'Alguém alterou este ajuste enquanto você editava. Recarregue e tente de novo.'
            : codigo === 'sem_permissao'
              ? 'Sua conta não pode alterar esta configuração.'
              : 'Não foi possível salvar. Tente de novo.',
        );
        definirSalvando(false);
      });
  };

  return (
    <Superficie titulo={item.rotulo} descricao={ajuda || undefined}>
      <Formulario aoEnviar={enviar} noValidate>
        {tipo === 'booleano' ? (
          <CaixaDeMarcacao
            id={identificador}
            name="valor"
            rotulo={item.rotulo}
            defaultChecked={item.valor === true}
            disabled={salvando}
            {...descrita}
          />
        ) : tipo === 'numero' ? (
          <Campo
            id={identificador}
            name="valor"
            rotulo={item.rotulo}
            tipo="number"
            inputMode="decimal"
            // A faixa vem do catálogo do banco (migration `20261128100000`), não da tela:
            // aqui ela só é APRESENTADA. Quem recusa valor fora da faixa é o banco; sem
            // isto a pessoa só descobriria a faixa ao receber a recusa.
            min={typeof item.minimo === 'number' ? item.minimo : undefined}
            max={typeof item.maximo === 'number' ? item.maximo : undefined}
            defaultValue={textoDoValor(item.valor)}
            readOnly={salvando}
            {...descrita}
          />
        ) : opcoesConhecidas ? (
          <SelecaoSimples
            id={identificador}
            name="valor"
            rotulo={item.rotulo}
            defaultValue={textoDoValor(item.valor)}
            disabled={salvando}
            {...descrita}
          >
            {foraDaLista === null ? null : (
              <option value={foraDaLista}>{`${foraDaLista} (fora da lista atual)`}</option>
            )}
            {(item.opcoes ?? []).map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </SelecaoSimples>
        ) : tipo === 'texto' ? (
          <Campo
            id={identificador}
            name="valor"
            rotulo={item.rotulo}
            maxLength={600}
            defaultValue={textoDoValor(item.valor)}
            readOnly={salvando}
            {...descrita}
          />
        ) : (
          <AreaTexto
            id={identificador}
            name="valor"
            rotulo={item.rotulo}
            placeholder="Uma opção por linha"
            defaultValue={textoDoValor(item.valor)}
            readOnly={salvando}
            {...descrita}
          />
        )}
        <p className="m-0 text-(length:--texto-1) text-texto-suave">
          {autoriaDoItem(item, nomeDoUsuario)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Botao peso="principal" tipo="submit" disabled={salvando}>
            Salvar
          </Botao>
          <p
            // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o que as telas e as provas já usam; `<output>` muda a semântica de formulário e o gancho que as provas procuram.
            role="status"
            aria-live="polite"
            className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {aviso}
          </p>
        </div>
      </Formulario>
    </Superficie>
  );
}

export function montarConfiguracaoSistema(
  raiz: HTMLElement,
  servico: ServicoConfiguracaoSistema,
  opcoes: { nomeDoUsuario?: (usuarioId: string) => string | undefined } = {},
): () => void {
  return ilha(raiz, <Tela servico={servico} nomeDoUsuario={opcoes.nomeDoUsuario} />);
}
