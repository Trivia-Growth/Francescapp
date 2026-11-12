import {
  salvarPlanoCriseSchema,
  type PlanoCrise,
  type PlanoCriseConteudo,
} from '../packages/contracts/src/plano-crise.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';

export type ServicoPlanoCrise = {
  consultar(pacienteId: string): Promise<PlanoCrise | null>;
  salvar(
    pacienteId: string,
    versaoEsperada: number,
    conteudo: PlanoCriseConteudo,
  ): Promise<PlanoCrise>;
  aprovar(pacienteId: string, registroId: string, versao: number): Promise<PlanoCrise>;
};

/** As duas frases abaixo são exigência do requisito, não texto de apoio: ficam sempre
 * visíveis e não dependem do que alguém digitou no plano. */
const AVISO_DIARIO =
  'O diário não garante resposta imediata. Em emergência, procure os contatos de urgência listados aqui.';
const AVISO_COORDENACAO =
  'A case manager coordena o cuidado e não emite conduta clínica por assumir a coordenação.';

const formatadorInstante = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'UTC',
});

function instanteLegivel(iso: string): string | null {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? null : formatadorInstante.format(instante);
}

function dataLegivel(data: string): string {
  const instante = new Date(`${data}T00:00:00Z`);
  return Number.isNaN(instante.getTime()) ? data : formatadorData.format(instante);
}

/** FR-020: plano de crise com responsáveis, contatos, limites do serviço e data de revisão.
 *
 * Aprovar é ação separada de salvar, e vale para a versão aprovada: editar o plano cria
 * versão nova, que nasce sem aprovação. Quem pode aprovar é decidido no servidor pela marca
 * de habilitação da concessão — a tela não esconde o botão para fingir permissão, ela explica
 * a recusa quando ela vem. */
