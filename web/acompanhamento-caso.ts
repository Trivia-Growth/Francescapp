import type { AcompanhamentoCaso, SituacaoCaso } from '../packages/contracts/src/index.js';

export const rotulosSituacao: Readonly<Record<SituacaoCaso, string>> = Object.freeze({
  entrada: 'Entrada',
  ativo: 'Ativo',
  pausado: 'Pausado',
  encerrado: 'Encerrado',
  transferido: 'Transferido',
});

/** Pessoa da equipe com concessão vinculada; só as ativas podem ser indicadas como responsável (case manager). */
export type ResponsavelOpcao = { usuario_id: string; rotulo: string; ativo: boolean };

/** Nome legível a partir do e-mail de acesso. Enquanto a equipe não tem nome próprio
 *  cadastrado, mostrar o endereço inteiro na ficha deixa a tela com cara de banco de dados. */
export function nomeDeEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const partes = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toLocaleUpperCase('pt-BR') + parte.slice(1));
  return partes.length ? partes.join(' ') : email;
}

type PaginaConcessoes = {
  itens: {
    perfil: 'administrador' | 'profissional';
    estado: string;
    usuario_id: string | null;
    email: string;
    ativo: boolean | null;
  }[];
  proximo_cursor: string | null;
};

const LIMITE_PAGINAS = 10;

/** Equipe com concessão vinculada, como o servidor a devolve; a inativação conhecida fica marcada, não escondida. */
export function criarCatalogoResponsaveis(
  listar: (cursor?: string) => Promise<PaginaConcessoes>,
): () => Promise<ResponsavelOpcao[]> {
  let cache: Promise<ResponsavelOpcao[]> | null = null;
  const carregar = async () => {
    const opcoes: ResponsavelOpcao[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < LIMITE_PAGINAS; pagina += 1) {
      const resposta = await listar(cursor);
      for (const item of resposta.itens)
        if (item.estado === 'vinculada' && item.usuario_id)
          opcoes.push({
            usuario_id: item.usuario_id,
            ativo: item.ativo !== false,
            rotulo: `${nomeDeEmail(item.email)} · ${item.perfil === 'administrador' ? 'Administrador' : 'Profissional'}`,
          });
      if (!resposta.proximo_cursor) return opcoes;
      cursor = resposta.proximo_cursor;
    }
    throw new Error('Equipe longa demais para listar.');
  };
  return () => {
    cache ??= carregar();
    // Falha não fica em cache: a próxima tentativa consulta de novo.
    cache.catch(() => {
      cache = null;
    });
    return cache;
  };
}

/** Texto do responsável vigente; nunca afirma ativo sem confirmação do servidor. */
export function descreverResponsavel(
  mudanca: Pick<AcompanhamentoCaso, 'responsavel_id' | 'responsavel_ativo'>,
  opcoes: readonly ResponsavelOpcao[],
): string {
  if (!mudanca.responsavel_id) return 'a completar';
  const nome =
    opcoes.find((opcao) => opcao.usuario_id === mudanca.responsavel_id)?.rotulo ??
    'Responsável indicado';
  return mudanca.responsavel_ativo === false
    ? `${nome} (inativo: indique um novo responsável)`
    : nome;
}
