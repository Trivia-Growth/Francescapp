import { FalhaApi } from './api.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import type { EscalaCaso, EscalaVersao } from '../packages/contracts/src/turno-passagem.ts';
import type { ServicoTurnoHttp } from './servico-turno-http.ts';

export function montarEscalaTurno(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTurnoHttp,
  opcoes: {
    acessoPerdido(): void;
    alteracaoPendente?(valor: boolean): void;
  },
): () => void {
  let ativa = true;
  let ocupada = false;
  raiz.classList.add('escala-turno');
  let recusaDefinitiva = false;
  let consultaAposRecusa = false;
  let pagina: EscalaCaso | null = null;
  const rascunhos = new Map<string, string[]>();
  let repetir: (() => Promise<unknown>) | null = null;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const conteudo = document.createElement('div');
  const atualizar = document.createElement('button');
  atualizar.type = 'button';
  atualizar.textContent = 'Atualizar escala';
  atualizar.className = 'button-secondary';
  const recuperar = document.createElement('button');
  recuperar.type = 'button';
  recuperar.textContent = 'Repetir operação pendente';
  recuperar.hidden = true;
  recuperar.className = 'button-secondary';
  const descartar = document.createElement('button');
  descartar.type = 'button';
  descartar.textContent = 'Descartar tentativa e editar dados';
  descartar.hidden = true;
  descartar.className = 'button-secondary';
  const mais = document.createElement('button');
  mais.type = 'button';
  mais.textContent = 'Carregar mais histórico';
  mais.hidden = true;
  mais.className = 'button-secondary';
  raiz.replaceChildren(status, conteudo, atualizar, recuperar, descartar, mais);
  function texto(destino: HTMLElement, valor: string) {
    const p = document.createElement('p');
    p.textContent = valor;
    destino.append(p);
  }
  function campo<K extends 'input' | 'select' | 'textarea'>(
    destino: HTMLElement,
    nome: string,
    tipo: K,
  ) {
    const controle = document.createElement(tipo);
    const label = document.createElement('label');
    label.append(document.createTextNode(nome), controle);
    destino.append(label);
    return controle;
  }
  function erro(erro: unknown) {
    const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
    if (codigo === 'nao_autenticado' || codigo === 'sem_permissao') {
      ativa = false;
      raiz.replaceChildren();
      opcoes.acessoPerdido();
      return;
    }
    recusaDefinitiva =
      erro instanceof FalhaApi &&
      !erro.exigeReautenticacao &&
      ((codigo === 'conflito_versao' && erro.status === statusErroHttp.conflito_versao) ||
        (codigo === 'entrada_invalida' && erro.status === statusErroHttp.entrada_invalida));
    consultaAposRecusa = false;
    status.textContent =
      codigo === 'conflito_versao'
        ? 'A escala mudou. Atualize o histórico antes de substituir; nenhuma versão foi sobrescrita.'
        : 'Resultado não confirmado. Atualize a escala; se necessário, repita a mesma operação pendente.';
  }
  async function executar(acao: () => Promise<void>) {
    if (!ativa || ocupada) return;
    ocupada = true;
    atualizar.disabled = recuperar.disabled = descartar.disabled = mais.disabled = true;
    raiz.setAttribute('aria-busy', 'true');
    for (const controle of conteudo.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
    >('input,textarea,select,button'))
      controle.disabled = true;
    try {
      await acao();
    } catch (falha) {
      if (ativa) erro(falha);
    } finally {
      ocupada = false;
      if (ativa) {
        atualizar.disabled = recuperar.disabled = descartar.disabled = mais.disabled = false;
        recuperar.hidden = !repetir;
        descartar.hidden = !repetir || !recusaDefinitiva || !consultaAposRecusa;
        raiz.setAttribute('aria-busy', 'false');
      }
    }
  }
  async function gravar(acao: () => Promise<unknown>) {
    recusaDefinitiva = false;
    consultaAposRecusa = false;
    repetir = acao;
    opcoes.alteracaoPendente?.(true);
    await acao();
    if (!ativa) return;
    repetir = null;
    rascunhos.clear();
    opcoes.alteracaoPendente?.(false);
    await carregar(false, false);
    if (ativa) status.textContent = 'Alteração confirmada. Histórico atualizado.';
  }
  function profissionais(destino: HTMLElement, escala: EscalaCaso, rotulo: string) {
    const select = campo(destino, rotulo, 'select');
    const vazia = document.createElement('option');
    vazia.value = '';
    vazia.textContent = 'Selecione profissional';
    select.append(vazia);
    for (const pessoa of escala.profissionais) {
      const option = document.createElement('option');
      option.value = pessoa.usuario_id;
      option.textContent = pessoa.rotulo;
      select.append(option);
    }
    select.required = true;
    return select;
  }
  function preservarRascunhos() {
    for (const form of conteudo.querySelectorAll<HTMLFormElement>('form[data-rascunho]'))
      rascunhos.set(
        form.dataset.rascunho as string,
        [
          ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            'input,textarea,select',
          ),
        ].map((c) => c.value),
      );
  }
  function restaurarRascunho(form: HTMLFormElement, chave: string) {
    form.dataset.rascunho = chave;
    const valores = rascunhos.get(chave);
    if (valores)
      [
        ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input,textarea,select',
        ),
      ].forEach((c, i) => {
        const valor = valores[i];
        if (valor !== undefined) c.value = valor;
      });
  }
  function desenhar(escala: EscalaCaso) {
    conteudo.replaceChildren();
    texto(
      conteudo,
      'Identificação exibida conforme cadastro disponível; não comprova o nome usado na época do registro.',
    );
    const nome = (id: string | null) =>
      id
        ? (escala.identidades.find((p) => p.usuario_id === id)?.rotulo ??
          'Identidade histórica indisponível')
        : 'Sem substituição';
    const instante = (valor: string) => new Date(valor).toLocaleString('pt-BR');
    const grupos = new Map<string, EscalaVersao[]>();
    for (const item of escala.itens) {
      const grupo = grupos.get(item.escala_id) ?? [];
      grupo.push(item);
      grupos.set(item.escala_id, grupo);
    }
    if (!grupos.size) texto(conteudo, 'Nenhum turno previsto registrado neste caso.');
    for (const versoes of grupos.values()) {
      versoes.sort((a, b) => b.versao - a.versao);
      const atual = versoes[0];
      if (!atual) continue;
      const artigo = document.createElement('article');
      const titulo = document.createElement('h4');
      titulo.textContent = `${instante(atual.inicio_previsto)} até ${instante(atual.fim_previsto)}`;
      artigo.append(titulo);
      texto(artigo, `Previsto originalmente: ${nome(atual.profissional_previsto_usuario_id)}.`);
      texto(
        artigo,
        `${escala.proximo_cursor ? 'Última versão carregada' : 'Responsável vigente'}: ${nome(atual.profissional_assumiu_usuario_id ?? atual.profissional_previsto_usuario_id)}. Versão ${atual.versao}.`,
      );
      const historico = document.createElement('details');
      const resumo = document.createElement('summary');
      resumo.textContent = 'Consultar histórico da escala';
      historico.append(resumo);
      for (const versao of [...versoes].reverse()) {
        const registro = document.createElement('div');
        texto(
          registro,
          `Versão ${versao.versao}: ${versao.tipo === 'previsto' ? 'Previsão original' : versao.tipo === 'cobertura' ? 'Cobertura de ausência' : 'Substituição'}.`,
        );
        texto(
          registro,
          `Previsto: ${nome(versao.profissional_previsto_usuario_id)}. Assumiu: ${nome(versao.profissional_assumiu_usuario_id)}.`,
        );
        if (versao.motivo) texto(registro, `Motivo: ${versao.motivo}`);
        texto(
          registro,
          `Registrado por ${nome(versao.autor_usuario_id)} em ${instante(versao.registrado_em)}.`,
        );
        historico.append(registro);
      }
      artigo.append(historico);
      if (escala.pode_gerir && !escala.proximo_cursor) {
        const form = document.createElement('form');
        const tipo = campo(form, 'Tipo de alteração', 'select');
        for (const [valor, rotulo] of [
          ['substituicao', 'Substituição'],
          ['cobertura', 'Cobertura de ausência'],
        ]) {
          const option = document.createElement('option');
          option.value = valor ?? '';
          option.textContent = rotulo ?? '';
          tipo.append(option);
        }
        const pessoa = profissionais(form, escala, 'Profissional que assumirá');
        const motivo = campo(form, 'Motivo obrigatório', 'textarea');
        motivo.required = true;
        motivo.maxLength = 2000;
        const salvar = document.createElement('button');
        salvar.type = 'submit';
        salvar.textContent = 'Registrar alteração';
        salvar.className = 'button-primary';
        form.append(salvar);
        form.addEventListener('input', () => opcoes.alteracaoPendente?.(true));
        form.addEventListener('submit', (evento) => {
          evento.preventDefault();
          if (ocupada || repetir) return;
          if (!pessoa.value || !motivo.value.trim()) {
            status.textContent = 'Selecione quem assumirá e informe o motivo.';
            return;
          }
          const entrada = {
            tipo: tipo.value === 'cobertura' ? ('cobertura' as const) : ('substituicao' as const),
            profissional_assumiu_usuario_id: pessoa.value,
            motivo: motivo.value.trim(),
            versao_esperada: atual.versao,
          };
          const chave = crypto.randomUUID();
          void executar(() =>
            gravar(() => servico.alterarEscala(pacienteId, atual.escala_id, entrada, chave)),
          );
        });
        restaurarRascunho(form, atual.escala_id);
        artigo.append(form);
      }
      conteudo.append(artigo);
    }
    if (escala.pode_gerir) {
      const form = document.createElement('form');
      const titulo = document.createElement('h4');
      titulo.textContent = 'Planejar turno';
      form.append(titulo);
      const pessoa = profissionais(form, escala, 'Profissional previsto');
      const inicio = campo(form, 'Início previsto (horário deste aparelho)', 'input');
      inicio.type = 'datetime-local';
      inicio.required = true;
      const fim = campo(form, 'Fim previsto (horário deste aparelho)', 'input');
      fim.type = 'datetime-local';
      fim.required = true;
      const salvar = document.createElement('button');
      salvar.type = 'submit';
      salvar.textContent = 'Registrar turno previsto';
      salvar.className = 'button-primary';
      form.append(salvar);
      form.addEventListener('input', () => opcoes.alteracaoPendente?.(true));
      form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (ocupada || repetir) return;
        const inicioData = new Date(inicio.value);
        const fimData = new Date(fim.value);
        if (
          !pessoa.value ||
          !Number.isFinite(inicioData.getTime()) ||
          !Number.isFinite(fimData.getTime()) ||
          fimData <= inicioData
        ) {
          status.textContent = 'Selecione profissional e informe fim posterior ao início.';
          return;
        }
        const entrada = {
          escala_id: crypto.randomUUID(),
          profissional_previsto_usuario_id: pessoa.value,
          inicio_previsto: inicioData.toISOString(),
          fim_previsto: fimData.toISOString(),
        };
        const chave = crypto.randomUUID();
        void executar(() => gravar(() => servico.criarEscala(pacienteId, entrada, chave)));
      });
      restaurarRascunho(form, 'nova');
      conteudo.append(form);
    } else if (!escala.pode_gerir)
      texto(
        conteudo,
        'Consulta da escala. Alterações dependem de autorização da coordenação no caso.',
      );
  }
  async function carregar(adicionar = false, preservar = true) {
    if (preservar) preservarRascunhos();
    status.textContent = 'Consultando escala…';
    const escala = await servico.consultarEscala(
      pacienteId,
      adicionar ? (pagina?.proximo_cursor ?? undefined) : undefined,
    );
    if (!ativa) return;
    if (repetir && recusaDefinitiva) consultaAposRecusa = true;
    pagina =
      adicionar && pagina
        ? {
            ...escala,
            itens: [...pagina.itens, ...escala.itens],
            identidades: [
              ...new Map(
                [...pagina.identidades, ...escala.identidades].map((p) => [p.usuario_id, p]),
              ).values(),
            ],
          }
        : escala;
    desenhar(pagina);
    if (pagina.proximo_cursor)
      texto(
        conteudo,
        'Há mais histórico disponível. Carregue as próximas páginas para conferir a versão vigente antes de alterar.',
      );
    mais.hidden = !pagina.proximo_cursor;
    if (repetir)
      for (const c of conteudo.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
      >('input,textarea,select,button'))
        c.disabled = true;
    status.textContent = repetir
      ? 'Escala consultada. Há operação sem confirmação; a repetição preserva dados e chave originais.'
      : 'Escala atualizada.';
  }
  atualizar.addEventListener('click', () => void executar(() => carregar()));
  mais.addEventListener('click', () => void executar(() => carregar(true)));
  descartar.addEventListener('click', () => {
    if (ocupada || !repetir || !recusaDefinitiva || !consultaAposRecusa) return;
    repetir = null;
    recuperar.hidden = descartar.hidden = true;
    for (const c of conteudo.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
    >('input,textarea,select,button'))
      c.disabled = false;
    status.textContent =
      'Tentativa recusada descartada; texto preservado para revisão. Uma nova operação exige seu envio explícito.';
  });
  recuperar.addEventListener('click', () => {
    const acao = repetir;
    if (acao) void executar(() => gravar(acao));
  });
  void executar(() => carregar());
  return () => {
    ativa = false;
    raiz.replaceChildren();
    raiz.classList.remove('escala-turno');
  };
}
