import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import type {
  RegistroExecucaoPublico,
  CandidatoTurnoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import type { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha } from './api.ts';
import {
  elementoTurno as el,
  campoTurno,
  selecaoTurno,
  botaoTurno,
  estadoTurno,
} from './turno-execucao-campos.ts';

type Ciclo = ReturnType<typeof criarCicloTarefaCuidado>;
type Gravar = Parameters<typeof criarCicloTarefaCuidado>[0]['gravar'];
export type PortasConversaoOcorrencia = {
  criarCiclo(gravar: Gravar): Ciclo;
  contexto(): Promise<{ escrita_disponivel: boolean; areas: readonly string[] }>;
  consultar(registroId: string): Promise<{ tarefa_id: string; evolucao_id: string } | null>;
};
export function montarConversaoOcorrenciaTurno(
  raiz: HTMLElement,
  pacienteId: string,
  origem: RegistroExecucaoPublico,
  servico: ServicoTurnoExecucao,
  portas: PortasConversaoOcorrencia,
  opcoes: { acessoPerdido(erro: unknown): void; alteracaoPendente(valor: boolean): void },
) {
  let ativa = true;
  let ocupada = false;
  let liberada = false;
  let reconhecer = false;
  let pedido: Omit<
    Parameters<ServicoTurnoExecucao['converterOcorrencia']>[0],
    'registro_id' | 'origem_versao' | 'tarefa_id' | 'reserva_id' | 'geracao_reserva'
  > | null = null;
  let confirmada = false;
  let candidatos: CandidatoTurnoPublico[] = [];
  let proximo: string | null = null;
  const secao = el('section');
  const status = estadoTurno();
  const conferir = botaoTurno('Conferir e liberar conversão', () => void executar(verificar));
  const form = el('form');
  const grupo = el('fieldset');
  grupo.append(el('legend', 'Converter ocorrência em ação e evolução interna'));
  const motivo = campoTurno(grupo, 'Motivo da atenção', { longo: true });
  const data = campoTurno(grupo, 'Data da atenção', { tipo: 'date' });
  const encaminhamento = campoTurno(grupo, 'Encaminhamento / ação acordada', { longo: true });
  const responsavel = selecaoTurno(
    grupo,
    'Responsável pela ação',
    [] as { valor: string; rotulo: string }[],
  );
  const mais = botaoTurno(
    'Mais responsáveis elegíveis',
    () => void executar(() => carregarCandidatos(proximo ?? undefined)),
  );
  mais.hidden = true;
  grupo.append(mais);
  const prazo = campoTurno(grupo, 'Prazo da ação', { tipo: 'date' });
  const prioridade = selecaoTurno(grupo, 'Prioridade informada', [
    { valor: 'baixa', rotulo: 'Baixa' },
    { valor: 'media', rotulo: 'Média' },
    { valor: 'alta', rotulo: 'Alta' },
  ]);
  const area = selecaoTurno(
    grupo,
    'Área configurada do diário',
    [] as { valor: string; rotulo: string }[],
  );
  const salvar = el('button', 'Criar tarefa e evolução interna atomicamente');
  salvar.type = 'submit';
  salvar.className = 'button-primary';
  grupo.append(salvar);
  form.append(grupo);
  form.hidden = true;
  secao.append(
    el('h4', 'Ação a partir desta ocorrência'),
    el(
      'p',
      'A ocorrência original permanece íntegra. A conversão registra atenção humana, tarefa e evolução interna numa única transação; nenhuma mensagem externa é enviada.',
    ),
    status,
    conferir,
    form,
  );
  raiz.replaceChildren(secao);
  const ciclo = portas.criarCiclo(async (entrada) => {
    if (!ativa || !pedido) throw new Error('Conversão indisponível.');
    await servico.converterOcorrencia(
      {
        ...pedido,
        registro_id: origem.registro_id,
        origem_versao: origem.versao,
        tarefa_id: entrada.tarefa_id,
        reserva_id: entrada.reserva_id,
        geracao_reserva: entrada.epoca,
      },
      entrada.chave,
    );
    if (!ativa) return;
    confirmada = true;
    pedido = null;
    opcoes.alteracaoPendente(false);
    status.textContent = 'Conversão confirmada: tarefa e evolução interna registradas.';
    form.hidden = true;
    conferir.hidden = true;
  });
  async function executar(acao: () => Promise<void>) {
    if (!ativa || ocupada) return;
    ocupada = true;
    grupo.disabled = true;
    conferir.disabled = true;
    try {
      await acao();
    } catch (erro) {
      if (!ativa) return;
      liberada = false;
      if (
        exigeNovoAcesso(erro) &&
        !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
      ) {
        ativa = false;
        pedido = null;
        raiz.replaceChildren();
        opcoes.acessoPerdido(erro);
        return;
      }
      status.textContent = `${mensagemFalha(erro)} Confira o resultado anterior antes de tentar novamente.`;
    } finally {
      ocupada = false;
      if (ativa) {
        grupo.disabled = !liberada;
        conferir.disabled = false;
      }
    }
  }
  async function carregarCandidatos(cursor?: string) {
    const pagina = await servico.candidatosMedicacao(cursor ? { cursor_id: cursor } : {});
    if (!ativa) return;
    candidatos = cursor ? [...candidatos, ...pagina.itens] : pagina.itens;
    proximo = pagina.proximo_cursor;
    const anterior = responsavel.value;
    responsavel.replaceChildren();
    const vazio = el('option', 'Selecione');
    vazio.value = '';
    responsavel.append(vazio);
    for (const pessoa of candidatos.filter((item) => item.nome?.trim())) {
      const opcao = el('option', pessoa.nome ?? '');
      opcao.value = pessoa.usuario_id;
      responsavel.append(opcao);
    }
    responsavel.value = anterior;
    mais.hidden = proximo === null;
  }
  async function verificar() {
    liberada = false;
    const recibo = await portas.consultar(origem.registro_id);
    if (!ativa) return;
    if (recibo) {
      confirmada = true;
      pedido = null;
      opcoes.alteracaoPendente(false);
      form.hidden = true;
      conferir.hidden = true;
      status.textContent = 'Esta ocorrência já foi convertida em tarefa e evolução interna.';
      return;
    }
    if (reconhecer) {
      await ciclo.reconhecer();
      reconhecer = false;
    }
    let situacao = await ciclo.consultar();
    if (situacao.resultado_pendente) {
      reconhecer = true;
      status.textContent =
        'Há resultado anterior aguardando ciência. Confira a seção Tarefas e clique para reconhecer e consultar novamente.';
      conferir.textContent = 'Entendi, reconhecer e conferir novamente';
      return;
    }
    await ciclo.encerrar();
    situacao = await ciclo.consultar();
    if (!ativa) return;
    if (situacao.resultado_pendente) {
      reconhecer = true;
      status.textContent =
        'Operação anterior resolvida. Confira a seção Tarefas e reconheça antes de liberar uma nova conversão.';
      return;
    }
    if (situacao.reserva) throw new Error('Reserva ainda pendente.');
    const confirmado = await portas.consultar(origem.registro_id);
    if (!ativa) return;
    if (confirmado) {
      confirmada = true;
      pedido = null;
      opcoes.alteracaoPendente(false);
      form.hidden = true;
      conferir.hidden = true;
      status.textContent = 'Conversão anterior confirmada; nenhum novo registro foi criado.';
      return;
    }
    const contexto = await portas.contexto();
    if (!ativa) return;
    if (!contexto.escrita_disponivel || !contexto.areas.length) {
      status.textContent =
        'Conversão indisponível: confira as permissões de tarefa e a configuração de áreas do diário.';
      return;
    }
    const escolhida = area.value;
    area.replaceChildren();
    const vazio = el('option', 'Selecione');
    vazio.value = '';
    area.append(vazio);
    for (const nome of contexto.areas) {
      const opcao = el('option', nome);
      opcao.value = nome;
      area.append(opcao);
    }
    area.value = escolhida;
    await carregarCandidatos();
    if (!ativa) return;
    ciclo.liberar();
    liberada = true;
    pedido = null;
    form.hidden = false;
    status.textContent = 'Confira os campos humanos para converter esta ocorrência.';
    conferir.textContent = 'Conferir conversão';
  }
  form.oninput = () => opcoes.alteracaoPendente(true);
  form.onsubmit = (evento) => {
    evento.preventDefault();
    if (!liberada || ocupada || confirmada) return;
    const pessoa = candidatos.find(
      (item) => item.usuario_id === responsavel.value && item.nome?.trim(),
    );
    if (
      !pessoa ||
      !motivo.value.trim() ||
      !encaminhamento.value.trim() ||
      !data.value ||
      !prazo.value ||
      !area.value ||
      !['baixa', 'media', 'alta'].includes(prioridade.value)
    ) {
      status.textContent = 'Preencha atenção, ação, responsável, prazo, prioridade e área.';
      return;
    }
    pedido = {
      motivo: motivo.value.trim(),
      data_atencao: data.value,
      encaminhamento: encaminhamento.value.trim(),
      responsavel: pessoa.nome ?? '',
      prazo: prazo.value,
      prioridade: prioridade.value as 'baixa' | 'media' | 'alta',
      area: area.value,
    };
    liberada = false;
    opcoes.alteracaoPendente(true);
    void executar(async () => {
      const existente = await portas.consultar(origem.registro_id);
      if (!ativa) return;
      if (existente) {
        confirmada = true;
        pedido = null;
        form.hidden = true;
        conferir.hidden = true;
        opcoes.alteracaoPendente(false);
        status.textContent = 'Ocorrência já convertida.';
        return;
      }
      if (!pedido) throw new Error('Pedido ausente.');
      await ciclo.gravar(pacienteId, crypto.randomUUID(), 0, {
        descricao: pedido.encaminhamento,
        responsavel: pedido.responsavel,
        prazo: pedido.prazo,
        prioridade: pedido.prioridade,
        estado: 'pendente',
      });
    });
  };
  grupo.disabled = true;
  return () => {
    ativa = false;
    pedido = null;
    candidatos = [];
    raiz.replaceChildren();
  };
}
