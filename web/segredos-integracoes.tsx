import { useEffect, useRef, useState } from 'react';
import type { SegredosIntegracoes } from '../packages/contracts/src/segredos-integracoes.ts';
import type { ServicoSegredosIntegracoes } from './servico-segredos-integracoes-http.ts';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { Superficie } from './componentes/ui/superficie.js';
import { Formulario } from './telas/formulario.js';
import { MolduraTela } from './telas/moldura-tela.js';

const rotulos: Record<SegredosIntegracoes['chave'], string> = {
  'ffcmapp.integracao.google_drive': 'Google Drive — JSON da conta de serviço',
  'ffcmapp.integracao.openrouter': 'OpenRouter — chave da API',
  'ffcmapp.integracao.google_calendar_client_id': 'Google Calendar — client ID',
  'ffcmapp.integracao.google_calendar_client_secret': 'Google Calendar — client secret',
};

type Maquina = {
  itens: readonly SegredosIntegracoes[];
  geracao: number;
  status: string;
  avisoExpurgo: string;
  avisos: Record<string, string>;
  ativa: boolean;
  gravando: boolean;
  carregando: boolean;
  precisaConferir: boolean;
};

/** Superfície somente escrita. Nunca mantém valores em storage ou reconstitui segredo.
 *
 *  O valor digitado NÃO passa por estado do React em momento nenhum: ele é lido do
 *  controle no instante do envio, e o controle é limpo antes mesmo de o serviço ser
 *  chamado. Guardar o segredo em estado o deixaria vivo na árvore do React, visível a
 *  qualquer ferramenta de inspeção e sobrevivente a repinturas — exatamente o que esta
 *  tela existe para não fazer.
 *
 *  A chave `geracao` da lista é parte desse contrato: a cada leitura concluída os campos
 *  são nós NOVOS, como a reconstrução do DOM fazia antes. Reaproveitar o nó manteria um
 *  valor digitado e não enviado dentro de um formulário que acabou de mudar de versão. */
