import {
  atualizarPacienteSchema,
  type AtualizarPaciente,
  type PacienteEdicao,
} from '../packages/contracts/src/index.js';
import {
  descreverResponsavel,
  rotulosSituacao,
  type ResponsavelOpcao,
} from './acompanhamento-caso.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import type { criarCicloEdicaoPaciente } from './ciclo-edicao-paciente.js';
import { dataDeInstante } from './datas.js';
import { esqueletoCarregando } from './esqueleto.js';

export type ServicoEdicaoPaciente = {
  consultarPaciente(pacienteId: string): Promise<PacienteEdicao>;
  /** Ausente quando o perfil não pode listar a equipe: a situação segue editável, o responsável não. */
  listarResponsaveis?: () => Promise<ResponsavelOpcao[]>;
  ciclo: ReturnType<typeof criarCicloEdicaoPaciente>;
};

/** Interface preparada para integração segura; não ativa rota nem autoriza acesso. */
/** O primeiro retrato, gravado com o cadastro do caso, não tem motivo. */
const textoMotivo = (motivo: string | null) =>
  motivo === null ? 'Registrado no cadastro do caso.' : `Motivo: ${motivo}`;

export function montarEdicaoPaciente(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoEdicaoPaciente,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let bloqueada = true;
  let recuperando = false;
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const descartarAcesso = (erro: unknown) => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const status = elemento('p', 'Carregando cadastro…');
  status.setAttribute('role', 'status');
  let equipe: ResponsavelOpcao[] = [];
  const textoSituacao = (mudanca: PacienteEdicao['acompanhamento'][number] | undefined) =>
    mudanca?.situacao ? rotulosSituacao[mudanca.situacao] : 'a completar';
  const desenhar = (paciente: PacienteEdicao) => {
    if (!ativa) return;
    const vigente = paciente.acompanhamento[0];
    const resumo = elemento('section');
    resumo.className = 'caso-resumo';
    const desenharResumo = () => {
      const lista = elemento('ul');
      lista.className = 'visao-lista';
      lista.append(
        elemento('li', `Situação: ${textoSituacao(vigente)}`),
        elemento(
          'li',
          `Responsável: ${vigente ? descreverResponsavel(vigente, equipe) : 'a completar'}`,
        ),
      );
      if (vigente)
        lista.append(
          elemento(
            'li',
            `Desde ${dataDeInstante(vigente.criado_em) ?? 'data indisponível'}. ${textoMotivo(vigente.motivo)}`,
          ),
        );
      const faltantes = [
        ...(paciente.nome_preferencia ? [] : ['nome de preferência']),
        ...(paciente.data_nascimento ? [] : ['data de nascimento']),
        ...(paciente.contatos.length ? [] : ['contato']),
        ...(vigente?.situacao ? [] : ['situação do caso']),
        ...(vigente?.responsavel_id ? [] : ['responsável']),
      ];
      const partes: HTMLElement[] = [elemento('h3', 'Situação e responsável do caso'), lista];
      if (faltantes.length) {
        const aviso = elemento('p', `A completar: ${faltantes.join(', ')}.`);
        aviso.className = 'visao-aviso';
        partes.push(aviso);
      }
      if (paciente.acompanhamento.length > 1) {
        const historico = elemento('details');
        historico.append(
          elemento('summary', `Histórico de mudanças (${paciente.acompanhamento.length})`),
        );
        const itens = elemento('ol');
        for (const mudanca of paciente.acompanhamento)
          itens.append(
            elemento(
              'li',
              `${dataDeInstante(mudanca.criado_em) ?? 'Data indisponível'} · Situação: ${textoSituacao(mudanca)} · Responsável: ${descreverResponsavel(mudanca, equipe)} · ${textoMotivo(mudanca.motivo)}`,
            ),
          );
        historico.append(itens);
        partes.push(historico);
      }
      resumo.replaceChildren(...partes);
    };
    const form = elemento('form');
    const campos = elemento('fieldset');
    campos.append(elemento('legend', 'Editar paciente'));
    const nome = elemento('input');
    nome.required = true;
    nome.maxLength = 200;
    nome.value = paciente.nome;
    const preferencia = elemento('input');
    preferencia.maxLength = 200;
    preferencia.value = paciente.nome_preferencia ?? '';
    const nascimento = elemento('input');
    nascimento.type = 'date';
    nascimento.value = paciente.data_nascimento ?? '';
    const motivo = elemento('textarea');
    motivo.required = true;
    motivo.maxLength = 500;
    const rotular = (texto: string, controle: HTMLElement) => {
      const label = elemento('label', texto);
      label.append(controle);
      campos.append(label);
    };
    rotular('Nome', nome);
    rotular('Nome de preferência', preferencia);
    rotular('Data de nascimento', nascimento);
    const situacao = elemento('select');
    situacao.append(new Option('Selecione…', ''));
    for (const [valor, rotulo] of Object.entries(rotulosSituacao))
      situacao.append(new Option(rotulo, valor));
    situacao.value = vigente?.situacao ?? '';
    const responsavel = elemento('select');
    responsavel.append(new Option('Carregando equipe…', ''));
    responsavel.disabled = true;
    rotular('Situação do caso', situacao);
    rotular('Responsável (case manager)', responsavel);
    const indicarEquipe = (textoVazio: string, opcoes: ResponsavelOpcao[] = []) => {
      const ativos = opcoes.filter((opcao) => opcao.ativo);
      responsavel.replaceChildren(
        new Option(ativos.length || !textoVazio ? 'Selecione…' : textoVazio, ''),
        ...ativos.map((opcao) => new Option(opcao.rotulo, opcao.usuario_id)),
      );
      responsavel.disabled = ativos.length === 0;
      responsavel.value = ativos.some((opcao) => opcao.usuario_id === vigente?.responsavel_id)
        ? (vigente?.responsavel_id ?? '')
        : '';
    };
    if (servico.listarResponsaveis)
      void servico
        .listarResponsaveis()
        .then((opcoes) => {
          if (!ativa) return;
          equipe = opcoes;
          indicarEquipe('Nenhuma pessoa ativa na equipe', opcoes);
          desenharResumo();
        })
        .catch((erro: unknown) => {
          if (!ativa || descartarAcesso(erro)) return;
          indicarEquipe('Não foi possível listar a equipe; recarregue o cadastro');
        });
    else indicarEquipe('Listagem da equipe indisponível para este perfil');
    rotular('Motivo da alteração', motivo);
    const salvar = elemento('button', 'Salvar alterações');
    salvar.type = 'submit';
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    form.append(campos, salvar, aviso);
    const enviar = async (entrada: AtualizarPaciente) => {
      campos.disabled = salvar.disabled = true;
      aviso.textContent = 'Salvando cadastro…';
      try {
        await servico.ciclo.editar(pacienteId, entrada);
        if (!ativa) return;
        aviso.textContent = 'Alterações enviadas. Confira o resultado antes de continuar.';
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        aviso.textContent =
          erro instanceof FalhaApi && !resultadoIncerto(erro)
            ? `${mensagemFalha(erro)} Nada foi alterado; confira o cadastro e tente de novo. O rascunho permanece nesta tela.`
            : 'Não deu para saber se as alterações foram salvas. Confira o cadastro antes de editar de novo; o rascunho permanece nesta tela.';
      }
      bloqueada = true;
      recuperar.textContent = 'Conferir o que foi salvo';
      recuperar.hidden = false;
      recuperar.disabled = false;
    };
    form.addEventListener('input', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (bloqueada || recuperando) return;
      const dados = {
        ...(nome.value.trim() !== paciente.nome ? { nome: nome.value } : {}),
        ...(preferencia.value.trim() !== (paciente.nome_preferencia ?? '')
          ? { nome_preferencia: preferencia.value.trim() || null }
          : {}),
        ...(nascimento.value !== (paciente.data_nascimento ?? '')
          ? { data_nascimento: nascimento.value || null }
          : {}),
        ...(situacao.value && situacao.value !== (vigente?.situacao ?? '')
          ? { situacao: situacao.value }
          : {}),
        ...(responsavel.value && responsavel.value !== (vigente?.responsavel_id ?? '')
          ? { responsavel_id: responsavel.value }
          : {}),
        versao_esperada: paciente.versao,
        motivo: motivo.value,
      };
      const validado = atualizarPacienteSchema.safeParse(dados);
      if (!validado.success) {
        aviso.textContent =
          'Altere ao menos um campo e informe nome válido, data válida e motivo da alteração.';
        return;
      }
      alteracaoPendente(true);
      void enviar(validado.data);
    });
    desenharResumo();
    status.textContent = '';
    raiz.replaceChildren(resumo, form, recuperar, status);
  };
  const consultar = () => {
    status.textContent = 'Carregando cadastro…';
    raiz.replaceChildren(esqueletoCarregando(3, true), status);
    void servico
      .consultarPaciente(pacienteId)
      .then(desenhar)
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentar = elemento('button', 'Tentar novamente');
        tentar.type = 'button';
        tentar.addEventListener('click', consultar);
        raiz.replaceChildren(status, tentar);
      });
  };
  const recuperar = elemento('button', 'Conferir o que foi salvo');
  recuperar.type = 'button';
  let reconhecido = false;
  const concluirRecuperacao = () => {
    recuperar.hidden = true;
    const form = raiz.querySelector('form');
    if (!form) {
      bloqueada = false;
      consultar();
      return;
    }
    // Versão pode ter mudado; permitir copiar o rascunho, sem permitir sobrescrita.
    const campos = form.querySelector('fieldset');
    if (campos) campos.disabled = false;
    status.textContent =
      'Conferência concluída. Copie seu rascunho antes de recarregar o cadastro.';
    const recarregar = elemento('button', 'Recarregar cadastro');
    recarregar.type = 'button';
    recarregar.onclick = () => {
      alteracaoPendente(false);
      bloqueada = false;
      consultar();
    };
    raiz.append(recarregar);
  };
  const recuperarSituacao = () => {
    if (recuperando) return;
    recuperando = true;
    recuperar.disabled = true;
    status.textContent = 'Conferindo o cadastro…';
    void (async () => {
      if (reconhecido) {
        await servico.ciclo.consultar();
        servico.ciclo.liberar();
      } else {
        let situacao = await servico.ciclo.consultar();
        if (!situacao.resultado_pendente) {
          if (
            situacao.reserva &&
            !window.confirm(
              'Há uma tentativa em andamento que pode estar em outra aba. Encerrá-la afetará todas as abas. Deseja continuar?',
            )
          )
            throw new Error('Encerramento não confirmado');
          await servico.ciclo.encerrar();
          situacao = await servico.ciclo.consultar();
        }
        if (!ativa) return;
        if (situacao.resultado_pendente) {
          const resultado = situacao.resultado_pendente;
          if (resultado.paciente_id.toLowerCase() !== pacienteId.toLowerCase()) {
            status.textContent =
              'A edição aguardando resposta é de outro paciente. Abra o cadastro dele para conferir antes de continuar aqui.';
            recuperar.hidden = true;
            return;
          }
          // A conferência usa leitura autorizada atual e não substitui o rascunho.
          const atual = await servico.consultarPaciente(pacienteId);
          if (!ativa) return;
          if (atual.id.toLowerCase() !== pacienteId.toLowerCase())
            throw new Error('Cadastro divergente');
          const conferencia = elemento('p');
          conferencia.textContent = `Cadastro atual: ${atual.nome}; nome de preferência: ${atual.nome_preferencia ?? 'não informado'}; nascimento: ${atual.data_nascimento ?? 'não informado'}; situação: ${textoSituacao(atual.acompanhamento[0])}; responsável: ${atual.acompanhamento[0] ? descreverResponsavel(atual.acompanhamento[0], equipe) : 'a completar'}; versão: ${atual.versao}.`;
          raiz.querySelector('[data-conferencia-edicao]')?.remove();
          conferencia.dataset.conferenciaEdicao = '';
          raiz.append(conferencia);
          status.textContent =
            resultado.resultado === 'confirmada'
              ? `As alterações enviadas antes foram salvas (versão ${resultado.versao}). ${atual.versao !== resultado.versao ? 'O cadastro já está em outra versão: alguém pode ter alterado depois.' : 'Confira os dados acima.'}`
              : 'As alterações enviadas antes não foram salvas.';
          recuperar.textContent = 'Entendi, liberar a edição';
          recuperar.onclick = () => {
            if (recuperando) return;
            recuperando = true;
            recuperar.disabled = true;
            void (async () => {
              if (!reconhecido) {
                await servico.ciclo.reconhecer();
                reconhecido = true;
              }
              await servico.ciclo.consultar();
              servico.ciclo.liberar();
              if (!ativa) return;
              reconhecido = false;
              recuperar.onclick = recuperarSituacao;
              concluirRecuperacao();
            })()
              .catch((erro: unknown) => {
                if (!ativa || descartarAcesso(erro)) return;
                status.textContent = 'Não foi possível concluir. Tente novamente.';
                recuperar.disabled = false;
              })
              .finally(() => {
                recuperando = false;
              });
          };
          recuperar.disabled = false;
          return;
        }
        servico.ciclo.liberar();
      }
      if (!ativa) return;
      concluirRecuperacao();
    })()
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = 'Não foi possível confirmar a situação. Tente novamente.';
        recuperar.disabled = false;
      })
      .finally(() => {
        recuperando = false;
      });
  };
  recuperar.onclick = recuperarSituacao;
  raiz.replaceChildren(status, recuperar);
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
