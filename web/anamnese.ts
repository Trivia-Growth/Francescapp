import {
  salvarAnamneseSchema,
  type Anamnese,
  type SalvarAnamnese,
} from '../packages/contracts/src/index.js';
import { localizarPendencias } from '../packages/cadastro/src/anamnese.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';

type Servico = {
  consultarAnamnese(pacienteId: string): Promise<Anamnese | null>;
  salvarAnamnese(pacienteId: string, entrada: SalvarAnamnese, chave: string): Promise<Anamnese>;
};

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarAnamnese(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let versao = 0;
  let conflitoVersao = false;
  let pendente: { entrada: SalvarAnamnese; chave: string } | null = null;
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const status = elemento('p', 'Carregando anamnese…');
  status.setAttribute('role', 'status');
  raiz.replaceChildren(status);
  const desenhar = (resultado: Anamnese | null) => {
    if (!ativa) return;
    versao = resultado?.versao ?? 0;
    const form = elemento('form');
    const campos = elemento('div');
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    const salvar = elemento('button', 'Salvar anamnese');
    salvar.type = 'submit';
    const retry = elemento('button', 'Tentar confirmar salvamento');
    retry.type = 'button';
    retry.hidden = true;
    form.append(elemento('h2', 'Anamnese de coordenação'));
    const secoes = resultado?.secoes ?? [];
    const pendencias = localizarPendencias(secoes);
    form.append(
      elemento(
        'p',
        pendencias.length
          ? `Seções com pendências: ${pendencias.map((p) => p.secao).join(', ')}.`
          : 'Nenhuma pendência identificada nos campos informados.',
      ),
    );
    if (!secoes.length) form.append(elemento('p', 'Nenhuma seção registrada.'));
    type Campo = {
      secao: string;
      campo: string;
      esperado: boolean;
      estado: HTMLSelectElement;
      valor: HTMLTextAreaElement;
      fonte: HTMLInputElement;
      data: HTMLInputElement;
    };
    const entradas: Campo[] = [];
    const adicionar = (
      secao: string,
      campo: string,
      esperado: boolean,
      resposta?: (typeof secoes)[number]['respostas'][number],
    ) => {
      const grupo = elemento('fieldset');
      grupo.append(elemento('legend', `${secao} — ${campo}`));
      const estado = elemento('select');
      for (const [valor, texto] of [
        ['pendente', 'Pendente'],
        ['informado', 'Informado'],
        ['desconhecido', 'Desconhecido'],
        ['nao_se_aplica', 'Não se aplica'],
      ] as const) {
        const opcao = elemento('option', texto);
        opcao.value = valor;
        estado.append(opcao);
      }
      estado.value = resposta?.estado ?? 'pendente';
      const valor = elemento('textarea');
      const fonte = elemento('input');
      const data = elemento('input');
      data.type = 'date';
      if (resposta?.estado === 'informado') valor.value = resposta.valor;
      if (resposta && resposta.estado !== 'pendente') {
        fonte.value = resposta.fonte;
        data.value = resposta.data;
      }
      const rotular = (texto: string, controle: HTMLElement) => {
        const label = elemento('label', texto);
        label.append(controle);
        grupo.append(label);
      };
      rotular('Estado', estado);
      rotular('Resposta', valor);
      rotular('Fonte', fonte);
      rotular('Data', data);
      const atualizar = () => {
        valor.disabled = estado.value !== 'informado';
        fonte.disabled = data.disabled = estado.value === 'pendente';
      };
      estado.addEventListener('change', atualizar);
      atualizar();
      entradas.push({ secao, campo, esperado, estado, valor, fonte, data });
      campos.append(grupo);
    };
    for (const secao of secoes) {
      const nomes = new Set([...secao.camposEsperados, ...secao.respostas.map((r) => r.campo)]);
      for (const campo of nomes)
        adicionar(
          secao.id,
          campo,
          secao.camposEsperados.includes(campo),
          secao.respostas.find((r) => r.campo === campo),
        );
    }
    const novaSecao = elemento('input');
    const novoCampo = elemento('input');
    const rotularNovo = (texto: string, controle: HTMLElement) => {
      const label = elemento('label', texto);
      label.append(controle);
      form.append(label);
    };
    form.append(campos);
    rotularNovo('Seção', novaSecao);
    rotularNovo('Campo', novoCampo);
    const adicionarBotao = elemento('button', 'Adicionar campo');
    adicionarBotao.type = 'button';
    adicionarBotao.addEventListener('click', () => {
      const secao = novaSecao.value.trim();
      const campo = novoCampo.value.trim();
      if (!secao || !campo || entradas.some((e) => e.secao === secao && e.campo === campo)) {
        aviso.textContent = 'Informe seção e campo ainda não cadastrado.';
        return;
      }
      adicionar(secao, campo, true);
      alteracaoPendente(true);
      novaSecao.value = '';
      novoCampo.value = '';
      aviso.textContent = '';
    });
    form.append(adicionarBotao, salvar, retry, aviso);
    const enviar = async () => {
      if (!pendente) return;
      salvar.disabled = retry.disabled = adicionarBotao.disabled = true;
      aviso.textContent = 'Salvando anamnese…';
      try {
        const salvo = await servico.salvarAnamnese(pacienteId, pendente.entrada, pendente.chave);
        if (!ativa) return;
        pendente = null;
        alteracaoPendente(false);
        desenhar(salvo);
        const mensagem = raiz.querySelector('[role="status"]');
        if (mensagem) mensagem.textContent = 'Anamnese salva.';
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        if (resultadoIncerto(erro)) {
          aviso.textContent =
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.';
          retry.hidden = false;
          retry.disabled = false;
        } else {
          pendente = null;
          campos.removeAttribute('inert');
          novaSecao.disabled = novoCampo.disabled = false;
          conflitoVersao = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
          salvar.disabled = conflitoVersao;
          adicionarBotao.disabled = false;
          retry.hidden = true;
          aviso.textContent = conflitoVersao
            ? 'A anamnese foi alterada por outra pessoa. Copie seu rascunho antes de recarregar a página para consultar a versão atual; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro);
        }
      }
    };
    form.addEventListener('input', () => alteracaoPendente(true));
    form.addEventListener('change', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (pendente || conflitoVersao) return;
      const agrupadas = new Map<
        string,
        { id: string; camposEsperados: string[]; respostas: unknown[] }
      >();
      for (const secao of secoes) {
        agrupadas.set(secao.id, { id: secao.id, camposEsperados: [], respostas: [] });
      }
      for (const e of entradas) {
        const secao = agrupadas.get(e.secao) ?? { id: e.secao, camposEsperados: [], respostas: [] };
        if (e.esperado) secao.camposEsperados.push(e.campo);
        const resposta =
          e.estado.value === 'pendente'
            ? { campo: e.campo, estado: 'pendente' }
            : {
                campo: e.campo,
                estado: e.estado.value,
                fonte: e.fonte.value,
                data: e.data.value,
                ...(e.estado.value === 'informado' ? { valor: e.valor.value } : {}),
              };
        secao.respostas.push(resposta);
        agrupadas.set(e.secao, secao);
      }
      const validada = salvarAnamneseSchema.safeParse({
        versao_esperada: versao,
        secoes: [...agrupadas.values()],
      });
      if (!validada.success) {
        aviso.textContent =
          'Preencha resposta, fonte e data para os estados informados; confira as datas.';
        return;
      }
      pendente = { entrada: validada.data, chave: crypto.randomUUID() };
      alteracaoPendente(true);
      campos.setAttribute('inert', '');
      novaSecao.disabled = novoCampo.disabled = true;
      void enviar();
    });
    retry.addEventListener('click', () => {
      void enviar();
    });
    raiz.replaceChildren(form);
  };
  const consultar = () => {
    status.textContent = 'Carregando anamnese…';
    raiz.replaceChildren(status);
    void servico
      .consultarAnamnese(pacienteId)
      .then(desenhar)
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentarNovamente = elemento('button', 'Tentar novamente');
        tentarNovamente.type = 'button';
        tentarNovamente.addEventListener('click', consultar);
        raiz.append(tentarNovamente);
      });
  };
  consultar();
  return () => {
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
  };
}
