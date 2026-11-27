/* FR-068: tela em que o Administrador concede e revoga a audiência financeira.
 *
 * Reconstruída em React sobre a ilha (`web/telas/ilha-sincrona.ts`). O contrato exportado
 * é o mesmo de antes: `montarFinanceiroConcessaoAdministracao(raiz, servico) => desmontar`.
 *
 * Esta tela NÃO mostra conteúdo financeiro: não há valor acordado, lançamento, apuração
 * nem total em nenhum campo. Ela trata só de quem pode ver o financeiro, e a marca mora na
 * concessão de equipe (`identidade.concessao_equipe.habilitado_financeiro`), nunca em
 * constante do código.
 *
 * Nada aqui autoriza: conceder é ato de Administrador verificado no servidor e no banco, em
 * `operacao.financeiro_concessao_privada`. Quem já tem a audiência financeira não ganha com
 * isso o direito de concedê-la, e a própria concessão de quem concede tem perfil
 * `administrador`, que o banco recusa marcar — a autoconcessão volta como conflito. A tela
 * desencoraja (a linha não é marcável), mas quem forçar o envio continua sendo recusado
 * pelo servidor: é por isso que a guarda daqui é de REENTRÂNCIA, não de autorização.
 *
 * A audiência financeira não decorre de vínculo com caso (design D1): nenhuma informação de
 * caso ou paciente entra nesta tela.
 *
 * VIS-012: a versão imperativa conferia `if (!ativa)` antes de cada escrita vinda de uma
 * resposta atrasada. Não sobrou nenhuma: `ilha()` desmonta a raiz React e escrever estado
 * depois disso não produz efeito.
 */
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { ConcessaoFinanceira } from '../packages/contracts/src/index.js';
import { Botao } from './componentes/ui/botao.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import './estilos/tema.css';
import type { ServicoFinanceiro } from './servico-financeiro-http.js';

const PERFIS: Record<ConcessaoFinanceira['perfil'], string> = {
  profissional: 'Profissional',
  administrador: 'Administrador',
};
const ESTADOS: Record<ConcessaoFinanceira['estado'], string> = {
  pendente: 'Acesso ainda não aceito',
  vinculada: 'Acesso ativo',
  revogada: 'Acesso encerrado',
};

function codigoDe(erro: unknown): string {
  return erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
}

