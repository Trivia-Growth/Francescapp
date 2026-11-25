import type { Turno } from '../packages/contracts/src/turno.ts';
import type { ServicoTurnoHttp } from './servico-turno-http.ts';
import type { DeclaracaoLocalizacao } from './turno-execucao-localizacao.ts';
import { montarPassagemTurno } from './passagem-turno.js';
import { botao } from './ui/basicos.js';

/** Seção da ficha da equipe. Regras de autorização continuam no servidor e banco. */
export function montarTurnoProprio(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTurnoHttp,
  opcoes: {
    acessoPerdido(): void;
    alteracaoPendente?(valor: boolean): void;
    montarExecucao?(
      raiz: HTMLElement,
      turno: Turno | null,
      alteracaoPendente: (valor: boolean) => void,
    ): () => void;
    localizacao?: {
      coletar(): Promise<DeclaracaoLocalizacao>;
      registrar(
        turnoId: string,
        momento: 'abertura' | 'encerramento',
        dados: DeclaracaoLocalizacao,
      ): Promise<void>;
    };
  },
): () => void {
  let ativa = true;
  let ocupada = false;
  let permiteAbrir = false;
  let pendente = false;
  let execucaoPendente = false;
  const alteracaoExecucao = (valor: boolean) => {
    execucaoPendente = valor;
    opcoes.alteracaoPendente?.(valor);
  };
  let desmontarPassagem = () => {};
  let desmontarExecucao = () => {};
  let localizacaoPendente: { turnoId: string; momento: 'abertura' | 'encerramento' } | null = null;
  const secao = document.createElement('section');
  secao.className = 'turno-proprio';
  const titulo = document.createElement('h3');
  titulo.textContent = 'Meu turno';
  const explicacao = document.createElement('p');
  explicacao.textContent =
    'Consulte ou abra seu turno neste caso. O horário de abertura é registrado pelo sistema.';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const conteudo = document.createElement('div');
  const formulario = document.createElement('form');
  const rotulo = document.createElement('label');
  const confirmar = document.createElement('input');
  confirmar.type = 'checkbox';
  rotulo.append(
    confirmar,
    document.createTextNode(' Confirmo que desejo abrir meu turno neste caso.'),
  );
  const abrir = botao({ rotulo: 'Abrir meu turno', tipo: 'submit', peso: 'principal' });
  const atualizar = botao({ rotulo: 'Atualizar turno', peso: 'secundario' });
  const recuperar = botao({ rotulo: 'Recuperar operação pendente', peso: 'secundario' });
  const acoes = document.createElement('div');
  acoes.className = 'turno-proprio__acoes';
  acoes.append(abrir, atualizar, recuperar);
  formulario.append(rotulo, acoes);
  const limite = document.createElement('p');
  limite.textContent = 'Encerrar exige síntese de passagem publicada e vinculada ao turno.';
  secao.append(titulo, explicacao, status, conteudo, formulario, limite);
  raiz.replaceChildren(secao);

  function controles() {
    secao.setAttribute('aria-busy', String(ocupada));
    confirmar.disabled = ocupada || !permiteAbrir || pendente;
    abrir.disabled = confirmar.disabled || !confirmar.checked;
    atualizar.disabled = ocupada;
    recuperar.disabled = ocupada || !pendente;
    rotulo.hidden = !permiteAbrir || pendente;
    abrir.hidden = !permiteAbrir || pendente;
    recuperar.hidden = !pendente;
  }
  function mostrar(turno: Turno | null) {
    desmontarPassagem();
    desmontarExecucao();
    conteudo.replaceChildren();
    permiteAbrir = !turno || turno.situacao === 'encerrado';
    if (!turno) {
      const vazio = document.createElement('p');
      vazio.textContent = 'Você não tem turno aberto neste caso.';
      conteudo.append(vazio);
      const execucao = document.createElement('div');
      conteudo.append(execucao);
      desmontarExecucao = opcoes.montarExecucao?.(execucao, null, alteracaoExecucao) ?? (() => {});
      return;
    }
    const lista = document.createElement('dl');
    const instante = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    for (const [nome, valor] of [
      ['Situação', turno.situacao === 'aberto' ? 'Aberto' : 'Encerrado'],
      ['Abertura registrada', instante.format(new Date(turno.aberto_em))],
      ['Duração prevista', `${turno.parametros.duracao_padrao_minutos} minutos`],
      ['Tolerância de atraso', `${turno.parametros.tolerancia_atraso_minutos} minutos`],
    ]) {
      const termo = document.createElement('dt');
      termo.textContent = nome ?? '';
      const valorElemento = document.createElement('dd');
      valorElemento.textContent = valor ?? '';
      lista.append(termo, valorElemento);
    }
    conteudo.append(lista);
    const execucao = document.createElement('div');
    conteudo.append(execucao);
    desmontarExecucao = opcoes.montarExecucao?.(execucao, turno, alteracaoExecucao) ?? (() => {});
    const passagemRaiz = document.createElement('div');
    conteudo.append(passagemRaiz);
    desmontarPassagem = montarPassagemTurno(passagemRaiz, pacienteId, turno, servico, {
      acessoPerdido: opcoes.acessoPerdido,
      alteracaoPendente: opcoes.alteracaoPendente,
      encerrar: async (registroId) => {
        if (!ativa || turno.situacao !== 'aberto') return;
        if (execucaoPendente)
          throw new Error('Conclua ou recupere o registro de execução antes de encerrar.');
        const barreira = await servico.consultarBarreira();
        if (!ativa) return;
        if (barreira.reserva || barreira.resultado_pendente) {
          pendente = true;
          controles();
          throw new Error('Recupere operação pendente');
        }
        pendente = true;
        opcoes.alteracaoPendente?.(true);
        controles();
        const reservaId = crypto.randomUUID();
        const reserva = await servico.reservar({
          epoca: barreira.epoca,
          reserva_id: reservaId,
          paciente_id: pacienteId,
          turno_id: turno.turno_id,
          versao_esperada: turno.versao,
        });
        if (!ativa) return;
        if (reserva.estado !== 'aberta') throw new Error('Reserva não confirmada');
        if (opcoes.localizacao)
          localizacaoPendente = { turnoId: turno.turno_id, momento: 'encerramento' };
        const fechado = await servico.encerrar(
          pacienteId,
          {
            turno_id: turno.turno_id,
            reserva_id: reservaId,
            geracao_reserva: barreira.epoca,
            versao_esperada: turno.versao,
            sintese_registro_id: registroId,
          },
          crypto.randomUUID(),
        );
        if (!ativa) return;
        await reconciliar();
        if (!ativa) return;
        if (pendente) throw new Error('Encerramento ainda exige reconciliação');
        await registrarLocalizacaoPendente();
        if (!ativa) return;
        mostrar(fechado);
        status.textContent = 'Turno encerrado com síntese publicada.';
        opcoes.alteracaoPendente?.(false);
        controles();
      },
    });
  }
  async function registrarLocalizacaoPendente() {
    const pendencia = localizacaoPendente;
    if (!pendencia || !opcoes.localizacao || !ativa) return;
    localizacaoPendente = null;
    // O cuidado já foi confirmado. Nem permissão pendente nem consulta de consentimento
    // bloqueiam a reconciliação clínica; ausência já existe atomicamente no servidor.
    const localizacao = opcoes.localizacao;
    void localizacao
      .coletar()
      .catch(() => ({ motivo_ausencia: 'falha' as const }))
      .then(async (dados) => {
        if (!ativa) return;
        try {
          await localizacao.registrar(pendencia.turnoId, pendencia.momento, dados);
        } catch {
          /* componente próprio oferece recuperação */
        }
      });
  }
  function falhou(erro: unknown) {
    if (!ativa) return;
    conteudo.replaceChildren();
    permiteAbrir = false;
    confirmar.checked = false;
    const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
    if (codigo === 'nao_autenticado' || codigo === 'sem_permissao') {
      ativa = false;
      desmontarPassagem();
      desmontarExecucao();
      localizacaoPendente = null;
      raiz.replaceChildren();
      opcoes.acessoPerdido();
      return;
    }
    status.textContent =
      codigo === 'conflito_versao' || codigo === 'conflito_idempotencia'
        ? 'A abertura não foi confirmada. Atualize ou recupere a operação; você pode ter um turno aberto em outro caso.'
        : pendente
          ? 'Não foi possível confirmar o resultado. Recupere a operação antes de abrir outro turno.'
          : 'Não foi possível consultar seu turno. O recurso pode estar indisponível. Tente atualizar.';
  }
  async function executar(mensagem: string, acao: () => Promise<void>) {
    if (!ativa || ocupada) return;
    ocupada = true;
    status.textContent = mensagem;
    controles();
    try {
      await acao();
    } catch (erro) {
      falhou(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function carregar() {
    const barreira = await servico.consultarBarreira();
    if (!ativa) return;
    pendente = Boolean(barreira.reserva || barreira.resultado_pendente);
    const atual = await servico.consultarAtual(pacienteId);
    if (!ativa) return;
    const turno = atual ?? (await servico.consultarUltimo(pacienteId));
    if (!ativa) return;
    mostrar(turno);
    status.textContent = pendente
      ? 'Existe uma operação pendente. Recupere o resultado antes de abrir outro turno.'
      : 'Consulta atualizada.';
  }
  async function reconciliar() {
    let barreira = await servico.consultarBarreira();
    if (!ativa) return;
    if (barreira.reserva) {
      // Encerrar esta barreira resolve a operação; nunca encerra o turno clínico.
      const encerramento = await servico.encerrarBarreira({
        epoca: barreira.epoca,
        reserva_id: barreira.reserva.id,
        comando_id: crypto.randomUUID(),
      });
      if (!ativa) return;
      if (encerramento.estado !== 'confirmada' && encerramento.estado !== 'cancelada')
        throw new Error('Barreira não reconciliada');
      barreira = await servico.consultarBarreira();
      if (!ativa) return;
    }
    if (barreira.reserva) throw new Error('Operação ainda pendente');
    const resultado = barreira.resultado_pendente;
    if (resultado) {
      if (resultado.paciente_id.toLowerCase() !== pacienteId.toLowerCase()) {
        pendente = true;
        permiteAbrir = false;
        conteudo.replaceChildren();
        status.textContent =
          'A operação pendente pertence a outro caso. Abra a ficha de origem e recupere por lá.';
        return;
      }
      if (resultado.resultado === 'confirmada') {
        const turno = await servico.consultar(pacienteId, resultado.turno_id);
        if (!ativa) return;
        if (!turno) throw new Error('Turno não confirmado');
        await registrarLocalizacaoPendente();
        if (!ativa) return;
        // Não reconhecer antes de consultar: uma falha mantém IDs recuperáveis no servidor.
      }
      if (resultado.resultado === 'cancelada') localizacaoPendente = null;
      const reconhecimento = await servico.reconhecer({ comando_id: resultado.recibo_id });
      if (!ativa) return;
      if (reconhecimento.estado !== 'reconhecido') throw new Error('Resultado ainda pendente');
    }
    await carregar();
    if (ativa && !pendente)
      status.textContent =
        resultado?.resultado === 'cancelada'
          ? 'A operação anterior foi cancelada sem abrir turno. Consulta atualizada.'
          : 'Resultado recuperado e consulta atualizada.';
  }
  confirmar.addEventListener('change', controles);
  atualizar.addEventListener('click', () => {
    if (execucaoPendente) {
      status.textContent =
        'Conclua, cancele ou recupere a edição de execução antes de atualizar o turno.';
      return;
    }
    void executar('Consultando seu turno…', carregar);
  });
  recuperar.addEventListener('click', () => void executar('Recuperando resultado…', reconciliar));
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (abrir.disabled || !confirmar.checked || !permiteAbrir || pendente || execucaoPendente)
      return;
    void executar('Abrindo seu turno…', async () => {
      const barreira = await servico.consultarBarreira();
      if (!ativa) return;
      if (barreira.reserva || barreira.resultado_pendente) {
        pendente = true;
        status.textContent = 'Existe uma operação pendente. Recupere antes de abrir outro turno.';
        return;
      }
      const turnoId = crypto.randomUUID();
      const reservaId = crypto.randomUUID();
      pendente = true;
      confirmar.checked = false;
      const reserva = await servico.reservar({
        epoca: barreira.epoca,
        reserva_id: reservaId,
        paciente_id: pacienteId,
        turno_id: turnoId,
        versao_esperada: 0,
      });
      if (!ativa) return;
      if (reserva.estado !== 'aberta') throw new Error('Reserva não confirmada');
      if (opcoes.localizacao) localizacaoPendente = { turnoId, momento: 'abertura' };
      // Geração é a época recebida do servidor, conferida na reserva e no SQL de abertura.
      await servico.abrir(
        pacienteId,
        { turno_id: turnoId, reserva_id: reservaId, geracao_reserva: barreira.epoca },
        crypto.randomUUID(),
      );
      if (!ativa) return;
      await reconciliar();
    });
  });
  controles();
  void executar('Consultando seu turno…', carregar);
  return () => {
    ativa = false;
    desmontarPassagem();
    desmontarExecucao();
    localizacaoPendente = null;
    raiz.replaceChildren();
  };
}
