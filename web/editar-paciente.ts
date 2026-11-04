import {
  atualizarPacienteSchema,
  type AtualizarPaciente,
  type PacienteAdministrativo,
} from '../packages/contracts/src/index.js';
import { exigeNovoAcesso, FalhaApi, mensagemFalha, resultadoIncerto } from './api.js';

type Servico = {
  consultarPaciente(pacienteId: string): Promise<PacienteAdministrativo>;
  atualizarPaciente(
    pacienteId: string,
    entrada: AtualizarPaciente,
    chave: string,
  ): Promise<PacienteAdministrativo>;
};

/** Interface preparada para integração segura; não ativa rota nem autoriza acesso. */
export function montarEdicaoPaciente(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let pendente: { entrada: AtualizarPaciente; chave: string } | null = null;
  let conflito = false;
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const descartarAcesso = (erro: unknown) => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    pendente = null;
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
    const confirmar = elemento('button', 'Tentar confirmar salvamento');
    confirmar.type = 'button';
    confirmar.hidden = true;
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    form.append(campos, salvar, confirmar, aviso);
    const enviar = async () => {
      if (!pendente) return;
      campos.disabled = salvar.disabled = confirmar.disabled = true;
      aviso.textContent = 'Salvando cadastro…';
      try {
        const salvo = await servico.atualizarPaciente(pacienteId, pendente.entrada, pendente.chave);
        if (!ativa) return;
        pendente = null;
        alteracaoPendente(false);
        desenhar(salvo);
        const mensagem = raiz.querySelector('[role="status"]');
        if (mensagem) mensagem.textContent = 'Cadastro atualizado.';
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        if (resultadoIncerto(erro)) {
          confirmar.hidden = false;
          confirmar.disabled = false;
          aviso.textContent =
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.';
        } else {
          pendente = null;
          campos.disabled = false;
          conflito = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
          salvar.disabled = conflito;
          confirmar.hidden = true;
          aviso.textContent = conflito
            ? 'O cadastro foi alterado por outra pessoa. Copie seu rascunho antes de recarregar para consultar a versão atual; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro);
        }
      }
    };
    form.addEventListener('input', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (pendente || conflito) return;
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
      pendente = { entrada: validado.data, chave: crypto.randomUUID() };
      alteracaoPendente(true);
      void enviar();
    });
    confirmar.addEventListener('click', () => {
      void enviar();
    });
    raiz.replaceChildren(form);
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
  consultar();
  return () => {
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
  };
}
