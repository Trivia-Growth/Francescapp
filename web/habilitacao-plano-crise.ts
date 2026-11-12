import type { ItemHabilitacao } from '../packages/contracts/src/habilitacao-plano-crise.ts';
import type { ServicoHabilitacaoPlanoCrise } from './servico-habilitacao-plano-crise-http.ts';

const PERFIS: Record<ItemHabilitacao['perfil'], string> = {
  profissional: 'Profissional',
  administrador: 'Administrador',
};
const ESTADOS: Record<ItemHabilitacao['estado'], string> = {
  pendente: 'Acesso ainda não aceito',
  vinculada: 'Acesso ativo',
  revogada: 'Acesso encerrado',
};

/** FR-020: tela em que a administração registra quem é o “profissional habilitado” a
 * aprovar plano de crise. A marca fica no banco, presa à concessão de acesso da pessoa:
 * não é constante no código nem variável de ambiente.
 *
 * Marcar aqui não dá acesso a nada além de aprovar o plano de crise, e quem aprova
 * continua sendo verificado no servidor e no banco a cada aprovação. */
export function montarHabilitacaoPlanoCrise(
  raiz: HTMLElement,
  servico: ServicoHabilitacaoPlanoCrise,
): () => void {
  let ativa = true;
  const secao = document.createElement('section');
  secao.className = 'habilitacao-crise';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Quem aprova plano de crise';
  const explicacao = document.createElement('p');
  explicacao.className = 'habilitacao-crise__explicacao';
  explicacao.textContent =
    'Só quem estiver marcado aqui pode aprovar o plano de crise de um paciente. A marca vale para profissionais com acesso ativo; a coordenação organiza o cuidado, mas não aprova conduta clínica.';
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

  const desenhar = (itens: readonly ItemHabilitacao[]) => {
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
      const identificador = `habilitacao-${item.concessao_id}`;
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.id = identificador;
      caixa.checked = item.habilitado;
      // Marcar exige profissional com acesso ativo; desmarcar continua possível sempre,
      // para que retirar a habilitação de alguém nunca fique travado.
      const podeMarcar = item.perfil === 'profissional' && item.estado === 'vinculada';
      caixa.disabled = !podeMarcar && !item.habilitado;
      const rotulo = document.createElement('label');
      rotulo.className = 'habilitacao-crise__rotulo';
      rotulo.htmlFor = identificador;
      rotulo.textContent = 'Pode aprovar plano de crise';
      const pessoa = document.createElement('p');
      pessoa.className = 'habilitacao-crise__pessoa';
      pessoa.textContent = `${item.email} — ${PERFIS[item.perfil]} — ${ESTADOS[item.estado]}`;
      const ajuda = document.createElement('p');
      ajuda.className = 'habilitacao-crise__ajuda';
      ajuda.id = `${identificador}-ajuda`;
      if (!podeMarcar)
        ajuda.textContent =
          item.perfil === 'administrador'
            ? 'A coordenação não aprova plano de crise.'
            : 'Só quem tem acesso ativo pode ser habilitado.';
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
        void servico
          .gravar({
            concessao_id: item.concessao_id,
            habilitado: caixa.checked,
            versao_esperada: item.versao,
          })
          .then(() => {
            if (!ativa) return;
            aviso.textContent = 'Salvo.';
            void carregar('Marca de habilitação atualizada.');
          })
          .catch((erro: unknown) => {
            if (!ativa) return;
            const codigo =
              erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
            aviso.textContent =
              codigo === 'conflito_versao'
                ? 'Alguém mudou esta marca enquanto você editava. Recarregue e tente de novo.'
                : codigo === 'sem_permissao'
                  ? 'Sua conta não pode alterar quem aprova plano de crise.'
                  : 'Não foi possível salvar. Tente de novo.';
            salvar.disabled = caixa.disabled = false;
            caixa.checked = item.habilitado;
          });
      });
    }
  };

  const carregar = async (mensagemInicial = 'Carregando equipe…') => {
    status.textContent = mensagemInicial;
    recarregar.disabled = true;
    try {
      const itens = await servico.listar();
      if (!ativa) return;
      desenhar(itens);
      const habilitados = itens.filter((item) => item.habilitado).length;
      status.textContent =
        habilitados === 0
          ? 'Ninguém está habilitado a aprovar plano de crise.'
          : `${habilitados} ${habilitados === 1 ? 'pessoa habilitada' : 'pessoas habilitadas'} a aprovar plano de crise.`;
    } catch {
      if (!ativa) return;
      lista.replaceChildren();
      status.textContent = 'Não foi possível carregar a equipe. Tente recarregar.';
    } finally {
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
