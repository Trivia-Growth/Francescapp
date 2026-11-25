import {
  gravarEstadoEmocionalSchema,
  type EstadoEmocional,
  type GravarEstadoEmocional,
} from '../packages/contracts/src/estado-emocional.ts';
import type { ServicoEstadoEmocional } from './servico-catalogo-administrado-http.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import { botao, estadoVazio } from './ui/basicos.js';

/** FR-076/FR-081. Catálogo de estado emocional observado na ficha de plantão. É vocabulário
 * de OBSERVAÇÃO: não há nota, escala, pontuação nem ordem de gravidade, e por isso o registro
 * correspondente também não tem número. Não concede, amplia nem restringe acesso nenhum.
 * Desativar um termo não reescreve ficha antiga, que guarda o rótulo da época. */
export function montarEstadoEmocionalAdministracao(
  raiz: HTMLElement,
  servico: ServicoEstadoEmocional,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  let ocupado = false;
  let tentativa: { entrada: GravarEstadoEmocional; chave: string; consultada: boolean } | null =
    null;
  const el = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const item = document.createElement(tipo);
    if (texto !== undefined) item.textContent = texto;
    return item;
  };
  const status = el('p');
  status.setAttribute('role', 'status');
  const conteudo = el('div');
  const recuperacao = el('div');
  const repetir = botao({ rotulo: 'Repetir exatamente o envio conferido', peso: 'secundario' });
  const atualizar = botao({ rotulo: 'Atualizar catálogo de termos', peso: 'secundario' });
  const estadoTentativa = () => {
    recuperacao.replaceChildren();
    if (!tentativa) return;
    recuperacao.append(
      el(
        'p',
        `Termo: ${tentativa.entrada.estado}. Resultado aguardando confirmação; novas alterações estão bloqueadas. Consulte e repita o mesmo envio se necessário.`,
      ),
      repetir,
    );
    repetir.disabled = ocupado || !tentativa.consultada;
  };
  const bloquearFormularios = () => {
    for (const grupo of conteudo.querySelectorAll('fieldset'))
      grupo.disabled = ocupado || tentativa !== null;
  };
  raiz.replaceChildren(
    el('h2', 'Estado emocional observado'),
    el(
      'p',
      'Termos que o profissional escolhe ao registrar o estado emocional observado na ficha de plantão, como tranquilo, agitado ou comunicativo. São palavras de observação: não existe nota, escala, pontuação nem ordem de gravidade, e o registro guardado não tem número. Desativar um termo não altera ficha já gravada.',
    ),
    status,
    atualizar,
    recuperacao,
    conteudo,
  );
  const falha = (erro: unknown) => {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      raiz.replaceChildren();
      acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  };
  const enviar = (entrada: unknown) => {
    if (ocupado || tentativa) return;
    const dados = gravarEstadoEmocionalSchema.safeParse(entrada);
    if (!dados.success) {
      status.textContent = 'Informe um termo com 1 a 80 caracteres.';
      return;
    }
    tentativa = {
      entrada: structuredClone(dados.data),
      chave: crypto.randomUUID(),
      consultada: false,
    };
    void enviarTentativa();
  };
  const formulario = (termo?: EstadoEmocional) => {
    const form = el('form');
    const grupo = el('fieldset');
    grupo.append(el('legend', termo ? `Renomear ${termo.estado}` : 'Novo termo'));
    const label = el('label', 'Termo observado');
    const estado = el('input');
    estado.value = termo?.estado ?? '';
    estado.required = true;
    estado.maxLength = 80;
    label.append(estado);
    grupo.append(label);
    const salvar = botao({
      rotulo: termo ? 'Salvar termo' : 'Criar termo',
      peso: 'principal',
      tipo: 'submit',
    });
    grupo.append(salvar);
    form.append(grupo);
    form.onsubmit = (evento) => {
      evento.preventDefault();
      enviar({
        estado_id: termo?.estado_id ?? crypto.randomUUID(),
        estado: estado.value,
        ativo: termo?.ativo ?? true,
        versao_esperada: termo?.versao ?? 0,
      });
    };
    return form;
  };
  const carregar = async () => {
    if (ocupado) return;
    ocupado = true;
    atualizar.disabled = true;
    status.textContent = 'Carregando termos de estado emocional…';
    // A frase sozinha trocava o painel inteiro por uma linha de texto. A região passa a
    // dizer que está em consulta, e web/styles.css lhe dá a forma do que vem.
    conteudo.setAttribute('aria-busy', 'true');
    try {
      const termos = await servico.consultar();
      if (!ativa) return;
      if (tentativa) {
        const pendente = tentativa;
        const confirmado = termos.some(
          (termo) =>
            termo.estado_id === pendente.entrada.estado_id &&
            termo.versao === pendente.entrada.versao_esperada + 1 &&
            termo.estado === pendente.entrada.estado &&
            termo.ativo === pendente.entrada.ativo,
        );
        if (confirmado) tentativa = null;
        else pendente.consultada = true;
      }
      conteudo.replaceChildren(el('h3', 'Novo termo'), formulario());
      conteudo.append(el('h3', 'Termos do catálogo'));
      // Catálogo vazio impede publicar a ficha quando o campo é preenchido: a submissão é
      // atômica e o banco recusa termo fora do catálogo, derrubando a ficha inteira.
      if (!termos.length)
        conteudo.append(
          estadoVazio(
            'Nenhum termo no catálogo.',
            'Enquanto estiver vazio, a ficha de plantão não aceita estado emocional. Crie o primeiro termo acima.',
          ),
        );
      for (const termo of termos) {
        const detalhe = el('details');
        const marcas = [
          termo.ativo ? 'ativo' : 'desativado',
          ...(termo.de_fabrica ? ['de fábrica'] : []),
        ];
        const alternar = botao({
          rotulo: termo.ativo ? 'Desativar termo' : 'Reativar termo',
          peso: 'secundario',
        });
        alternar.onclick = () =>
          enviar({
            estado_id: termo.estado_id,
            estado: termo.estado,
            ativo: !termo.ativo,
            versao_esperada: termo.versao,
          });
        const acao = el('p');
        acao.append(alternar);
        detalhe.append(
          el('summary', `${termo.estado} — ${marcas.join(', ')}`),
          formulario(termo),
          acao,
        );
        conteudo.append(detalhe);
      }
      status.textContent = tentativa
        ? 'Consulta concluída. O envio anterior ainda precisa de confirmação; confira e repita exatamente o mesmo envio.'
        : 'Catálogo de termos atualizado.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupado = false;
      atualizar.disabled = false;
      conteudo.removeAttribute('aria-busy');
      if (ativa) {
        bloquearFormularios();
        estadoTentativa();
      }
    }
  };
  async function enviarTentativa() {
    if (!ativa || ocupado || !tentativa) return;
    ocupado = true;
    atualizar.disabled = true;
    tentativa.consultada = false;
    bloquearFormularios();
    estadoTentativa();
    status.textContent = 'Salvando termo…';
    try {
      await servico.gravar(tentativa.entrada, tentativa.chave);
      if (!ativa) return;
      tentativa = null;
      ocupado = false;
      await carregar();
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupado = false;
      atualizar.disabled = false;
      if (ativa) {
        bloquearFormularios();
        estadoTentativa();
      }
    }
  }
  repetir.onclick = () => {
    if (tentativa?.consultada) void enviarTentativa();
  };
  atualizar.onclick = () => {
    void carregar();
  };
  void carregar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