function LinhaConcessao({
  item,
  aoGravar,
}: {
  item: ConcessaoFinanceira;
  aoGravar: (habilitado: boolean) => Promise<void>;
}) {
  const [aviso, definirAviso] = useState('');
  const [enviando, marcarEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const caixaRef = useRef<HTMLInputElement | null>(null);

  const identificador = `financeiro-concessao-${item.concessao_id}`;
  // Marcar exige profissional com acesso ativo; desmarcar continua possível sempre, para
  // que REVOGAR a audiência financeira nunca fique travado. O banco aplica a mesma regra.
  const podeMarcar = item.estado === 'vinculada' && item.perfil === 'profissional';
  const desligada = !podeMarcar && !item.habilitado;
  const ajuda =
    item.perfil === 'administrador'
      ? 'Administrador já vê o financeiro pelo próprio perfil.'
      : podeMarcar
        ? ''
        : 'Só quem tem acesso ativo pode ser marcado.';

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Reentrância, e só. A autorização é do servidor e do banco; repeti-la aqui daria a
    // impressão de que a tela decide, e ela não decide.
    if (enviandoRef.current) return;
    const marcado = caixaRef.current?.checked ?? item.habilitado;
    if (marcado === item.habilitado) {
      definirAviso('Nada mudou nesta linha.');
      return;
    }
    enviandoRef.current = true;
    marcarEnviando(true);
    definirAviso('Salvando…');
    void aoGravar(marcado)
      .then(() => definirAviso('Salvo.'))
      .catch((erro: unknown) => {
        const codigo = codigoDe(erro);
        definirAviso(
          codigo === 'conflito' || codigo === 'conflito_idempotencia'
            ? 'Não foi possível aplicar esta marca. Recarregue e confira o acesso da pessoa.'
            : codigo === 'sem_permissao'
              ? 'Sua conta não pode alterar quem vê o financeiro.'
              : 'Não foi possível salvar. Tente de novo.',
        );
        // A marca volta ao que o servidor confirmou: deixar a caixa no estado recusado
        // afirmaria uma concessão que não existe.
        if (caixaRef.current) caixaRef.current.checked = item.habilitado;
      })
      .finally(() => {
        enviandoRef.current = false;
        marcarEnviando(false);
      });
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="grid gap-2 border-t border-borda px-4 py-4 first:border-t-0"
    >
      <p className="m-0 text-(length:--texto-2) font-semibold">
        {`${item.email} — ${PERFIS[item.perfil]} — ${ESTADOS[item.estado]}`}
      </p>
      {ajuda ? (
        <p id={`${identificador}-ajuda`} className="m-0 text-(length:--texto-1) text-texto-suave">
          {ajuda}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={caixaRef}
          type="checkbox"
          id={identificador}
          defaultChecked={item.habilitado}
          disabled={desligada || enviando}
          {...(ajuda ? { 'aria-describedby': `${identificador}-ajuda` } : {})}
          className="size-5 accent-primaria"
        />
        <label htmlFor={identificador} className="m-0 text-(length:--texto-2)">
          Pode ver o financeiro
        </label>
        <Botao peso="principal" tipo="submit" disabled={desligada || enviando}>
          Salvar
        </Botao>
        <output className="m-0 text-(length:--texto-1) text-texto-suave block" aria-live="polite">
          {aviso}
        </output>
      </div>
    </form>
  );
}

export function TelaFinanceiroConcessao({ servico }: { servico: ServicoFinanceiro }) {
  const [itens, definirItens] = useState<readonly ConcessaoFinanceira[]>([]);
  const [status, definirStatus] = useState('Carregando equipe…');
  const [carregando, definirCarregando] = useState(true);
  const [recusada, definirRecusada] = useState(false);

  const carregar = useCallback(
    async (mensagemInicial = 'Carregando equipe…'): Promise<void> => {
      definirStatus(mensagemInicial);
      definirCarregando(true);
      try {
        const lidos = await servico.listarConcessoes();
        definirRecusada(false);
        definirItens(lidos);
        const marcados = lidos.filter((item) => item.habilitado).length;
        definirStatus(
          marcados === 0
            ? 'Nenhum profissional está marcado para ver o financeiro.'
            : `${marcados} ${marcados === 1 ? 'profissional marcado' : 'profissionais marcados'} para ver o financeiro.`,
        );
      } catch (erro: unknown) {
        definirItens([]);
        definirRecusada(true);
        definirStatus(
          codigoDe(erro) === 'sem_permissao'
            ? 'Sua conta não pode ver quem vê o financeiro.'
            : 'Não foi possível carregar a equipe. Tente recarregar.',
        );
      } finally {
        definirCarregando(false);
      }
    },
    [servico],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const gravar = useCallback(
    async (item: ConcessaoFinanceira, habilitado: boolean) => {
      await servico.gravarConcessao(
        { concessao_id: item.concessao_id, habilitado, versao_esperada: item.versao },
        crypto.randomUUID(),
      );
      // A leitura seguinte é um novo pedido ao servidor, não um estado local otimista: a
      // marca que a tela mostra tem de ser a que o banco guardou.
      await carregar('Marca do financeiro atualizada.');
    },
    [servico, carregar],
  );

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
          Quem vê o financeiro
        </h2>
        <p className="m-0 max-w-[68ch] text-texto-suave">
          Marque aqui quem pode ver e lançar o financeiro do cuidado. Só profissionais com acesso
          ativo podem receber a marca; Administrador já vê o financeiro pelo próprio perfil. A marca
          não depende de caso e não dá acesso a nenhum caso.
        </p>
        <output className="m-0 text-(length:--texto-1) text-texto-suave block" aria-live="polite">
          {status}
        </output>
      </header>

      <Esqueleto ocupado={carregando}>
        {itens.length ? (
          <div className="overflow-hidden rounded-cartao border border-borda bg-superficie">
            {itens.map((item) => (
              // A chave carrega versão e marca: quando o servidor confirma a gravação, a
              // linha é outra, e a caixa não controlada nasce de novo com o valor lido.
              <LinhaConcessao
                key={`${item.concessao_id}:${String(item.versao)}:${String(item.habilitado)}`}
                item={item}
                aoGravar={(habilitado) => gravar(item, habilitado)}
              />
            ))}
          </div>
        ) : null}
        {!carregando && !recusada && itens.length === 0 ? (
          <EstadoVazio titulo="Nenhuma pessoa com acesso cadastrado." />
        ) : null}
      </Esqueleto>

      <div>
        <Botao peso="secundario" disabled={carregando} aoAtivar={() => void carregar()}>
          Recarregar
        </Botao>
      </div>
    </section>
  );
}
