import type { z } from 'zod';
import type {
  cancelarPreautorizacaoFamiliarSchema,
  preautorizacaoFamiliarSchema,
} from '../packages/contracts/src/identidade.ts';

export type Preautorizacao = z.infer<typeof preautorizacaoFamiliarSchema>;
export type ServicoPreautorizacoes = {
  listar(pacienteId: string): Promise<Preautorizacao[]>;
  cancelar(entrada: z.infer<typeof cancelarPreautorizacaoFamiliarSchema>): Promise<void>;
};

const rotulosEstado: Record<Preautorizacao['estado'], string> = {
  pendente: 'Convite a enviar',
  enviado: 'Convite enviado',
  falha: 'Envio falhou',
  ativado: 'E-mail confirmado',
};

function formatarData(valor: string | null): string {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
}

/**
 * Lista os acessos de familiares autorizados no caso e permite encerrar cada um.
 * Encerrar aqui fecha o acesso na hora, inclusive para quem já entrou.
 */
export function montarPreautorizacoesFamiliares(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoPreautorizacoes,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  let ocupada = false;

  const secao = document.createElement('section');
  const titulo = document.createElement('h3');
  titulo.textContent = 'Acesso da família';
  const explicacao = document.createElement('p');
  explicacao.textContent =
    'Quem a equipe autorizou a acompanhar este caso. Encerrar um acesso tem efeito imediato.';
  const estado = document.createElement('p');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  const lista = document.createElement('ul');
  secao.append(titulo, explicacao, estado, lista);
  raiz.append(secao);

  const avisar = (texto: string) => {
    estado.textContent = texto;
  };

  const desenhar = (itens: Preautorizacao[]) => {
    lista.replaceChildren();
    if (itens.length === 0) {
      avisar('Nenhum familiar autorizado neste caso ainda.');
      return;
    }
    avisar('');
    for (const item of itens) {
      const linha = document.createElement('li');
      const encerrado = item.acesso_revogado_em !== null;
      const descricao = document.createElement('p');
      const quando = formatarData(item.acesso_autorizado_em ?? item.criado_em);
      descricao.textContent = encerrado
        ? `${rotulosEstado[item.estado]} · acesso encerrado em ${formatarData(item.acesso_revogado_em)}`
        : `${rotulosEstado[item.estado]}${quando ? ` · autorizado em ${quando}` : ''}`;
      linha.append(descricao);
      if (!encerrado && item.acesso_preautorizado_id) {
        const acessoId = item.acesso_preautorizado_id;
        const formulario = document.createElement('form');
        const campos = document.createElement('fieldset');
        const motivo = document.createElement('input');
        motivo.type = 'text';
        motivo.required = true;
        motivo.maxLength = 500;
        motivo.placeholder = 'Por que está encerrando';
        const rotulo = document.createElement('label');
        rotulo.textContent = 'Motivo';
        rotulo.append(motivo);
        const botao = document.createElement('button');
        botao.type = 'submit';
        botao.textContent = 'Encerrar acesso';
        campos.append(rotulo, botao);
        formulario.append(campos);
        formulario.addEventListener('submit', async (evento) => {
          evento.preventDefault();
          if (!ativa || ocupada) return;
          const texto = motivo.value.trim();
          if (texto.length === 0) {
            avisar('Informe o motivo para encerrar o acesso.');
            motivo.focus();
            return;
          }
          ocupada = true;
          campos.disabled = true;
          avisar('Encerrando o acesso…');
          try {
            await servico.cancelar({
              convite_id: item.convite_id,
              acesso_id: acessoId,
              motivo: texto,
            });
            if (!ativa) return;
            await carregar();
            if (ativa) avisar('Acesso encerrado.');
          } catch (erro) {
            if (!ativa) return;
            acessoPerdido(erro);
            avisar('Não foi possível encerrar o acesso agora. Tente de novo.');
          } finally {
            ocupada = false;
            campos.disabled = false;
          }
        });
        linha.append(formulario);
      }
      lista.append(linha);
    }
  };

  const carregar = async () => {
    avisar('Carregando os acessos da família…');
    try {
      const itens = await servico.listar(pacienteId);
      if (!ativa) return;
      desenhar(itens);
    } catch (erro) {
      if (!ativa) return;
      acessoPerdido(erro);
      avisar('Não foi possível carregar os acessos da família agora.');
    }
  };

  void carregar();
  return () => {
    ativa = false;
    secao.remove();
  };
}
