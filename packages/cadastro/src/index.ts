import {
  assinaturasRpc,
  contratosRotas,
  erroRespostaSchema,
  sucessoRespostaSchema,
  type RespostaHttp,
} from '@ffcmapp/contratos';

type ConsultaPacientes = ReturnType<typeof contratosRotas.listarPacientes.entrada.parse>;
type CriarPaciente = ReturnType<typeof contratosRotas.criarPaciente.entrada.parse>;
type AtualizarPaciente = ReturnType<typeof contratosRotas.atualizarPaciente.entrada.parse>;
type NovoContato = ReturnType<typeof contratosRotas.criarContato.entrada.parse>;
type AtualizarContato = ReturnType<typeof contratosRotas.atualizarContato.entrada.parse>;
type CabecalhosMutacao = ReturnType<typeof contratosRotas.criarPaciente.cabecalhos.parse>;
type ParametrosPaciente = ReturnType<typeof contratosRotas.consultarPaciente.parametros.parse>;
type ParametrosContato = ReturnType<typeof contratosRotas.atualizarContato.parametros.parse>;

type ListaPacientes = ReturnType<typeof contratosRotas.listarPacientes.saida.parse>;
type PacienteConsultado = ReturnType<typeof contratosRotas.consultarPaciente.saida.parse>;
type PacienteAdministrativo = ReturnType<typeof contratosRotas.criarPaciente.saida.parse>;

export type SolicitacaoCadastro =
  | { operacao: 'listarPacientes'; consulta: ConsultaPacientes }
  | { operacao: 'consultarPaciente'; parametros: ParametrosPaciente }
  | {
      operacao: 'criarPaciente';
      corpo: CriarPaciente;
      cabecalhos: CabecalhosMutacao;
    }
  | {
      operacao: 'atualizarPaciente';
      parametros: ParametrosPaciente;
      corpo: AtualizarPaciente;
      cabecalhos: CabecalhosMutacao;
    }
  | {
      operacao: 'criarContato';
      parametros: ParametrosPaciente;
      corpo: NovoContato;
      cabecalhos: CabecalhosMutacao;
    }
  | {
      operacao: 'atualizarContato';
      parametros: ParametrosContato;
      corpo: AtualizarContato;
      cabecalhos: CabecalhosMutacao;
    };

export type RespostaCadastro =
  | RespostaHttp<ListaPacientes>
  | RespostaHttp<PacienteConsultado>
  | RespostaHttp<PacienteAdministrativo>;

/**
 * Dados já validados na borda HTTP. Perfil, usuário, sessão, vínculo e cifra
 * não entram nesta estrutura: o adapter server-side os deriva e valida antes
 * de invocar a RPC correspondente.
 */
export type ChamadaRpcCadastro = {
  operacao: SolicitacaoCadastro['operacao'];
  caminho: string;
  rpc: string;
  entrada: Record<string, unknown>;
  parametros: Record<string, unknown>;
  cabecalhos: Record<string, unknown>;
};

/**
 * Seam para a infraestrutura server-side. A implementação futura cifra,
 * atesta, deriva a identidade da sessão e converte a resposta da RPC na
 * resposta HTTP sanitizada; este módulo não possui fallback de autorização.
 */
export interface AdaptadorRpcCadastro {
  executar(chamada: ChamadaRpcCadastro): Promise<unknown>;
}

export interface ModuloCadastro {
  executar(solicitacao: SolicitacaoCadastro): Promise<RespostaCadastro>;
}

type DefinicaoCadastro = {
  caminho: string;
  rpc: string;
};

const definicoesCadastro: Record<SolicitacaoCadastro['operacao'], DefinicaoCadastro> = {
  listarPacientes: {
    caminho: contratosRotas.listarPacientes.caminho,
    rpc: assinaturasRpc.listarPacientes.rpc,
  },
  consultarPaciente: {
    caminho: contratosRotas.consultarPaciente.caminho,
    rpc: assinaturasRpc.consultarPaciente.rpc,
  },
  criarPaciente: {
    caminho: contratosRotas.criarPaciente.caminho,
    rpc: assinaturasRpc.criarPaciente.rpc,
  },
  atualizarPaciente: {
    caminho: contratosRotas.atualizarPaciente.caminho,
    rpc: assinaturasRpc.atualizarPaciente.rpc,
  },
  criarContato: {
    caminho: contratosRotas.criarContato.caminho,
    rpc: assinaturasRpc.criarContato.rpc,
  },
  atualizarContato: {
    caminho: contratosRotas.atualizarContato.caminho,
    rpc: assinaturasRpc.atualizarContato.rpc,
  },
};

