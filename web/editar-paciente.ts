import {
  atualizarPacienteSchema,
  type AtualizarPaciente,
  type PacienteAdministrativo,
} from '../packages/contracts/src/index.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import type { criarCicloEdicaoPaciente } from './ciclo-edicao-paciente.js';

export type ServicoEdicaoPaciente = {
  consultarPaciente(pacienteId: string): Promise<PacienteAdministrativo>;
  ciclo: ReturnType<typeof criarCicloEdicaoPaciente>;
};

/** Interface preparada para integração segura; não ativa rota nem autoriza acesso. */
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
  const desenhar = (paciente: PacienteAdministrativo) => {
    if (!ativa) return;
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
        aviso.textContent = 'Envio realizado. Confirme o resultado antes de continuar.';
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        aviso.textContent =
          'Não foi possível confirmar o salvamento. Confira o resultado antes de editar novamente; o rascunho permanece nesta tela.';
      }
      bloqueada = true;
      recuperar.textContent = 'Confirmar situação da edição';
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
    raiz.replaceChildren(form, recuperar, status);
  };
  const consultar = () => {
    status.textContent = 'Carregando cadastro…';
    raiz.replaceChildren(status);
    void servico
      .consultarPaciente(pacienteId)
      .then(desenhar)
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentar = elemento('button', 'Tentar novamente');
        tentar.type = 'button';
        tentar.addEventListener('click', consultar);
        raiz.append(tentar);
      });
  };
  const recuperar = elemento('button', 'Confirmar situação da edição');
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
    status.textContent = 'Situação confirmada. Copie o rascunho antes de recarregar o cadastro.';
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
    status.textContent = 'Confirmando situação da edição…';
    void (async () => {
      if (reconhecido) {
        await servico.ciclo.consultar();
        servico.ciclo.liberar();
      } else {
        let situacao = await servico.ciclo.consultar();
        if (!situacao.resultado_pendente) {
          await servico.ciclo.encerrar();
          situacao = await servico.ciclo.consultar();
        }
        if (!ativa) return;
        if (situacao.resultado_pendente) {
          const resultado = situacao.resultado_pendente;
          if (resultado.paciente_id.toLowerCase() !== pacienteId.toLowerCase()) {
            status.textContent = `Resultado pendente pertence ao paciente ${resultado.paciente_id}. Abra esse cadastro para conferi-lo e reconhecê-lo.`;
            recuperar.hidden = true;
            return;
          }
          // A conferência usa leitura autorizada atual e não substitui o rascunho.
          const atual = await servico.consultarPaciente(pacienteId);
          if (!ativa) return;
          if (atual.id.toLowerCase() !== pacienteId.toLowerCase())
            throw new Error('Cadastro divergente');
          const conferencia = elemento('p');
          conferencia.textContent = `Cadastro atual: ${atual.nome}; nome de preferência: ${atual.nome_preferencia ?? 'não informado'}; nascimento: ${atual.data_nascimento ?? 'não informado'}; versão: ${atual.versao}.`;
          raiz.querySelector('[data-conferencia-edicao]')?.remove();
          conferencia.dataset.conferenciaEdicao = '';
          raiz.append(conferencia);
          status.textContent =
            resultado.resultado === 'confirmada'
              ? `Uma edição anterior do paciente ${resultado.paciente_id} foi confirmada na versão ${resultado.versao}. ${atual.versao !== resultado.versao ? 'O cadastro atual está em outra versão; alterações posteriores podem ter ocorrido.' : 'Confira o cadastro correspondente.'}`
              : `Uma edição anterior do paciente ${resultado.paciente_id} foi cancelada.`;
          recuperar.textContent = 'Reconhecer resultado e liberar edição';
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
                status.textContent = 'Não foi possível reconhecer o resultado. Tente novamente.';
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
