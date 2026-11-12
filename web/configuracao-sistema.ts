import {
  tipoConfiguracaoSchema,
  valorCompativel,
  valorConfiguracaoSchema,
  type ConfiguracaoSistema,
  type ValorConfiguracao,
} from '../packages/contracts/src/configuracao-sistema.ts';
import type { ServicoConfiguracaoSistema } from './servico-configuracao-sistema-http.ts';

const formatadorInstante = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function instanteLegivel(iso: string): string | null {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? null : formatadorInstante.format(instante);
}

/** Converte o que a pessoa digitou no tipo que a chave espera. Devolve `undefined` quando o
 * texto não forma um valor válido — a tela recusa antes de chamar o servidor, e o servidor
 * recusa de novo contra o tipo gravado no banco. */
function lerCampo(
  tipo: ConfiguracaoSistema['tipo'],
  controle: HTMLInputElement | HTMLTextAreaElement,
): ValorConfiguracao | undefined {
  if (tipo === 'booleano') return (controle as HTMLInputElement).checked;
  if (tipo === 'numero') {
    const numero = Number(controle.value.trim().replace(',', '.'));
    return controle.value.trim() && Number.isFinite(numero) ? numero : undefined;
  }
  if (tipo === 'texto') {
    const texto = controle.value.trim();
    return texto.length >= 1 && texto.length <= 600 ? texto : undefined;
  }
  const itens = controle.value
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);
  const validado = valorConfiguracaoSchema.safeParse(itens);
  return validado.success && Array.isArray(validado.data) ? validado.data : undefined;
}

function escreverCampo(
  tipo: ConfiguracaoSistema['tipo'],
  controle: HTMLInputElement | HTMLTextAreaElement,
  valor: ValorConfiguracao,
): void {
  if (tipo === 'booleano') (controle as HTMLInputElement).checked = valor === true;
  else if (Array.isArray(valor)) controle.value = valor.join('\n');
  else controle.value = String(valor);
}

/** Tela de administração da configuração do sistema.
 *
 * O catálogo de chaves vem do banco (definido por migration): a tela edita VALOR, nunca cria,
 * renomeia ou muda o tipo de uma chave. Ligar um serviço aqui não concede permissão a ninguém —
 * autorização continua sendo verificada no servidor e no banco a cada chamada. */