const chavesPermitidas: Record<SolicitacaoCadastro['operacao'], readonly string[]> = {
  listarPacientes: ['operacao', 'consulta'],
  consultarPaciente: ['operacao', 'parametros'],
  criarPaciente: ['operacao', 'corpo', 'cabecalhos'],
  atualizarPaciente: ['operacao', 'parametros', 'corpo', 'cabecalhos'],
  criarContato: ['operacao', 'parametros', 'corpo', 'cabecalhos'],
  atualizarContato: ['operacao', 'parametros', 'corpo', 'cabecalhos'],
};

function registro(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('Solicitação de cadastro inválida.');
  }

  return valor as Record<string, unknown>;
}

function rejeitarChavesExtras(solicitacao: SolicitacaoCadastro): void {
  const recebida = registro(solicitacao);
  const permitidas = chavesPermitidas[solicitacao.operacao];

  if (Object.keys(recebida).some((chave) => !permitidas.includes(chave))) {
    throw new Error('Solicitação de cadastro inválida.');
  }
}

function chamadaValidada(solicitacao: SolicitacaoCadastro): ChamadaRpcCadastro {
  rejeitarChavesExtras(solicitacao);
  const definicao = definicoesCadastro[solicitacao.operacao];

  switch (solicitacao.operacao) {
    case 'listarPacientes':
      return {
        ...definicao,
        operacao: solicitacao.operacao,
        entrada: contratosRotas.listarPacientes.entrada.parse(solicitacao.consulta),
        parametros: {},
        cabecalhos: {},
      };
    case 'consultarPaciente':
      return {
        ...definicao,
        operacao: solicitacao.operacao,
        entrada: {},
        parametros: contratosRotas.consultarPaciente.parametros.parse(solicitacao.parametros),
        cabecalhos: {},
      };
    case 'criarPaciente':
      return {
        ...definicao,
        operacao: solicitacao.operacao,
        entrada: contratosRotas.criarPaciente.entrada.parse(solicitacao.corpo),
        parametros: {},
        cabecalhos: contratosRotas.criarPaciente.cabecalhos.parse(solicitacao.cabecalhos),
      };
    case 'atualizarPaciente':
      return {
        ...definicao,
        operacao: solicitacao.operacao,
        entrada: contratosRotas.atualizarPaciente.entrada.parse(solicitacao.corpo),
        parametros: contratosRotas.atualizarPaciente.parametros.parse(solicitacao.parametros),
        cabecalhos: contratosRotas.atualizarPaciente.cabecalhos.parse(solicitacao.cabecalhos),
      };
    case 'criarContato':
      return {
        ...definicao,
        operacao: solicitacao.operacao,
        entrada: contratosRotas.criarContato.entrada.parse(solicitacao.corpo),
        parametros: contratosRotas.criarContato.parametros.parse(solicitacao.parametros),
        cabecalhos: contratosRotas.criarContato.cabecalhos.parse(solicitacao.cabecalhos),
      };
    case 'atualizarContato':
      return {
        ...definicao,
        operacao: solicitacao.operacao,
        entrada: contratosRotas.atualizarContato.entrada.parse(solicitacao.corpo),
        parametros: contratosRotas.atualizarContato.parametros.parse(solicitacao.parametros),
        cabecalhos: contratosRotas.atualizarContato.cabecalhos.parse(solicitacao.cabecalhos),
      };
  }
}

function respostaValidada(
  operacao: SolicitacaoCadastro['operacao'],
  valor: unknown,
): RespostaCadastro {
  const erro = erroRespostaSchema.safeParse(valor);
  if (erro.success) {
    return erro.data;
  }

  switch (operacao) {
    case 'listarPacientes':
      return sucessoRespostaSchema(contratosRotas.listarPacientes.saida).parse(valor);
    case 'consultarPaciente':
      return sucessoRespostaSchema(contratosRotas.consultarPaciente.saida).parse(valor);
    case 'criarPaciente':
      return sucessoRespostaSchema(contratosRotas.criarPaciente.saida).parse(valor);
    case 'atualizarPaciente':
      return sucessoRespostaSchema(contratosRotas.atualizarPaciente.saida).parse(valor);
    case 'criarContato':
      return sucessoRespostaSchema(contratosRotas.criarContato.saida).parse(valor);
    case 'atualizarContato':
      return sucessoRespostaSchema(contratosRotas.atualizarContato.saida).parse(valor);
  }
}

/** Cria o módulo puro; autenticação, RLS, cifra e RPC real permanecem no adapter. */
export function criarModuloCadastro(adaptador: AdaptadorRpcCadastro): ModuloCadastro {
  return {
    async executar(solicitacao) {
      let chamada: ChamadaRpcCadastro;
      try {
        chamada = chamadaValidada(solicitacao);
      } catch {
        // Detalhes de validação podem conter valores recebidos; a borda HTTP
        // futura os converte para o catálogo público sem expô-los aqui.
        throw new Error('Solicitação de cadastro inválida.');
      }
      const resposta = await adaptador.executar(chamada);
      return respostaValidada(solicitacao.operacao, resposta);
    },
  };
}
