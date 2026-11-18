import type { SegredosIntegracoes } from '../packages/contracts/src/segredos-integracoes.ts';
import type { ServicoSegredosIntegracoes } from './servico-segredos-integracoes-http.ts';

const rotulos: Record<SegredosIntegracoes['chave'], string> = {
  'ffcmapp.integracao.google_drive': 'Google Drive — JSON da conta de serviço',
  'ffcmapp.integracao.openrouter': 'OpenRouter — chave da API',
  'ffcmapp.integracao.google_calendar_client_id': 'Google Calendar — client ID',
  'ffcmapp.integracao.google_calendar_client_secret': 'Google Calendar — client secret',
};

/** Superfície somente escrita. Nunca mantém valores em storage ou reconstitui segredo. */
export function montarSegredosIntegracoes(
  raiz: HTMLElement,
  servico: ServicoSegredosIntegracoes,
  opcoes: { nomeDoUsuario?: (id: string) => string | undefined } = {},
): () => void {
  let ativa = true;
  const secao = document.createElement('section');
  secao.className = 'configuracao-sistema';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Credenciais das integrações';
  const explicacao = document.createElement('p');
  explicacao.textContent =
    'Cadastre as credenciais para preparar as integrações. Os valores enviados não podem ser consultados aqui. Substituir preserva a versão anterior. Cadastrado não significa conexão confirmada com o serviço.';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const lista = document.createElement('div');
  lista.className = 'configuracao-sistema__lista';
  const recarregar = document.createElement('button');
  recarregar.type = 'button';
  recarregar.className = 'button-secondary';
  recarregar.textContent = 'Recarregar credenciais';
  secao.append(titulo, explicacao, status, lista, recarregar);
  raiz.replaceChildren(secao);

  const desenhar = (itens: SegredosIntegracoes[]) => {
    lista.replaceChildren();
    for (const item of itens) {
      const formulario = document.createElement('form');
      formulario.className = 'configuracao-sistema__item';
      const rotulo = document.createElement('label');
      rotulo.textContent = rotulos[item.chave];
      const campo = document.createElement('input');
      campo.id = `segredo-${item.chave.replaceAll('.', '-')}`;
      campo.type = 'password';
      campo.autocomplete = 'new-password';
      campo.spellcheck = false;
      campo.maxLength = 48_000;
      campo.required = true;
      campo.className = 'configuracao-sistema__controle';
      rotulo.htmlFor = campo.id;
      const autoria = document.createElement('p');
      autoria.className = 'configuracao-sistema__autoria';
      const quem = item.atualizado_por_usuario_id
        ? (opcoes.nomeDoUsuario?.(item.atualizado_por_usuario_id) ??
          `usuário ${item.atualizado_por_usuario_id.slice(0, 8)}`)
        : null;
      autoria.textContent = item.cadastrado
        ? `Cadastrado. Versão ${item.versao}.${quem && item.atualizado_em ? ` Por ${quem}, em ${new Date(item.atualizado_em).toLocaleString('pt-BR')}.` : ' Cadastro anterior à tela, autoria não disponível.'}`
        : 'Não cadastrado.';
      const salvar = document.createElement('button');
      salvar.type = 'submit';
      salvar.className = 'button-primary';
      salvar.textContent = item.cadastrado ? 'Substituir credencial' : 'Cadastrar credencial';
      const aviso = document.createElement('p');
      aviso.setAttribute('role', 'status');
      aviso.setAttribute('aria-live', 'polite');
      formulario.append(rotulo, autoria, campo, salvar, aviso);
      lista.append(formulario);
      formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (salvar.disabled || !campo.value.trim()) return;
        salvar.disabled = true;
        campo.disabled = true;
        const pedido = servico.gravar({
          segredo_chave: item.chave,
          valor: campo.value,
          versao_esperada: item.versao,
        });
        campo.value = '';
        aviso.textContent = 'Enviando credencial…';
        void pedido
          .then(() => {
            if (ativa) void carregar('Credencial cadastrada. Valor não disponível para consulta.');
          })
          .catch((erro: unknown) => {
            if (!ativa) return;
            const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? erro.codigo : '';
            aviso.textContent =
              codigo === 'conflito_versao'
                ? 'Versão mudou. Recarregue antes de substituir.'
                : 'Não foi possível confirmar o cadastro. Recarregue e confira a versão antes de tentar novamente.';
            salvar.disabled = false;
            campo.disabled = false;
          });
      });
    }
  };
  const carregar = async (mensagem = 'Carregando credenciais…') => {
    status.textContent = mensagem;
    recarregar.disabled = true;
    lista.setAttribute('aria-busy', 'true');
    try {
      const itens = await servico.listar();
      if (!ativa) return;
      desenhar(itens);
      status.textContent = mensagem.startsWith('Credencial cadastrada')
        ? mensagem
        : `${itens.length} credenciais disponíveis.`;
    } catch {
      if (ativa) {
        lista.replaceChildren();
        status.textContent =
          'Não foi possível carregar. Confira seu acesso de Administrador e tente recarregar.';
      }
    } finally {
      lista.removeAttribute('aria-busy');
      if (ativa) recarregar.disabled = false;
    }
  };
  recarregar.addEventListener('click', () => void carregar());
  void carregar();
  return () => {
    ativa = false;
    for (const campo of lista.querySelectorAll('input')) campo.value = '';
    raiz.replaceChildren();
  };
}
