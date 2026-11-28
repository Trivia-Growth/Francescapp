import { useEffect, useRef, useState } from 'react';
import type { ItemHabilitacao } from '../packages/contracts/src/habilitacao-plano-crise.ts';
import type { ServicoHabilitacaoPlanoCrise } from './servico-habilitacao-plano-crise-http.ts';
import { Botao } from './componentes/ui/botao.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { Superficie } from './componentes/ui/superficie.js';
import { CaixaDeMarcacao } from './telas/caixa-de-marcacao.js';
import { Formulario, marcado } from './telas/formulario.js';
import { MolduraTela } from './telas/moldura-tela.js';

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
 * Marcar aqui não concede acesso a casos nem alçada fora do caso liderado, e quem aprova
 * continua sendo verificado no servidor e no banco a cada aprovação. */
export function TelaHabilitacaoPlanoCrise({ servico }: { servico: ServicoHabilitacaoPlanoCrise }) {
  const [tela, definirTela] = useState<{
    itens: readonly ItemHabilitacao[];
    geracao: number;
    carregando: boolean;
    status: string;
  }>({ itens: [], geracao: 0, carregando: true, status: 'Carregando equipe…' });
  const ativa = useRef(true);
  const servicoRef = useRef(servico);
  servicoRef.current = servico;

  const carregar = async (mensagemInicial = 'Carregando equipe…') => {
    definirTela((anterior) => ({ ...anterior, carregando: true, status: mensagemInicial }));
    try {
      const itens = await servicoRef.current.listar();
      if (!ativa.current) return;
      const habilitados = itens.filter((item) => item.habilitado).length;
      definirTela((anterior) => ({
        itens,
        geracao: anterior.geracao + 1,
        carregando: false,
        status:
          habilitados === 0
            ? 'Ninguém está habilitado a aprovar plano de crise.'
            : `${String(habilitados)} ${habilitados === 1 ? 'pessoa habilitada' : 'pessoas habilitadas'} a aprovar plano de crise.`,
      }));
    } catch {
      if (!ativa.current) return;
      definirTela((anterior) => ({
        itens: [],
        geracao: anterior.geracao + 1,
        carregando: false,
        status: 'Não foi possível carregar a equipe. Tente recarregar.',
      }));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela. A máquina lê serviço, textos e estado por referência viva, então uma lista de dependências aqui só criaria releitura a cada repintura.
  useEffect(() => {
    void carregar();
    return () => {
      ativa.current = false;
    };
  }, []);

  return (
    <MolduraTela
      titulo="Quem aprova plano de crise"
      explicacao="Aprova o plano de crise quem estiver habilitado aqui e for o case manager atual do caso. Administradores e profissionais com acesso ativo podem receber a habilitação; o perfil sozinho não permite aprovar."
      acao={
        <Botao disabled={tela.carregando} aoAtivar={() => void carregar()}>
          Recarregar
        </Botao>
      }
      status={tela.status}
      ocupado={tela.carregando}
    >
      {tela.itens.length === 0 ? (
        tela.carregando ? null : (
          <EstadoVazio titulo="Nenhuma pessoa com acesso cadastrado." />
        )
      ) : (
        <div className="grid gap-3" key={`equipe-${String(tela.geracao)}`}>
          {tela.itens.map((item) => (
            <LinhaHabilitacao
              key={item.concessao_id}
              item={item}
              bloqueado={tela.carregando}
              aoGravar={async (habilitado) => {
                await servicoRef.current.gravar({
                  concessao_id: item.concessao_id,
                  habilitado,
                  versao_esperada: item.versao,
                });
                if (!ativa.current) return;
                void carregar('Marca de habilitação atualizada.');
              }}
            />
          ))}
        </div>
      )}
    </MolduraTela>
  );
}

function LinhaHabilitacao({
  item,
  bloqueado,
  aoGravar,
}: {
  item: ItemHabilitacao;
  bloqueado: boolean;
  aoGravar: (habilitado: boolean) => Promise<void>;
}) {
  const [salvando, definirSalvando] = useState(false);
  const [aviso, definirAviso] = useState('');
  const identificador = `habilitacao-${item.concessao_id}`;
  // Marcar exige colaborador com acesso ativo; desmarcar continua possível sempre,
  // para que retirar a habilitação de alguém nunca fique travado.
  const podeMarcar = item.estado === 'vinculada';
  const travada = (!podeMarcar && !item.habilitado) || salvando;
  const ajuda = podeMarcar ? undefined : 'Só quem tem acesso ativo pode ser habilitado.';

  return (
    <Superficie
      titulo={item.email}
      descricao={`${PERFIS[item.perfil]} — ${ESTADOS[item.estado]}`}
      acao={
        <MarcaEstado tom={item.habilitado ? 'padrao' : 'contorno'}>
          {item.habilitado ? 'habilitado' : 'não habilitado'}
        </MarcaEstado>
      }
    >
      <Formulario
        noValidate
        aoEnviar={(formulario) => {
          if (travada || bloqueado) return;
          const habilitado = marcado(formulario, 'habilitado');
          if (habilitado === item.habilitado) {
            definirAviso('Nada mudou nesta linha.');
            return;
          }
          definirSalvando(true);
          definirAviso('Salvando…');
          void aoGravar(habilitado)
            .then(() => {
              definirAviso('Salvo.');
            })
            .catch((erro: unknown) => {
              const codigo =
                erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
              definirAviso(
                codigo === 'conflito_versao'
                  ? 'Alguém mudou esta marca enquanto você editava. Recarregue e tente de novo.'
                  : codigo === 'sem_permissao'
                    ? 'Sua conta não pode alterar quem aprova plano de crise.'
                    : 'Não foi possível salvar. Tente de novo.',
              );
              definirSalvando(false);
              const caixa = formulario.elements.namedItem('habilitado');
              if (caixa instanceof HTMLInputElement) caixa.checked = item.habilitado;
            });
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <CaixaDeMarcacao
            id={identificador}
            name="habilitado"
            rotulo="Pode aprovar plano de crise"
            defaultChecked={item.habilitado}
            disabled={travada}
            ajuda={ajuda}
          />
          <Botao peso="principal" tipo="submit" disabled={travada}>
            Salvar
          </Botao>
          <p
            // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o que as telas e as provas já usam; `<output>` muda a semântica de formulário e o gancho que as provas procuram.
            role="status"
            aria-live="polite"
            className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {aviso}
          </p>
        </div>
      </Formulario>
    </Superficie>
  );
}
