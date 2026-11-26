import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
import type { ConcessaoFinanceira } from '../packages/contracts/src/index.ts';
import type { ServicoFinanceiro } from './servico-financeiro-http.ts';

const PERFIS: Record<ConcessaoFinanceira['perfil'], string> = {
  profissional: 'Profissional',
  administrador: 'Administrador',
};
const ESTADOS: Record<ConcessaoFinanceira['estado'], string> = {
  pendente: 'Acesso ainda não aceito',
  vinculada: 'Acesso ativo',
  revogada: 'Acesso encerrado',
};

/** FR-068: tela em que o Administrador concede e revoga a audiência financeira.
 *
 * Esta tela NÃO mostra conteúdo financeiro: não há valor acordado, despesa, apuração nem
 * total em nenhum campo. Ela trata só de quem pode ver o financeiro, e a marca mora na
 * concessão de equipe (`identidade.concessao_equipe.habilitado_financeiro`), nunca em
 * constante do código.
 *
 * Nada aqui autoriza: conceder é ato de Administrador verificado no servidor e no banco, em
 * `operacao.financeiro_concessao_privada`. Quem já tem a audiência financeira não ganha com
 * isso o direito de concedê-la, e a própria concessão de quem concede tem perfil
 * `administrador`, que o banco recusa marcar — a autoconcessão volta como conflito.
 *
 * A audiência financeira não decorre de vínculo com caso (design D1): nenhuma informação de
 * caso ou paciente entra nesta tela. */
export function montarFinanceiroConcessaoAdministracao(
  raiz: HTMLElement,
  servico: ServicoFinanceiro,
): () => void {
  let ativa = true;
  const secao = document.createElement('section');
  secao.className = 'habilitacao-crise';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Quem vê o financeiro';
  const explicacao = document.createElement('p');
  explicacao.className = 'habilitacao-crise__explicacao';
  explicacao.textContent =
    'Marque aqui quem pode ver e lançar o financeiro do cuidado. Só profissionais com acesso ativo podem receber a marca; Administrador já vê o financeiro pelo próprio perfil. A marca não depende de caso e não dá acesso a nenhum caso.';
  const status = document.createElement('p');
  status.className = 'habilitacao-crise__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const lista = document.createElement('div');
  lista.className = 'habilitacao-crise__lista';
  const recarregar = document.createElement('button');
  recarregar.type = 'button';
  recarregar.className = 'button-secondary';
  recarregar.textContent = 'Recarregar';
  secao.append(titulo, explicacao, status, lista, recarregar);
  raiz.replaceChildren(secao);

  const desenhar = (itens: readonly ConcessaoFinanceira[]) => {
    lista.replaceChildren();
    if (itens.length === 0) {
      const vazio = document.createElement('p');
      vazio.className = 'habilitacao-crise__vazio';
      vazio.textContent = 'Nenhuma pessoa com acesso cadastrado.';
      lista.append(vazio);
      return;
    }
    for (const item of itens) {
      const formulario = document.createElement('form');
      formulario.className = 'habilitacao-crise__item';
      formulario.noValidate = true;
      const identificador = `financeiro-concessao-${item.concessao_id}`;
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.id = identificador;
      caixa.checked = item.habilitado;
      // Marcar exige profissional com acesso ativo; desmarcar continua possível sempre, para
      // que REVOGAR a audiência financeira nunca fique travado. O banco aplica a mesma regra.
      const podeMarcar = item.estado === 'vinculada' && item.perfil === 'profissional';
      caixa.disabled = !podeMarcar && !item.habilitado;
      const rotulo = document.createElement('label');
      rotulo.className = 'habilitacao-crise__rotulo';
      rotulo.htmlFor = identificador;
      rotulo.textContent = 'Pode ver o financeiro';
      const pessoa = document.createElement('p');
      pessoa.className = 'habilitacao-crise__pessoa';
      pessoa.textContent = `${item.email} — ${PERFIS[item.perfil]} — ${ESTADOS[item.estado]}`;
      const ajuda = document.createElement('p');
      ajuda.className = 'habilitacao-crise__ajuda';
      ajuda.id = `${identificador}-ajuda`;
      if (item.perfil === 'administrador')
        ajuda.textContent = 'Administrador já vê o financeiro pelo próprio perfil.';
      else if (!podeMarcar) ajuda.textContent = 'Só quem tem acesso ativo pode ser marcado.';
      if (ajuda.textContent) caixa.setAttribute('aria-describedby', ajuda.id);
      const salvar = document.createElement('button');
      salvar.type = 'submit';
      salvar.className = 'button-primary';
      salvar.textContent = 'Salvar';
      salvar.disabled = caixa.disabled;
      const aviso = document.createElement('p');
      aviso.className = 'habilitacao-crise__aviso';
      aviso.setAttribute('role', 'status');
      aviso.setAttribute('aria-live', 'polite');
      const acoes = document.createElement('div');
      acoes.className = 'habilitacao-crise__acoes';
      acoes.append(caixa, rotulo, salvar, aviso);
      formulario.append(pessoa);
      if (ajuda.textContent) formulario.append(ajuda);
      formulario.append(acoes);
      lista.append(formulario);

      formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (salvar.disabled) return;
        if (caixa.checked === item.habilitado) {
          aviso.textContent = 'Nada mudou nesta linha.';
          return;
        }
        salvar.disabled = caixa.disabled = true;
        aviso.textContent = 'Salvando…';
        const finalizar = iniciarAcao(salvar);
        void servico
          .gravarConcessao(
            {
              concessao_id: item.concessao_id,
              habilitado: caixa.checked,
              versao_esperada: item.versao,
            },
            crypto.randomUUID(),
          )
          .then(() => {
            if (!ativa) return;
            aviso.textContent = 'Salvo.';
            void carregar('Marca do financeiro atualizada.');
          })
          .catch((erro: unknown) => {
            if (!ativa) return;
            const codigo =
              erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
            aviso.textContent =
              codigo === 'conflito' || codigo === 'conflito_idempotencia'
                ? 'Não foi possível aplicar esta marca. Recarregue e confira o acesso da pessoa.'
                : codigo === 'sem_permissao'
                  ? 'Sua conta não pode alterar quem vê o financeiro.'
                  : 'Não foi possível salvar. Tente de novo.';
            salvar.disabled = caixa.disabled = false;
            caixa.checked = item.habilitado;
          })
          .finally(finalizar);
      });
    }
  };

  const carregar = async (mensagemInicial = 'Carregando equipe…') => {
    status.textContent = mensagemInicial;
    recarregar.disabled = true;
    lista.setAttribute('aria-busy', 'true');
    if (!lista.hasChildNodes()) lista.append(esqueletoCarregando(3, true));
    const finalizar = iniciarAcao(recarregar);
    try {
      const itens = await servico.listarConcessoes();
      if (!ativa) return;
      desenhar(itens);
      const marcados = itens.filter((item) => item.habilitado).length;
      status.textContent =
        marcados === 0
          ? 'Nenhum profissional está marcado para ver o financeiro.'
          : `${marcados} ${marcados === 1 ? 'profissional marcado' : 'profissionais marcados'} para ver o financeiro.`;
    } catch (erro: unknown) {
      if (!ativa) return;
      lista.replaceChildren();
      const codigo =
        erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
      status.textContent =
        codigo === 'sem_permissao'
          ? 'Sua conta não pode ver quem vê o financeiro.'
          : 'Não foi possível carregar a equipe. Tente recarregar.';
    } finally {
      finalizar();
      lista.removeAttribute('aria-busy');
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
