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
  let gravando = false;
  let carregando = false;
  let precisaConferir = false;
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
  recarregar.textContent = 'Recarregar integrações';
  secao.append(titulo, explicacao, status, lista, recarregar);
  const tituloExpurgo = document.createElement('h2');
  tituloExpurgo.textContent = 'Descarte de áudios abandonados';
  const avisoExpurgo = document.createElement('p');
  avisoExpurgo.setAttribute('role', 'status');
  avisoExpurgo.setAttribute('aria-live', 'polite');
  secao.append(tituloExpurgo, avisoExpurgo);
  raiz.replaceChildren(secao);
  const carregarExpurgo = async () => {
    if (!servico.consultarExpurgo) return;
    avisoExpurgo.textContent = 'Consultando descarte automático…';
    try {
      const estado = await servico.consultarExpurgo();
      if (!ativa) return;
      const ultima = estado.ultima_execucao;
      avisoExpurgo.textContent = `${estado.ativo ? 'Descarte automático habilitado.' : 'Descarte automático desligado.'} ${ultima ? `Última execução em ${new Date(ultima.executado_em).toLocaleString('pt-BR')}. ${ultima.falhas > 0 ? `Pendência operacional: ${ultima.falhas} descartes falharam. Solicite verificação à equipe responsável.` : 'Nenhuma falha registrada nessa execução.'}` : 'Nenhuma execução registrada.'}`;
    } catch {
      if (ativa)
        avisoExpurgo.textContent =
          'Não foi possível consultar o descarte. Recarregue para tentar novamente.';
    }
  };

  const atualizarControles = () => {
    recarregar.disabled = carregando || gravando;
    for (const controle of lista.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      'input, button',
    ))
      controle.disabled = carregando || gravando || precisaConferir;
  };

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
      formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!ativa || gravando || carregando || precisaConferir || !campo.value.trim()) return;
        const entrada = {
          segredo_chave: item.chave,
          valor: campo.value,
          versao_esperada: item.versao,
        };
        // Limpar antes de chamar o serviço também cobre uma recusa síncrona do adapter.
        campo.value = '';
        gravando = true;
        atualizarControles();
        aviso.textContent = 'Enviando credencial…';
        try {
          await servico.gravar(entrada);
          if (!ativa) return;
          gravando = false;
          await carregar('Credencial cadastrada. Valor não disponível para consulta.');
        } catch (erro: unknown) {
          if (!ativa) return;
          gravando = false;
          precisaConferir = true;
          const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? erro.codigo : '';
          aviso.textContent =
            codigo === 'conflito_versao'
              ? 'Versão mudou. Recarregue antes de substituir.'
              : 'Não foi possível confirmar o cadastro. Recarregue e confira a versão antes de tentar novamente.';
          atualizarControles();
        }
      });
    }
  };
  const carregar = async (mensagem = 'Carregando credenciais…') => {
    if (!ativa || gravando || carregando) return;
    carregando = true;
    atualizarControles();
    void carregarExpurgo();
    status.textContent = mensagem;
    lista.setAttribute('aria-busy', 'true');
    try {
      const itens = await servico.listar();
      if (!ativa) return;
      precisaConferir = false;
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
      carregando = false;
      lista.removeAttribute('aria-busy');
      if (ativa) atualizarControles();
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
