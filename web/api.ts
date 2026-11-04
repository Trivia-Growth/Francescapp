import {
  contratosRotas,
  contratosBarreiraHttp,
  contratosBarreiraContatoHttp,
  erroRespostaSchema,
  mensagensErro,
  statusErroHttp,
  sucessoRespostaSchema,
  sessaoNativaSchema,
  entrarTecnicoSchema,
  chaveIdempotenciaSchema,
  pacienteAdministrativoSchema,
  type novoContatoSchema,
  type AtualizarPaciente,
  type CriarPaciente,
  type SalvarAnamnese,
} from '../packages/contracts/src/index.js';

export class FalhaApi extends Error {
  constructor(
    readonly codigo: string,
    readonly status = 0,
    readonly exigeReautenticacao = false,
  ) {
    super('Não foi possível concluir a solicitação.');
  }
}

const rotas = {
  sessaoAtual: { ...contratosRotas.sessaoAtual, saida: sessaoNativaSchema },
  entrarTecnico: {
    metodo: 'POST',
    caminho: '/api/auth/tecnica',
    entrada: entrarTecnicoSchema,
    saida: sessaoNativaSchema,
  },
  listarPacientes: contratosRotas.listarPacientes,
  consultarPaciente: { ...contratosRotas.consultarPaciente, saida: pacienteAdministrativoSchema },
  atualizarPaciente: contratosRotas.atualizarPaciente,
  criarContato: contratosRotas.criarContato,
  consultarAnamnese: contratosRotas.consultarAnamnese,
  salvarAnamnese: contratosRotas.salvarAnamnese,
  criarPaciente: contratosRotas.criarPaciente,
  sairSessao: contratosRotas.sairSessao,
  consultarBarreiraContato: {
    ...contratosBarreiraContatoHttp.consultar,
    saida: contratosBarreiraContatoHttp.consultar.saida.shape.dados,
  },
  reservarBarreiraContato: {
    ...contratosBarreiraContatoHttp.reservar,
    saida: contratosBarreiraContatoHttp.reservar.saida.shape.dados,
  },
  encerrarBarreiraContato: {
    ...contratosBarreiraContatoHttp.encerrar,
    saida: contratosBarreiraContatoHttp.encerrar.saida.shape.dados,
  },
  reconhecerBarreiraContato: {
    ...contratosBarreiraContatoHttp.reconhecer,
    saida: contratosBarreiraContatoHttp.reconhecer.saida.shape.dados,
  },
  consultarBarreira: {
    ...contratosBarreiraHttp.consultar,
    saida: contratosBarreiraHttp.consultar.saida.shape.dados,
  },
  reservarBarreira: {
    ...contratosBarreiraHttp.reservar,
    saida: contratosBarreiraHttp.reservar.saida.shape.dados,
  },
  encerrarBarreira: {
    ...contratosBarreiraHttp.encerrar,
    saida: contratosBarreiraHttp.encerrar.saida.shape.dados,
  },
  reconhecerBarreira: {
    ...contratosBarreiraHttp.reconhecer,
    saida: contratosBarreiraHttp.reconhecer.saida.shape.dados,
  },
} as const;
type Rota = keyof typeof rotas;
type Dados<R extends Rota> = ReturnType<(typeof rotas)[R]['saida']['parse']>;

const limiteResposta = 1_048_576;

