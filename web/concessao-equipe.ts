import {
  criarConcessaoEquipeSchema,
  type CriarConcessaoEquipe,
} from '../packages/contracts/src/index.js';
import { FalhaApi, type ClienteFFCM } from './api.js';

// Preparação isolada: não montar até existir capacidade e recuperação entre sessões comprovadas.
export function montarConcessaoEquipe(
  raiz: HTMLElement,
  api: Pick<ClienteFFCM, 'criarConcessaoEquipe' | 'identidadeAtual'>,
): () => void {
  let ativa = true;
  let enviando = false;
  let resultadoIncerto = false;
  let bloqueado = false;
  let pendente:
    | {
        entrada: CriarConcessaoEquipe;
        chave: string;
        identidade: { usuario_id: string; session_id: string };
      }
    | undefined;
  const formulario = document.createElement('form');
  const campos = document.createElement('fieldset');
  const email = document.createElement('input');
  email.type = 'email';
  email.required = true;
  email.maxLength = 254;
  const perfil = document.createElement('select');
  for (const [valor, texto] of [
    ['profissional', 'Profissional'],
    ['administrador', 'Administrador'],
  ] as const) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = texto;
    perfil.append(opcao);
  }
  const motivo = document.createElement('textarea');
  motivo.required = true;
  motivo.maxLength = 4000;
  for (const [texto, controle] of [
    ['E-mail', email],
    ['Perfil', perfil],
    ['Motivo', motivo],
  ] as const) {
    const rotulo = document.createElement('label');
    rotulo.textContent = texto;
    rotulo.append(controle);
    campos.append(rotulo);
  }
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const enviar = document.createElement('button');
  enviar.type = 'submit';
  enviar.textContent = 'Pré-conceder acesso';
  formulario.append(campos, enviar, status);
  raiz.replaceChildren(formulario);
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (enviando || bloqueado) return;
    const identidade = api.identidadeAtual();
    if (
      !identidade ||
      (pendente &&
        (identidade.usuario_id !== pendente.identidade.usuario_id ||
          identidade.session_id !== pendente.identidade.session_id))
    ) {
      bloqueado = true;
      campos.disabled = enviar.disabled = true;
      status.textContent =
        'Sessão alterada. Confirme a operação com a administração antes de continuar.';
      return;
    }
    if (!pendente) {
      const validacao = criarConcessaoEquipeSchema.safeParse({
        email: email.value,
        perfil: perfil.value,
        metodo: 'google_workspace',
        motivo: motivo.value,
      });
      if (!validacao.success) {
        status.textContent = 'Confira e-mail, perfil e motivo.';
        return;
      }
      pendente = {
        entrada: validacao.data,
        chave: crypto.randomUUID(),
        identidade: { ...identidade },
      };
    }
    enviando = true;
    campos.disabled = enviar.disabled = true;
    status.textContent = 'Enviando…';
    void api
      .criarConcessaoEquipe(pendente.entrada, pendente.chave)
      .then((resultado) => {
        if (!ativa) return;
        pendente = undefined;
        resultadoIncerto = false;
        formulario.reset();
        campos.disabled = false;
        enviar.textContent = 'Pré-conceder acesso';
        const estados = { pendente: 'Pendente', vinculada: 'Vinculada', revogada: 'Revogada' };
        const perfis = { profissional: 'Profissional', administrador: 'Administrador' };
        status.textContent = `Estado atual: ${estados[resultado.estado]}. Perfil: ${perfis[resultado.perfil]}. Versão: ${resultado.versao}.`;
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        if (
          erro instanceof FalhaApi &&
          erro.status === 409 &&
          erro.codigo === 'conflito_idempotencia'
        ) {
          bloqueado = true;
          status.textContent =
            'Identificação da operação já utilizada. Confirme a situação com a administração antes de continuar.';
          return;
        }
        const semEscrita =
          erro instanceof FalhaApi &&
          ((erro.status === 401 && erro.codigo === 'nao_autenticado') ||
            (erro.status === 403 && erro.codigo === 'sem_permissao') ||
            (erro.status === 422 && erro.codigo === 'entrada_invalida') ||
            (erro.status === 409 && erro.codigo === 'conflito'));
        if (semEscrita && !resultadoIncerto) {
          pendente = undefined;
          campos.disabled = false;
          enviar.textContent = 'Pré-conceder acesso';
          status.textContent =
            erro.status === 401 || erro.status === 403
              ? 'Acesso não autorizado. Valide sua sessão antes de continuar.'
              : 'Solicitação não registrada. Confira os dados ou consulte a administração.';
          return;
        }
        resultadoIncerto = true;
        enviar.textContent = 'Repetir mesma solicitação';
        status.textContent =
          'Resultado não confirmado. Repita esta solicitação ou confirme com a administração antes de fechar a tela.';
      })
      .finally(() => {
        enviando = false;
        if (ativa && !bloqueado) enviar.disabled = false;
      });
  });
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
