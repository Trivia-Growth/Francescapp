import { type ClienteFFCM, mensagemFalha } from './api.js';

/** Dados que a conta de família pode consultar do paciente vinculado. */
export function montarDadosFamiliar(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Pick<ClienteFFCM, 'consultarPacienteFamiliar'>,
  acessoPerdido: (erro: unknown) => boolean,
): () => void {
  let ativa = true;
  let geracao = 0;
  const titulo = document.createElement('h2');
  titulo.textContent = 'Dados do paciente';
  const estado = document.createElement('p');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  const dados = document.createElement('dl');
  dados.className = 'ficha-dados';
  const tentar = document.createElement('button');
  tentar.type = 'button';
  tentar.className = 'button-secondary';
  tentar.textContent = 'Tentar novamente';
  raiz.replaceChildren(titulo, estado, dados, tentar);

  const linha = (rotulo: string, valor: string) => {
    const grupo = document.createElement('div');
    const termo = document.createElement('dt');
    termo.textContent = rotulo;
    const definicao = document.createElement('dd');
    definicao.textContent = valor;
    grupo.append(termo, definicao);
    return grupo;
  };

  const consultar = async (): Promise<void> => {
    const numero = ++geracao;
    dados.replaceChildren();
    tentar.hidden = true;
    estado.removeAttribute('data-tone');
    estado.textContent = 'Consultando paciente…';
    try {
      const paciente = await servico.consultarPacienteFamiliar(pacienteId);
      if (!ativa || numero !== geracao) return;
      if (paciente.id !== pacienteId)
        throw new Error('Paciente retornado não corresponde à consulta.');
      dados.append(
        linha('Nome', paciente.nome),
        linha('Nome de preferência', paciente.nome_preferencia ?? 'Não informado'),
      );
      estado.textContent = '';
    } catch (erro) {
      if (!ativa || numero !== geracao || acessoPerdido(erro)) return;
      estado.dataset.tone = 'error';
      estado.textContent = `${mensagemFalha(erro)} Tente novamente.`;
      tentar.hidden = false;
    }
  };
  tentar.addEventListener('click', () => void consultar());
  void consultar();

  return () => {
    ativa = false;
    geracao += 1;
    raiz.replaceChildren();
  };
}