export function montarConfiguracaoSistema(
  raiz: HTMLElement,
  servico: ServicoConfiguracaoSistema,
  opcoes: { nomeDoUsuario?: (usuarioId: string) => string | undefined } = {},
): () => void {
  let ativa = true;
  const secao = document.createElement('section');
  secao.className = 'configuracao-sistema';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Configuração do sistema';
  const explicacao = document.createElement('p');
  explicacao.className = 'configuracao-sistema__explicacao';
  explicacao.textContent =
    'Estes ajustes valem para toda a plataforma. Mudar um valor aqui não dá nem tira permissão de ninguém: quem pode ver e editar cada coisa continua sendo decidido pelo acesso de cada pessoa.';
  const status = document.createElement('p');
  status.className = 'configuracao-sistema__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const lista = document.createElement('div');
  lista.className = 'configuracao-sistema__lista';
  const recarregar = document.createElement('button');
  recarregar.type = 'button';
  recarregar.className = 'button-secondary';
  recarregar.textContent = 'Recarregar';
  secao.append(titulo, explicacao, status, lista, recarregar);
  raiz.replaceChildren(secao);

  const desenhar = (itens: readonly ConfiguracaoSistema[]) => {
    lista.replaceChildren();
    if (itens.length === 0) {
      const vazio = document.createElement('p');
      vazio.className = 'configuracao-sistema__vazio';
      vazio.textContent = 'Nenhum ajuste disponível para esta conta.';
      lista.append(vazio);
      return;
    }
    for (const item of itens) {
      const tipo = tipoConfiguracaoSchema.parse(item.tipo);
      const formulario = document.createElement('form');
      formulario.className = 'configuracao-sistema__item';
      formulario.noValidate = true;
      const identificador = `configuracao-${item.chave.replace(/[^a-z0-9]+/g, '-')}`;
      const rotulo = document.createElement('label');
      rotulo.className = 'configuracao-sistema__rotulo';
      rotulo.htmlFor = identificador;
      rotulo.textContent = item.rotulo;
      let controle: HTMLInputElement | HTMLTextAreaElement;
      if (tipo === 'booleano') {
        const caixa = document.createElement('input');
        caixa.type = 'checkbox';
        controle = caixa;
      } else if (tipo === 'numero') {
        const numero = document.createElement('input');
        numero.type = 'number';
        numero.inputMode = 'decimal';
        controle = numero;
      } else if (tipo === 'texto') {
        const texto = document.createElement('input');
        texto.type = 'text';
        texto.maxLength = 600;
        controle = texto;
      } else {
        const area = document.createElement('textarea');
        area.rows = 4;
        area.placeholder = 'Uma opção por linha';
        controle = area;
      }
      controle.id = identificador;
      controle.className = 'configuracao-sistema__controle';
      escreverCampo(tipo, controle, item.valor);
      const ajuda = document.createElement('p');
      ajuda.className = 'configuracao-sistema__ajuda';
      ajuda.id = `${identificador}-ajuda`;
      const descricoes: string[] = [];
      if (item.descricao) descricoes.push(item.descricao);
      if (tipo === 'lista') descricoes.push('Escreva uma opção por linha.');
      ajuda.textContent = descricoes.join(' ');
      if (ajuda.textContent) controle.setAttribute('aria-describedby', ajuda.id);
      const autoria = document.createElement('p');
      autoria.className = 'configuracao-sistema__autoria';
      const quando = instanteLegivel(item.atualizado_em);
      if (item.atualizado_por_usuario_id) {
        const quem =
          opcoes.nomeDoUsuario?.(item.atualizado_por_usuario_id) ??
          `usuário ${item.atualizado_por_usuario_id.slice(0, 8)}`;
        autoria.textContent = quando
          ? `Última alteração por ${quem} em ${quando}.`
          : `Última alteração por ${quem}.`;
      } else {
        autoria.textContent = 'Ainda no valor original, sem alteração registrada.';
      }
      const salvar = document.createElement('button');
      salvar.type = 'submit';
      salvar.className = 'button-primary';
      salvar.textContent = 'Salvar';
      const aviso = document.createElement('p');
      aviso.className = 'configuracao-sistema__aviso';
      aviso.setAttribute('role', 'status');
      aviso.setAttribute('aria-live', 'polite');
      const acoes = document.createElement('div');
      acoes.className = 'configuracao-sistema__acoes';
      acoes.append(salvar, aviso);
      formulario.append(rotulo, controle);
      if (ajuda.textContent) formulario.append(ajuda);
      formulario.append(autoria, acoes);
      lista.append(formulario);

      formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (salvar.disabled) return;
        const valor = lerCampo(tipo, controle);
        if (valor === undefined || !valorCompativel(tipo, valor)) {
          aviso.textContent =
            tipo === 'lista'
              ? 'Escreva pelo menos uma opção, uma por linha.'
              : 'Confira o valor informado.';
          controle.focus();
          return;
        }
        salvar.disabled = true;
        controle.readOnly = tipo !== 'booleano' ? true : controle.readOnly;
        aviso.textContent = 'Salvando…';
        void servico
          .gravar({
            configuracao_chave: item.chave,
            valor,
            versao_esperada: item.versao,
          })
          .then((atualizado) => {
            if (!ativa) return;
            aviso.textContent = 'Salvo.';
            // Recarrega a lista inteira: a versão mudou e outras pessoas podem ter mexido
            // em outras chaves enquanto esta estava aberta.
            void carregar(`“${atualizado.rotulo}” salvo.`);
          })
          .catch((erro: unknown) => {
            if (!ativa) return;
            const codigo =
              erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
            aviso.textContent =
              codigo === 'conflito_versao'
                ? 'Alguém alterou este ajuste enquanto você editava. Recarregue e tente de novo.'
                : codigo === 'sem_permissao'
                  ? 'Sua conta não pode alterar esta configuração.'
                  : 'Não foi possível salvar. Tente de novo.';
            salvar.disabled = false;
            controle.readOnly = false;
          });
      });
    }
  };

  const carregar = async (mensagemInicial = 'Carregando ajustes…') => {
    status.textContent = mensagemInicial;
    recarregar.disabled = true;
    try {
      const itens = await servico.listar();
      if (!ativa) return;
      desenhar(itens);
      status.textContent =
        itens.length === 0
          ? 'Nenhum ajuste disponível.'
          : `${itens.length} ${itens.length === 1 ? 'ajuste disponível' : 'ajustes disponíveis'}.`;
    } catch {
      if (!ativa) return;
      lista.replaceChildren();
      status.textContent = 'Não foi possível carregar os ajustes. Tente recarregar.';
    } finally {
      if (ativa) recarregar.disabled = false;
    }
  };

  recarregar.addEventListener('click', () => void carregar());
  void carregar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