async function lerJsonLimitado(resposta: Response, sinal: AbortSignal): Promise<unknown> {
  if (!resposta.body) throw new Error();
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  let abortar!: () => void;
  const expiracao = new Promise<never>((_, rejeitar) => {
    abortar = () => rejeitar(new Error());
    sinal.addEventListener('abort', abortar, { once: true });
  });
  try {
    if (sinal.aborted) throw new Error();
    while (true) {
      const parte = await Promise.race([leitor.read(), expiracao]);
      if (sinal.aborted) throw new Error();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > limiteResposta) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (erro) {
    void leitor.cancel().catch(() => undefined);
    throw erro;
  } finally {
    sinal.removeEventListener('abort', abortar);
    leitor.releaseLock();
  }
}

export function mensagemFalha(erro: unknown): string {
  if (erro instanceof FalhaApi && Object.hasOwn(mensagensErro, erro.codigo)) {
    return mensagensErro[erro.codigo as keyof typeof mensagensErro];
  }
  return 'Serviço indisponível. Tente novamente em alguns instantes.';
}

export function exigeNovoAcesso(erro: unknown): boolean {
  return (
    erro instanceof FalhaApi &&
    (erro.exigeReautenticacao || erro.status === 401 || erro.status === 403)
  );
}

export function resultadoIncerto(erro: unknown): boolean {
  return (
    !(erro instanceof FalhaApi) ||
    erro.status === 0 ||
    erro.status === 408 ||
    erro.status === 429 ||
    erro.status >= 500
  );
}

/** Uma instância por página. Credenciais e respostas nunca entram em armazenamento ou logs. */
export class ClienteFFCM {
  #sessionId: string | null = null;
  #usuarioId: string | null = null;
  // Contador de respostas da interface; não é credencial nem geração de sessão.
  #revisao = 0;
  #tentativaEntrada = 0;
  #saindo = false;
  #vinculosPaciente = new Map<string, { pacienteId: string; sessionId: string }>();
  #vinculosContato = new Map<string, { pacienteId: string; sessionId: string }>();
  #vinculosAnamnese = new Map<string, { pacienteId: string; sessionId: string }>();

  limpar(): void {
    this.#sessionId = null;
    this.#usuarioId = null;
    this.#saindo = false;
    this.#revisao += 1;
  }

  async #enviar<R extends Rota>(
    rota: R,
    entrada: unknown = {},
    opcoes: {
      chave?: string;
      protegido?: boolean;
      encerramento?: boolean;
      pacienteId?: string;
      fluxoEntrada?: string;
    } = {},
  ): Promise<Dados<R>> {
    const contrato = rotas[rota];
    const falhaRespostaInvalida = (status: number): FalhaApi => {
      if (opcoes.protegido && contrato.metodo !== 'GET')
        return new FalhaApi('servico_indisponivel', 0, status === 401 || status === 403);
      return new FalhaApi('servico_indisponivel', status);
    };
    const validada = contrato.entrada.safeParse(entrada);
    if (!validada.success) throw new FalhaApi('entrada_invalida', 422);
    const revisao = this.#revisao;
    const sessionId = this.#sessionId;
    const conferirGeracao = () => {
      if (revisao !== this.#revisao || (opcoes.protegido && sessionId !== this.#sessionId)) {
        if (opcoes.protegido && contrato.metodo !== 'GET')
          throw new FalhaApi('servico_indisponivel');
        throw new FalhaApi('nao_autenticado', 401);
      }
    };
    let caminho: string = contrato.caminho;
    if (
      rota === 'consultarAnamnese' ||
      rota === 'salvarAnamnese' ||
      rota === 'consultarPaciente' ||
      rota === 'atualizarPaciente' ||
      rota === 'criarContato'
    ) {
      const parametros = contratosRotas.consultarAnamnese.parametros.safeParse({
        paciente_id: opcoes.pacienteId,
      });
      if (!parametros.success) throw new FalhaApi('entrada_invalida', 422);
      caminho = caminho.replace(':paciente_id', encodeURIComponent(parametros.data.paciente_id));
    }
    const url = new URL(caminho, window.location.origin);
    const headers = new Headers({ Accept: 'application/json' });
    if (opcoes.protegido) {
      if (!sessionId || (this.#saindo && !opcoes.encerramento))
        throw new FalhaApi('nao_autenticado', 401);
      // Compara o alvo com o cookie atual no servidor; nunca concede autorização.
      headers.set('x-sessao', sessionId);
    }
    if (rota === 'entrarTecnico') {
      if (!opcoes.fluxoEntrada || !/^[A-Za-z0-9_-]{22}$/.test(opcoes.fluxoEntrada))
        throw new FalhaApi('nao_autenticado', 401);
      headers.set('x-fluxo', opcoes.fluxoEntrada);
    } else {
      let fluxo: string | null;
      let modo: string | null;
      try {
        modo = sessionStorage.getItem('modo-acesso');
        fluxo = sessionStorage.getItem(
          modo === 'tecnica' || modo === 'saindo-tecnica' ? 'fluxo-tecnico' : 'fluxo-google',
        );
      } catch {
        throw new FalhaApi('nao_autenticado', 401);
      }
      const google = modo === 'google' || (opcoes.encerramento && modo === 'saindo-google');
      const tecnica = modo === 'tecnica' || (opcoes.encerramento && modo === 'saindo-tecnica');
      if (!google && !tecnica) throw new FalhaApi('nao_autenticado', 401);
      if (!fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo)) throw new FalhaApi('nao_autenticado', 401);
      headers.set('x-fluxo', fluxo);
    }
    if (opcoes.chave) headers.set('x-chave-idempotencia', opcoes.chave);
    let corpo: string | undefined;
    if (contrato.metodo === 'GET') {
      for (const [campo, valor] of Object.entries(validada.data)) {
        if (valor !== undefined) url.searchParams.set(campo, String(valor));
      }
    } else {
      headers.set('Content-Type', 'application/json');
      corpo = JSON.stringify(validada.data);
    }
    let resposta: Response;
    let envelope: unknown;
    const sinal = AbortSignal.timeout(20_000);
    try {
      resposta = await fetch(url, {
        method: contrato.metodo,
        headers,
        body: corpo,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: sinal,
      });
    } catch {
      throw new FalhaApi('servico_indisponivel');
    }
    try {
      conferirGeracao();
    } catch (erro) {
      if (resposta.body) void resposta.body.cancel().catch(() => undefined);
      throw erro;
    }
    // 202 confirma apenas aceitação, não conclusão da mutação.
    if (opcoes.protegido && contrato.metodo !== 'GET' && resposta.status === 202) {
      if (resposta.body) void resposta.body.cancel().catch(() => undefined);
      throw new FalhaApi('servico_indisponivel');
    }
    if (!resposta.headers.get('content-type')?.includes('application/json')) {
      if (resposta.body) void resposta.body.cancel().catch(() => undefined);
      throw falhaRespostaInvalida(resposta.ok ? 0 : resposta.status);
    }
    try {
      envelope = await lerJsonLimitado(resposta, sinal);
    } catch {
      conferirGeracao();
      throw falhaRespostaInvalida(resposta.ok ? 0 : resposta.status);
    }
    // Resposta atrasada não pode restaurar uma sessão ou tela já descartada.
    conferirGeracao();
    if (!resposta.ok) {
      const falha = erroRespostaSchema.safeParse(envelope);
      if (!falha.success) throw falhaRespostaInvalida(resposta.status);
      if (
        opcoes.protegido &&
        contrato.metodo !== 'GET' &&
        statusErroHttp[falha.data.erro.codigo] !== resposta.status
      )
        throw falhaRespostaInvalida(resposta.status);
      throw new FalhaApi(falha.data.erro.codigo, resposta.status);
    }
    const resultado = sucessoRespostaSchema(contrato.saida).safeParse(envelope);
    if (!resultado.success) throw new FalhaApi('servico_indisponivel');
    return resultado.data.dados as Dados<R>;
  }

  async entrar(email: string, senha: string): Promise<Dados<'sessaoAtual'>> {
    const tentativa = ++this.#tentativaEntrada;
    this.limpar();
    try {
      sessionStorage.setItem('modo-acesso', 'bloqueada');
      sessionStorage.removeItem('fluxo-google');
      sessionStorage.removeItem('sessao-tecnica');
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const fluxo = btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      sessionStorage.setItem('fluxo-tecnico', fluxo);
      if (sessionStorage.getItem('fluxo-tecnico') !== fluxo) throw new Error();
      const entrada = await this.#enviar(
        'entrarTecnico',
        { email, senha },
        { fluxoEntrada: fluxo },
      );
      sessionStorage.setItem('modo-acesso', 'tecnica');
      // Consulta independente confirma concessão e perfil atuais; não confia só no login.
      return await this.#consultarSessao(entrada);
    } catch (erro) {
      try {
        if (tentativa === this.#tentativaEntrada)
          sessionStorage.setItem('modo-acesso', 'bloqueada');
      } catch {
        /* falha fechada */
      }
      throw erro;
    }
  }

  async consultarSessao(): Promise<Dados<'sessaoAtual'>> {
    return this.#consultarSessao();
  }

  async #consultarSessao(entrada?: Dados<'sessaoAtual'>): Promise<Dados<'sessaoAtual'>> {
    if (this.#saindo) throw new FalhaApi('nao_autenticado', 401);
    const revisao = this.#revisao;
    const anterior = this.#sessionId;
    let modo: string | null;
    let esperada: string | null;
    try {
      modo = sessionStorage.getItem('modo-acesso');
      esperada = sessionStorage.getItem('sessao-tecnica');
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if (modo === 'tecnica' && !entrada && !esperada) throw new FalhaApi('nao_autenticado', 401);
    let atual: Dados<'sessaoAtual'>;
    try {
      atual = await this.#enviar('sessaoAtual');
    } catch (erro) {
      if (
        erro instanceof FalhaApi &&
        (erro.status === 401 || erro.status === 403) &&
        revisao === this.#revisao &&
        !this.#saindo
      )
        this.limpar();
      throw erro;
    }
    if (revisao !== this.#revisao) throw new FalhaApi('nao_autenticado', 401);
    if (
      !atual.usuario.ativo ||
      (modo === 'tecnica' && !entrada && atual.session_id !== esperada) ||
      (entrada &&
        (atual.session_id !== entrada.session_id || atual.usuario.id !== entrada.usuario.id)) ||
      (anterior && (atual.session_id !== anterior || atual.usuario.id !== this.#usuarioId))
    ) {
      this.limpar();
      throw new FalhaApi('nao_autenticado', 401);
    }
    if (modo === 'tecnica' && entrada) {
      try {
        sessionStorage.setItem('sessao-tecnica', atual.session_id);
        if (sessionStorage.getItem('sessao-tecnica') !== atual.session_id) throw new Error();
      } catch {
        this.limpar();
        throw new FalhaApi('nao_autenticado', 401);
      }
    }
    this.#sessionId = atual.session_id;
    this.#usuarioId = atual.usuario.id;
    return atual;
  }

  listarPacientes(cursor?: string): Promise<Dados<'listarPacientes'>> {
    return this.#enviar(
      'listarPacientes',
      { limite: 25, ...(cursor ? { cursor } : {}) },
      { protegido: true },
    );
  }

  consultarPaciente(pacienteId: string): Promise<Dados<'consultarPaciente'>> {
    return this.#enviar('consultarPaciente', {}, { protegido: true, pacienteId });
  }

  atualizarPaciente(
    pacienteId: string,
    entrada: AtualizarPaciente,
    chave: string,
  ): Promise<Dados<'atualizarPaciente'>> {
    if (!chaveIdempotenciaSchema.safeParse(chave).success)
      return Promise.reject(new FalhaApi('entrada_invalida', 422));
    if (!this.#sessionId) return Promise.reject(new FalhaApi('nao_autenticado', 401));
    const vinculo = this.#vinculosPaciente.get(chave);
    if (vinculo && (vinculo.pacienteId !== pacienteId || vinculo.sessionId !== this.#sessionId))
      return Promise.reject(new FalhaApi('nao_autenticado', 401));
    this.#vinculosPaciente.set(chave, { pacienteId, sessionId: this.#sessionId });
    return this.#enviar('atualizarPaciente', entrada, { protegido: true, pacienteId, chave });
  }

  criarContato(
    pacienteId: string,
    entrada: ReturnType<typeof novoContatoSchema.parse>,
    chave: string,
    reserva: { reserva_id: string; geracao_reserva: number },
  ): Promise<Dados<'criarContato'>> {
    if (!chaveIdempotenciaSchema.safeParse(chave).success)
      return Promise.reject(new FalhaApi('entrada_invalida', 422));
    if (!this.#sessionId) return Promise.reject(new FalhaApi('nao_autenticado', 401));
    const vinculo = this.#vinculosContato.get(chave);
    if (vinculo && (vinculo.pacienteId !== pacienteId || vinculo.sessionId !== this.#sessionId))
      return Promise.reject(new FalhaApi('nao_autenticado', 401));
    this.#vinculosContato.set(chave, { pacienteId, sessionId: this.#sessionId });
    return this.#enviar(
      'criarContato',
      { entrada, ...reserva },
      { protegido: true, pacienteId, chave },
    );
  }

  consultarAnamnese(pacienteId: string): Promise<Dados<'consultarAnamnese'>> {
    return this.#enviar('consultarAnamnese', {}, { protegido: true, pacienteId });
  }

  salvarAnamnese(
    pacienteId: string,
    entrada: SalvarAnamnese,
    chave: string,
  ): Promise<Dados<'salvarAnamnese'>> {
    if (!chaveIdempotenciaSchema.safeParse(chave).success)
      return Promise.reject(new FalhaApi('entrada_invalida', 422));
    if (!this.#sessionId) return Promise.reject(new FalhaApi('nao_autenticado', 401));
    const vinculo = this.#vinculosAnamnese.get(chave);
    if (vinculo && (vinculo.pacienteId !== pacienteId || vinculo.sessionId !== this.#sessionId))
      return Promise.reject(new FalhaApi('nao_autenticado', 401));
    this.#vinculosAnamnese.set(chave, { pacienteId, sessionId: this.#sessionId });
    return this.#enviar('salvarAnamnese', entrada, { protegido: true, pacienteId, chave });
  }

  criarPaciente(
    entrada: CriarPaciente,
    chave: string,
    reserva: { reserva_id: string; geracao_reserva: number },
  ): Promise<Dados<'criarPaciente'>> {
    if (!chaveIdempotenciaSchema.safeParse(chave).success)
      return Promise.reject(new FalhaApi('entrada_invalida', 422));
    return this.#enviar('criarPaciente', { entrada, ...reserva }, { chave, protegido: true });
  }

  consultarBarreira(): Promise<Dados<'consultarBarreira'>> {
    return this.#enviar('consultarBarreira', {}, { protegido: true });
  }

  reservarBarreira(entrada: { epoca: number; reserva_id: string }): Promise<
    Dados<'reservarBarreira'>
  > {
    return this.#enviar('reservarBarreira', entrada, { protegido: true });
  }

  encerrarBarreira(entrada: {
    epoca: number;
    reserva_id: string | null;
    comando_id: string;
  }): Promise<Dados<'encerrarBarreira'>> {
    return this.#enviar('encerrarBarreira', entrada, { protegido: true });
  }

  reconhecerBarreira(entrada: { comando_id: string }): Promise<Dados<'reconhecerBarreira'>> {
    return this.#enviar('reconhecerBarreira', entrada, { protegido: true });
  }

  identidadeAtual(): { usuario_id: string; session_id: string } | null {
    return this.#usuarioId && this.#sessionId && !this.#saindo
      ? { usuario_id: this.#usuarioId, session_id: this.#sessionId }
      : null;
  }

  consultarBarreiraContato() {
    return this.#enviar('consultarBarreiraContato', {}, { protegido: true });
  }
  reservarBarreiraContato(entrada: { epoca: number; reserva_id: string; paciente_id: string }) {
    return this.#enviar('reservarBarreiraContato', entrada, { protegido: true });
  }
  encerrarBarreiraContato(entrada: {
    epoca: number;
    reserva_id: string | null;
    comando_id: string;
  }) {
    return this.#enviar('encerrarBarreiraContato', entrada, { protegido: true });
  }
  reconhecerBarreiraContato(entrada: { comando_id: string }) {
    return this.#enviar('reconhecerBarreiraContato', entrada, { protegido: true });
  }

  async sair(): Promise<Dados<'sairSessao'>> {
    if (!this.#sessionId) throw new FalhaApi('nao_autenticado', 401);
    try {
      const modo = sessionStorage.getItem('modo-acesso');
      if (modo === 'google' || modo === 'tecnica')
        sessionStorage.setItem('modo-acesso', `saindo-${modo}`);
      else if (modo !== 'saindo-google' && modo !== 'saindo-tecnica') throw new Error();
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    this.#saindo = true;
    this.#revisao += 1;
    // Rede incerta preserva somente o alvo para nova tentativa, sem liberar consultas.
    const resultado = await this.#enviar('sairSessao', {}, { protegido: true, encerramento: true });
    try {
      sessionStorage.setItem('modo-acesso', 'bloqueada');
      sessionStorage.removeItem('fluxo-google');
      sessionStorage.removeItem('sessao-tecnica');
      sessionStorage.removeItem('fluxo-tecnico');
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    this.limpar();
    return resultado;
  }
}
