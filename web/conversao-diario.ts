import type { RegistroDiario } from '../packages/contracts/src/diario.ts';
import { confirmarDescarte } from './confirmacao.js';
import {
  converterDiarioTarefaSchema,
  type ConverterDiarioTarefa,
  type ReciboConversaoDiarioTarefa,
} from '../packages/contracts/src/conversao-diario-tarefa.ts';
import type { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.ts';
import { iniciarAcao } from './esqueleto.ts';
import { botao as botaoDaCamada } from './ui/basicos.js';

type Ciclo = ReturnType<typeof criarCicloTarefaCuidado>;
type Conteudo = Omit<
  ConverterDiarioTarefa,
  'origem_versao' | 'tarefa_id' | 'reserva_id' | 'geracao_reserva'
>;
const conteudoSchema = converterDiarioTarefaSchema.omit({
  origem_versao: true,
  tarefa_id: true,
  reserva_id: true,
  geracao_reserva: true,
});
type Gravar = Parameters<typeof criarCicloTarefaCuidado>[0]['gravar'];
export type PortasConversaoDiario = {
  consultar(): Promise<ReciboConversaoDiarioTarefa | null>;
  converter(entrada: ConverterDiarioTarefa, chave: string): Promise<ReciboConversaoDiarioTarefa>;
  criarCiclo(gravar: Gravar): Ciclo;
  contexto(): Promise<{ escrita_disponivel: boolean; areas: readonly string[] }>;
  atual(): boolean;
  acessoPerdido(erro: unknown): void;
  desmontar(): void;
};
export type MontagemConversaoDiario = { desmontar(): void; invalidarOrigem(): void };

/** A porta de gravação do ciclo executa toda a conversão. Nunca encadeia tarefa + diário. */
export function montarConversaoDiario(
  raiz: HTMLElement,
  pacienteId: string,
  origem: RegistroDiario,
  portas: PortasConversaoDiario,
  pendente: (valor: boolean) => void,
  aoConcluir: () => void,
): MontagemConversaoDiario {
  if (origem.estado === 'rascunho') {
    raiz.replaceChildren();
    return { desmontar: () => portas.desmontar(), invalidarOrigem: () => {} };
  }
  let ativa = true;
  let origemAlterada = false;
  let ocupada = false;
  let liberada = false;
  let cercada = false;
  let houveEnvio = false;
  let areas: readonly string[] = [];
  let pedido: Conteudo | null = null;
  let reciboConfirmado: ReciboConversaoDiarioTarefa | null = null;
  const atual = () => ativa && !origemAlterada && portas.atual();
  const el = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const elemento = document.createElement(tipo);
    if (texto) elemento.textContent = texto;
    return elemento;
  };
  const abrir = botaoDaCamada({
    rotulo: 'Sinalizar atenção e converter em tarefa',
    peso: 'secundario',
  });
  const painel = el('section');
  painel.hidden = true;
  const titulo = el('h4', 'Converter registro em ação da equipe');
  const explicacao = el(
    'p',
    'A conversão cria uma tarefa e uma evolução interna da equipe. O registro original permanece intacto. Isto não envia retorno à família. Só é permitida uma conversão por registro.',
  );
  const aviso = el('p');
  aviso.setAttribute('role', 'status');
  aviso.setAttribute('aria-live', 'polite');
  const conferir = botaoDaCamada({ rotulo: 'Conferir e liberar conversão', peso: 'secundario' });
  const form = el('form');
  form.noValidate = true;
  form.hidden = true;
  const campo = <T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    nome: string,
    controle: T,
  ) => {
    const label = el('label', nome);
    controle.required = true;
    label.append(controle);
    form.append(label);
    return controle;
  };
  const motivo = campo('Motivo da atenção', el('textarea'));
  const data = campo('Data da atenção', el('input'));
  data.type = 'date';
  const encaminhamento = campo('Encaminhamento / descrição da ação', el('textarea'));
  const responsavel = campo('Responsável pela ação', el('input'));
  for (const controle of [motivo, encaminhamento, responsavel]) controle.maxLength = 2000;
  const prazo = campo('Prazo da ação', el('input'));
  prazo.type = 'date';
  const prioridade = campo('Prioridade', el('select'));
  for (const [valor, rotulo] of [
    ['', 'Selecione a prioridade'],
    ['baixa', 'Baixa'],
    ['media', 'Média'],
    ['alta', 'Alta'],
  ] as const) {
    const opcao = el('option', rotulo);
    opcao.value = valor;
    prioridade.append(opcao);
  }
  const area = campo('Área da evolução', el('select'));
  const salvar = botaoDaCamada({
    rotulo: 'Criar ação e evolução interna',
    tipo: 'submit',
    peso: 'principal',
  });
  const fechar = botaoDaCamada({ rotulo: 'Fechar conversão', peso: 'secundario' });
  form.append(salvar);
  painel.append(titulo, explicacao, aviso, conferir, form, fechar);
  raiz.replaceChildren(abrir, painel);
  const controles = [motivo, data, encaminhamento, responsavel, prazo, prioridade, area, salvar];
  const bloquear = (valor: boolean) => {
    for (const controle of controles) controle.disabled = valor;
  };
  const mostrarRecibo = (recibo: ReciboConversaoDiarioTarefa) => {
    reciboConfirmado = recibo;
    pedido = null;
    form.reset();
    liberada = false;
    form.hidden = conferir.hidden = true;
    aviso.textContent = `Este registro já foi convertido em ação da equipe em ${new Date(recibo.registrado_em).toLocaleString('pt-BR')}. Consulte a tarefa ${recibo.tarefa_id} na aba Tarefas. A evolução interna preserva a proveniência do registro original.`;
    pendente(false);
  };
  const falhou = (erro: unknown) => {
    if (!atual()) return;
    if (exigeNovoAcesso(erro)) {
      portas.acessoPerdido(erro);
      return;
    }
    liberada = false;
    bloquear(true);
    conferir.hidden = false;
    conferir.textContent = houveEnvio ? 'Conferir envio anterior' : 'Tentar conferir novamente';
    aviso.textContent = houveEnvio
      ? `${mensagemFalha(erro)} Não repita a conversão sem conferir o envio anterior.`
      : `${mensagemFalha(erro)} Confira novamente quando o serviço estiver disponível.`;
  };
  const ciclo = portas.criarCiclo(async (entrada) => {
    if (!atual() || !pedido) throw new Error('Conversão indisponível');
    reciboConfirmado = await portas.converter(
      {
        ...pedido,
        origem_versao: origem.versao,
        tarefa_id: entrada.tarefa_id,
        reserva_id: entrada.reserva_id,
        geracao_reserva: entrada.epoca,
      },
      entrada.chave,
    );
    if (!atual()) throw new Error('Sessão alterada');
  });
  let reconhecer = false;
  async function verificar() {
    liberada = false;
    bloquear(true);
    const contexto = await portas.contexto();
    if (!atual()) return;
    if (!contexto.escrita_disponivel || !contexto.areas.length) {
      aviso.textContent = !contexto.escrita_disponivel
        ? 'Conversão indisponível para este acesso ou configuração. Diário continua disponível.'
        : 'Áreas do diário indisponíveis. Confira a configuração antes de converter.';
      return;
    }
    if (areas.join('\n') !== contexto.areas.join('\n')) {
      const anterior = area.value;
      areas = contexto.areas;
      area.replaceChildren();
      const vazia = el('option', 'Selecione a área');
      vazia.value = '';
      area.append(vazia);
      for (const nome of areas) {
        const opcao = el('option', nome);
        opcao.value = nome;
        area.append(opcao);
      }
      area.value = areas.includes(anterior) ? anterior : '';
    }
    let recibo = await portas.consultar();
    if (!atual()) return;
    if (recibo) {
      mostrarRecibo(recibo);
      return;
    }
    if (reconhecer) {
      await ciclo.reconhecer();
      cercada = true;
      reconhecer = false;
    }
    let situacao = await ciclo.consultar();
    if (!situacao.resultado_pendente && (!cercada || situacao.reserva)) {
      await ciclo.encerrar();
      cercada = true;
      situacao = await ciclo.consultar();
    }
    if (!atual()) return;
    if (situacao.resultado_pendente) {
      aviso.textContent = `Um envio anterior ${situacao.resultado_pendente.resultado === 'confirmada' ? 'foi salvo' : 'não foi salvo'}. Confira a aba Tarefas antes de liberar outra conversão.`;
      reconhecer = true;
      conferir.textContent = 'Entendi, conferir e liberar';
      return;
    }
    if (situacao.reserva) throw new Error('Outro envio começou');
    // Ausência antes do encerramento não era prova. Consultar novamente após cercar.
    recibo = await portas.consultar();
    if (!atual()) return;
    if (recibo) {
      mostrarRecibo(recibo);
      return;
    }
    ciclo.liberar();
    liberada = true;
    form.hidden = false;
    bloquear(false);
    conferir.hidden = true;
    aviso.textContent = 'Informe todos os campos para registrar a ação e a atenção humana.';
  }
  const executar = async (botao: HTMLButtonElement, acao: () => Promise<void>) => {
    if (ocupada || !atual()) return;
    ocupada = true;
    botao.disabled = fechar.disabled = true;
    painel.setAttribute('aria-busy', 'true');
    const finalizar = iniciarAcao(botao);
    try {
      await acao();
    } catch (erro) {
      falhou(erro);
    } finally {
      finalizar();
      ocupada = false;
      painel.removeAttribute('aria-busy');
      if (atual()) {
        botao.disabled = botao === salvar && !liberada;
        fechar.disabled = false;
      }
    }
  };
  abrir.addEventListener('click', () => {
    painel.hidden = false;
    abrir.hidden = true;
    titulo.tabIndex = -1;
    titulo.focus();
    void executar(conferir, verificar);
  });
  conferir.addEventListener('click', () => void executar(conferir, verificar));
  form.addEventListener('input', () => pendente(true));
  form.addEventListener('change', () => pendente(true));
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!liberada || ocupada || !atual()) return;
    const entrada = conteudoSchema.safeParse({
      motivo: motivo.value.trim(),
      data_atencao: data.value,
      encaminhamento: encaminhamento.value.trim(),
      responsavel: responsavel.value.trim(),
      prazo: prazo.value,
      prioridade: prioridade.value,
      area: area.value,
    });
    if (!entrada.success || !areas.includes(area.value)) {
      aviso.textContent =
        'Informe motivo, data da atenção, encaminhamento, responsável, prazo, prioridade e área configurada.';
      motivo.focus();
      return;
    }
    const {
      motivo: texto,
      data_atencao,
      encaminhamento: acao,
      responsavel: quem,
      prazo: quando,
      prioridade: peso,
      area: rotulo,
    } = entrada.data;
    pedido = {
      motivo: texto,
      data_atencao,
      encaminhamento: acao,
      responsavel: quem,
      prazo: quando,
      prioridade: peso,
      area: rotulo,
    };
    void executar(salvar, async () => {
      // Última consulta antes de reservar: recibo existente impede nova criação.
      const existente = await portas.consultar();
      if (!atual()) return;
      if (existente) {
        mostrarRecibo(existente);
        return;
      }
      bloquear(true);
      liberada = false;
      cercada = false;
      houveEnvio = true;
      aviso.textContent = 'Aguardando confirmação da conversão…';
      await ciclo.gravar(pacienteId, crypto.randomUUID(), 0, {
        descricao: acao,
        responsavel: quem,
        prazo: quando,
        prioridade: peso,
        estado: 'pendente',
      });
      if (!atual()) return;
      if (!reciboConfirmado) throw new Error('Confirmação ausente');
      mostrarRecibo(reciboConfirmado);
      pedido = null;
      aoConcluir();
    });
  });
  fechar.addEventListener('click', () => {
    void (async () => {
      if (ocupada) return;
      if (
        [motivo, data, encaminhamento, responsavel, prazo, prioridade, area].some(
          (controle) => controle.value,
        ) &&
        !reciboConfirmado &&
        !(await confirmarDescarte('os campos não enviados desta conversão'))
      )
        return;
      form.reset();
      pedido = null;
      pendente(false);
      painel.hidden = true;
      abrir.hidden = false;
      abrir.focus();
    })();
  });
  return {
    desmontar: () => {
      ativa = false;
      pedido = null;
      form.reset();
      portas.desmontar();
      pendente(false);
      raiz.replaceChildren();
    },
    invalidarOrigem: () => {
      if (origemAlterada) return;
      origemAlterada = true;
      liberada = false;
      pedido = null;
      bloquear(true);
      conferir.hidden = true;
      portas.desmontar();
      aviso.textContent =
        'O registro de origem mudou. Os campos abaixo foram preservados para conferência, mas esta versão não pode mais ser enviada.';
    },
  };
}