export function montarPlanoCrise(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoPlanoCrise,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let versao = 0;
  let conflitoVersao = false;
  let pendente: { conteudo: PlanoCriseConteudo } | null = null;
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const status = elemento('p', 'Carregando plano de crise…');
  status.setAttribute('role', 'status');
  raiz.replaceChildren(status);

  const desenhar = (resultado: PlanoCrise | null) => {
    if (!ativa) return;
    versao = resultado?.versao ?? 0;
    const form = elemento('form');
    form.className = 'secao-plano-crise';
    form.append(elemento('h2', 'Plano de crise'));
    form.append(
      elemento(
        'p',
        'Combine antes quem procurar, em qual contato e até onde vai o serviço. Guarde também quando este plano precisa ser revisto.',
      ),
    );
    for (const texto of [AVISO_DIARIO, AVISO_COORDENACAO]) {
      const aviso = elemento('p', texto);
      aviso.className = 'plano-crise__limite';
      form.append(aviso);
    }

    const situacao = elemento('p');
    situacao.className = 'plano-crise__situacao';
    situacao.setAttribute('role', 'status');
    const aprovacao = resultado?.aprovacao ?? null;
    if (!resultado) situacao.textContent = 'Nenhum plano de crise registrado ainda.';
    else if (!aprovacao)
      situacao.textContent = `Versão ${resultado.versao} ainda sem aprovação do profissional habilitado.`;
    else {
      const quando = instanteLegivel(aprovacao.aprovado_em);
      situacao.textContent = quando
        ? `Versão ${resultado.versao} aprovada em ${quando}.`
        : `Versão ${resultado.versao} aprovada.`;
    }
    form.append(situacao);

    type LinhaResponsavel = {
      id: string;
      nome: HTMLInputElement;
      papel: HTMLInputElement;
      contato: HTMLInputElement;
    };
    type LinhaContato = { id: string; descricao: HTMLInputElement; telefone: HTMLInputElement };
    const responsaveis: LinhaResponsavel[] = [];
    const contatos: LinhaContato[] = [];
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');

    const campoTexto = (
      grupo: HTMLElement,
      rotulo: string,
      valor: string,
      dica?: string,
    ): HTMLInputElement => {
      const campo = elemento('input');
      campo.type = 'text';
      campo.maxLength = 200;
      campo.value = valor;
      if (dica) campo.placeholder = dica;
      const label = elemento('label', rotulo);
      label.append(campo);
      grupo.append(label);
      return campo;
    };

    const listaResponsaveis = elemento('div');
    listaResponsaveis.className = 'plano-crise__lista';
    const adicionarResponsavel = (valor?: PlanoCriseConteudo['responsaveis'][number]) => {
      const grupo = elemento('fieldset');
      grupo.className = 'plano-crise__item';
      grupo.append(elemento('legend', 'Responsável'));
      const linha: LinhaResponsavel = {
        id: valor?.id ?? crypto.randomUUID(),
        nome: campoTexto(grupo, 'Nome', valor?.nome ?? ''),
        papel: campoTexto(grupo, 'Papel', valor?.papel ?? '', 'Mãe, psiquiatra, escola…'),
        contato: campoTexto(grupo, 'Como falar', valor?.contato ?? '', 'Telefone, e-mail…'),
      };
      const remover = elemento('button', 'Remover responsável');
      remover.type = 'button';
      remover.addEventListener('click', () => {
        const posicao = responsaveis.indexOf(linha);
        if (posicao >= 0) responsaveis.splice(posicao, 1);
        grupo.remove();
        alteracaoPendente(true);
        aviso.textContent = 'Responsável removido do rascunho. Salve para confirmar.';
      });
      grupo.append(remover);
      responsaveis.push(linha);
      listaResponsaveis.append(grupo);
      return linha;
    };

    const listaContatos = elemento('div');
    listaContatos.className = 'plano-crise__lista';
    const adicionarContato = (valor?: PlanoCriseConteudo['contatos'][number]) => {
      const grupo = elemento('fieldset');
      grupo.className = 'plano-crise__item';
      grupo.append(elemento('legend', 'Contato de urgência'));
      const descricao = campoTexto(
        grupo,
        'Quando usar',
        valor?.descricao ?? '',
        'Crise fora do horário, risco imediato…',
      );
      const telefone = elemento('input');
      telefone.type = 'tel';
      telefone.maxLength = 100;
      telefone.value = valor?.telefone ?? '';
      const rotuloTelefone = elemento('label', 'Telefone');
      rotuloTelefone.append(telefone);
      grupo.append(rotuloTelefone);
      const linha: LinhaContato = { id: valor?.id ?? crypto.randomUUID(), descricao, telefone };
      const remover = elemento('button', 'Remover contato');
      remover.type = 'button';
      remover.addEventListener('click', () => {
        const posicao = contatos.indexOf(linha);
        if (posicao >= 0) contatos.splice(posicao, 1);
        grupo.remove();
        alteracaoPendente(true);
        aviso.textContent = 'Contato removido do rascunho. Salve para confirmar.';
      });
      grupo.append(remover);
      contatos.push(linha);
      listaContatos.append(grupo);
      return linha;
    };

    for (const valor of resultado?.conteudo.responsaveis ?? []) adicionarResponsavel(valor);
    for (const valor of resultado?.conteudo.contatos ?? []) adicionarContato(valor);

    const botaoResponsavel = elemento('button', 'Adicionar responsável');
    botaoResponsavel.type = 'button';
    botaoResponsavel.addEventListener('click', () => {
      const linha = adicionarResponsavel();
      alteracaoPendente(true);
      aviso.textContent = '';
      linha.nome.focus();
    });
    const botaoContato = elemento('button', 'Adicionar contato de urgência');
    botaoContato.type = 'button';
    botaoContato.addEventListener('click', () => {
      const linha = adicionarContato();
      alteracaoPendente(true);
      aviso.textContent = '';
      linha.descricao.focus();
    });

    form.append(elemento('h3', 'Quem responde'), listaResponsaveis, botaoResponsavel);
    form.append(elemento('h3', 'Contatos de urgência'), listaContatos, botaoContato);

    const limites = elemento('textarea');
    limites.rows = 4;
    limites.maxLength = 4000;
    limites.value = resultado?.conteudo.limites_servico ?? '';
    limites.placeholder = 'O que este serviço faz e o que não faz em uma crise.';
    const rotuloLimites = elemento('label', 'Limites do serviço');
    rotuloLimites.append(limites);
    const revisao = elemento('input');
    revisao.type = 'date';
    revisao.value = resultado?.conteudo.data_revisao ?? '';
    const rotuloRevisao = elemento('label', 'Data de revisão');
    rotuloRevisao.append(revisao);
    form.append(rotuloLimites, rotuloRevisao);
    const prazo = elemento('p');
    prazo.className = 'plano-crise__prazo';
    const atualizarPrazo = () => {
      const valor = revisao.value;
      if (!valor) {
        prazo.textContent = '';
        return;
      }
      const hoje = new Date().toISOString().slice(0, 10);
      prazo.textContent =
        valor < hoje
          ? `Revisão vencida em ${dataLegivel(valor)}.`
          : `Próxima revisão em ${dataLegivel(valor)}.`;
    };
    atualizarPrazo();
    revisao.addEventListener('change', atualizarPrazo);
    form.append(prazo);

    const salvar = elemento('button', 'Salvar plano de crise');
    salvar.type = 'submit';
    const retry = elemento('button', 'Tentar confirmar salvamento');
    retry.type = 'button';
    retry.hidden = true;
    const aprovar = elemento('button', 'Aprovar esta versão');
    aprovar.type = 'button';
    aprovar.hidden = !resultado || aprovacao !== null;
    const explicacaoAprovacao = elemento(
      'p',
      'Só profissional com habilitação registrada pela administração aprova o plano de crise.',
    );
    explicacaoAprovacao.className = 'plano-crise__explicacao';
    form.append(salvar, retry, aprovar, explicacaoAprovacao, aviso);
    if (resultado && aprovacao)
      form.append(
        elemento(
          'p',
          'Salvar qualquer alteração cria uma nova versão, que precisará de aprovação de novo.',
        ),
      );

    const conteudoDaTela = (): PlanoCriseConteudo =>
      ({
        responsaveis: responsaveis.map((linha) => ({
          id: linha.id,
          nome: linha.nome.value,
          papel: linha.papel.value,
          contato: linha.contato.value,
        })),
        contatos: contatos.map((linha) => ({
          id: linha.id,
          descricao: linha.descricao.value,
          telefone: linha.telefone.value,
        })),
        limites_servico: limites.value,
        data_revisao: revisao.value,
      }) as PlanoCriseConteudo;

    const bloquear = (bloqueado: boolean) => {
      salvar.disabled = retry.disabled = bloqueado;
      botaoResponsavel.disabled = botaoContato.disabled = bloqueado;
      aprovar.disabled = bloqueado;
    };

    const enviar = async () => {
      if (!pendente) return;
      bloquear(true);
      aviso.textContent = 'Salvando plano de crise…';
      try {
        const salvo = await servico.salvar(pacienteId, versao, pendente.conteudo);
        if (!ativa) return;
        pendente = null;
        alteracaoPendente(false);
        desenhar(salvo);
        const mensagem = raiz.querySelector('[role="status"]');
        if (mensagem) mensagem.textContent = 'Plano de crise salvo. Ainda falta aprovar.';
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        if (resultadoIncerto(erro)) {
          aviso.textContent =
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.';
          retry.hidden = false;
          retry.disabled = false;
        } else {
          pendente = null;
          conflitoVersao = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
          bloquear(false);
          salvar.disabled = conflitoVersao;
          retry.hidden = true;
          aviso.textContent = conflitoVersao
            ? 'O plano foi alterado por outra pessoa. Copie seu rascunho antes de recarregar a página; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro);
        }
      }
    };

    form.addEventListener('input', () => alteracaoPendente(true));
    form.addEventListener('change', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (pendente || conflitoVersao) return;
      const validada = salvarPlanoCriseSchema.safeParse({
        versao_esperada: versao,
        conteudo: conteudoDaTela(),
      });
      if (!validada.success) {
        aviso.textContent =
          'Preencha nome, papel e contato de cada responsável, quando usar e telefone de cada contato, os limites do serviço e a data de revisão.';
        const responsavelIncompleto = responsaveis.find(
          (linha) =>
            !linha.nome.value.trim() || !linha.papel.value.trim() || !linha.contato.value.trim(),
        );
        const contatoIncompleto = contatos.find(
          (linha) => !linha.descricao.value.trim() || !linha.telefone.value.trim(),
        );
        (
          responsavelIncompleto?.nome ??
          contatoIncompleto?.descricao ??
          (limites.value.trim() ? (revisao.value ? salvar : revisao) : limites)
        ).focus();
        return;
      }
      pendente = { conteudo: validada.data.conteudo };
      alteracaoPendente(true);
      void enviar();
    });
    retry.addEventListener('click', () => {
      void enviar();
    });
    aprovar.addEventListener('click', () => {
      if (!resultado || pendente) return;
      bloquear(true);
      aviso.textContent = 'Registrando aprovação…';
      void servico
        .aprovar(pacienteId, resultado.registro_id, resultado.versao)
        .then((aprovado) => {
          if (!ativa) return;
          alteracaoPendente(false);
          desenhar(aprovado);
          const mensagem = raiz.querySelector('[role="status"]');
          if (mensagem) mensagem.textContent = 'Plano de crise aprovado.';
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          // Recusa por falta de habilitação chega como `sem_permissao` (403), o mesmo código
          // de quem perdeu o acesso. Aqui ela é tratada antes do descarte de sessão: sem isso,
          // quem apenas não tem a marca seria expulso da ficha como se tivesse sido revogado.
          // As demais chamadas desta tela continuam descartando o acesso em 403.
          const naoHabilitado = erro instanceof FalhaApi && erro.codigo === 'sem_permissao';
          if (!naoHabilitado && descartarAcesso(erro)) return;
          bloquear(false);
          aviso.textContent = naoHabilitado
            ? 'Sua conta não tem habilitação para aprovar plano de crise. Peça à administração para registrar a habilitação.'
            : erro instanceof FalhaApi && erro.codigo === 'conflito_versao'
              ? 'O plano mudou desde que esta tela carregou. Recarregue e confira o texto antes de aprovar.'
              : mensagemFalha(erro);
        });
    });
    raiz.replaceChildren(form);
  };

  const consultar = () => {
    status.textContent = 'Carregando plano de crise…';
    raiz.replaceChildren(status);
    void servico
      .consultar(pacienteId)
      .then(desenhar)
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentarNovamente = elemento('button', 'Tentar novamente');
        tentarNovamente.type = 'button';
        tentarNovamente.addEventListener('click', consultar);
        raiz.append(tentarNovamente);
      });
  };
  consultar();
  return () => {
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
  };
}