export function TelaSegredosIntegracoes({
  servico,
  nomeDoUsuario,
}: {
  servico: ServicoSegredosIntegracoes;
  nomeDoUsuario?: (id: string) => string | undefined;
}) {
  const [, repintar] = useState(0);
  const estado = useRef<Maquina>({
    itens: [],
    geracao: 0,
    status: '',
    avisoExpurgo: '',
    avisos: {},
    ativa: true,
    gravando: false,
    carregando: false,
    precisaConferir: false,
  });
  const servicoRef = useRef(servico);
  servicoRef.current = servico;
  const pintar = () => {
    if (estado.current.ativa) repintar((volta) => volta + 1);
  };

  const carregarExpurgo = async () => {
    const consultar = servicoRef.current.consultarExpurgo;
    if (!consultar) return;
    estado.current.avisoExpurgo = 'Consultando descarte automático…';
    pintar();
    try {
      const resultado = await consultar();
      if (!estado.current.ativa) return;
      const ultima = resultado.ultima_execucao;
      estado.current.avisoExpurgo = `${resultado.ativo ? 'Descarte automático habilitado.' : 'Descarte automático desligado.'} ${ultima ? `Última execução em ${new Date(ultima.executado_em).toLocaleString('pt-BR')}. ${ultima.falhas > 0 ? `Pendência operacional: ${String(ultima.falhas)} descartes falharam. Solicite verificação à equipe responsável.` : 'Nenhuma falha registrada nessa execução.'}` : 'Nenhuma execução registrada.'}`;
      pintar();
    } catch {
      if (!estado.current.ativa) return;
      estado.current.avisoExpurgo =
        'Não foi possível consultar o descarte. Recarregue para tentar novamente.';
      pintar();
    }
  };

  const carregar = async (mensagem = 'Carregando credenciais…') => {
    const atual = estado.current;
    if (!atual.ativa || atual.gravando || atual.carregando) return;
    atual.carregando = true;
    void carregarExpurgo();
    atual.status = mensagem;
    pintar();
    try {
      const itens = await servicoRef.current.listar();
      if (!estado.current.ativa) return;
      estado.current.precisaConferir = false;
      estado.current.itens = itens;
      estado.current.geracao += 1;
      estado.current.avisos = {};
      estado.current.status = mensagem.startsWith('Credencial cadastrada')
        ? mensagem
        : `${String(itens.length)} credenciais disponíveis.`;
    } catch {
      if (!estado.current.ativa) return;
      estado.current.itens = [];
      estado.current.geracao += 1;
      estado.current.avisos = {};
      estado.current.status =
        'Não foi possível carregar. Confira seu acesso de Administrador e tente recarregar.';
    } finally {
      estado.current.carregando = false;
      pintar();
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela. A máquina lê serviço, textos e estado por referência viva, então uma lista de dependências aqui só criaria releitura a cada repintura.
  useEffect(() => {
    void carregar();
    return () => {
      estado.current.ativa = false;
    };
  }, []);

  const atual = estado.current;
  // Um único interruptor para toda a lista, como `atualizarControles` fazia: enquanto
  // houver leitura, gravação ou resultado por conferir, nada dali aceita entrada.
  const travado = atual.carregando || atual.gravando || atual.precisaConferir;

  const enviar = (item: SegredosIntegracoes, formulario: HTMLFormElement) => {
    const campo = formulario.elements.namedItem('credencial');
    if (!(campo instanceof HTMLInputElement)) return;
    const agora = estado.current;
    if (!agora.ativa || agora.gravando || agora.carregando || agora.precisaConferir) return;
    if (!campo.value.trim()) return;
    const entrada = {
      segredo_chave: item.chave,
      valor: campo.value,
      versao_esperada: item.versao,
    };
    // Limpar antes de chamar o serviço também cobre uma recusa síncrona do adapter.
    campo.value = '';
    agora.gravando = true;
    agora.avisos = { ...agora.avisos, [item.chave]: 'Enviando credencial…' };
    pintar();
    void (async () => {
      try {
        await servicoRef.current.gravar(entrada);
        if (!estado.current.ativa) return;
        estado.current.gravando = false;
        await carregar('Credencial cadastrada. Valor não disponível para consulta.');
      } catch (erro: unknown) {
        if (!estado.current.ativa) return;
        estado.current.gravando = false;
        estado.current.precisaConferir = true;
        const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? erro.codigo : '';
        estado.current.avisos = {
          ...estado.current.avisos,
          [item.chave]:
            codigo === 'conflito_versao'
              ? 'Versão mudou. Recarregue antes de substituir.'
              : 'Não foi possível confirmar o cadastro. Recarregue e confira a versão antes de tentar novamente.',
        };
        pintar();
      }
    })();
  };

  return (
    <>
      <MolduraTela
        titulo="Credenciais das integrações"
        explicacao="Cadastre as credenciais para preparar as integrações. Os valores enviados não podem ser consultados aqui. Substituir preserva a versão anterior. Cadastrado não significa conexão confirmada com o serviço."
        acao={
          <Botao disabled={atual.carregando || atual.gravando} aoAtivar={() => void carregar()}>
            Recarregar integrações
          </Botao>
        }
        status={atual.status}
        ocupado={atual.carregando}
      >
        {atual.itens.length === 0 ? null : (
          <div className="grid gap-4" key={`credenciais-${String(atual.geracao)}`}>
            {atual.itens.map((item) => (
              <Credencial
                key={item.chave}
                item={item}
                travado={travado}
                aviso={atual.avisos[item.chave] ?? ''}
                nomeDoUsuario={nomeDoUsuario}
                aoEnviar={enviar}
              />
            ))}
          </div>
        )}
      </MolduraTela>
      <Superficie titulo="Descarte de áudios abandonados" className="mt-6">
        <p
          // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o que as telas e as provas já usam; `<output>` muda a semântica de formulário e o gancho que as provas procuram.
          role="status"
          aria-live="polite"
          className="m-0 max-w-[68ch] text-texto-suave empty:hidden"
        >
          {atual.avisoExpurgo}
        </p>
      </Superficie>
    </>
  );
}

function limparCredencialAoDesmontar(campo: HTMLInputElement | null) {
  if (!campo) return;
  return () => {
    campo.value = '';
  };
}

function Credencial({
  item,
  travado,
  aviso,
  nomeDoUsuario,
  aoEnviar,
}: {
  item: SegredosIntegracoes;
  travado: boolean;
  aviso: string;
  nomeDoUsuario?: (id: string) => string | undefined;
  aoEnviar: (item: SegredosIntegracoes, formulario: HTMLFormElement) => void;
}) {
  const quem = item.atualizado_por_usuario_id
    ? (nomeDoUsuario?.(item.atualizado_por_usuario_id) ??
      `usuário ${item.atualizado_por_usuario_id.slice(0, 8)}`)
    : null;
  const autoria = item.cadastrado
    ? `Cadastrado. Versão ${String(item.versao)}.${quem && item.atualizado_em ? ` Por ${quem}, em ${new Date(item.atualizado_em).toLocaleString('pt-BR')}.` : ' Cadastro anterior à tela, autoria não disponível.'}`
    : 'Não cadastrado.';
  return (
    <Superficie titulo={rotulos[item.chave]} descricao={autoria}>
      <Formulario aoEnviar={(formulario) => aoEnviar(item, formulario)}>
        <Campo
          id={`segredo-${item.chave.replaceAll('.', '-')}`}
          ref={limparCredencialAoDesmontar}
          name="credencial"
          rotulo={rotulos[item.chave]}
          tipo="password"
          autoComplete="new-password"
          spellCheck={false}
          maxLength={48_000}
          required
          disabled={travado}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Botao peso="principal" tipo="submit" disabled={travado}>
            {item.cadastrado ? 'Substituir credencial' : 'Cadastrar credencial'}
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
