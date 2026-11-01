import {
  contratosRotas,
  erroRespostaSchema,
  mensagensErro,
  statusErroHttp,
  sucessoRespostaSchema,
  type CriarPaciente,
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

type Rota = keyof typeof contratosRotas;
type Dados<R extends Rota> = ReturnType<(typeof contratosRotas)[R]['saida']['parse']>;

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
  #accessToken: string | null = null;
  #csrf: string | null = null;
  #seletorSessao: string | null = null;
  #provaSessao: string | null = null;
  #geracaoSessao: number | null = null;
  #usuarioId: string | null = null;
  #geracao = 0;
  #saindo = false;
  #renovacao: Promise<void> | null = null;

  limpar(): void {
    this.#accessToken = null;
    this.#csrf = null;
    this.#seletorSessao = null;
    this.#provaSessao = null;
    this.#geracaoSessao = null;
    this.#usuarioId = null;
    this.#saindo = false;
    this.#renovacao = null;
    this.#geracao += 1;
  }

  async #renovar(): Promise<void> {
    if (this.#renovacao) return this.#renovacao;
    const geracao = this.#geracao;
    const csrf = this.#csrf;
    const seletorSessao = this.#seletorSessao;
    const usuarioId = this.#usuarioId;
    const provaSessao = this.#provaSessao;
    const geracaoSessao = this.#geracaoSessao;
    if (!csrf || !seletorSessao || !usuarioId || !provaSessao || !geracaoSessao || this.#saindo)
      throw new FalhaApi('nao_autenticado', 401);
    const renovacao = (async () => {
      try {
        const entrada = await this.#enviar(
          'renovarSessao',
          {},
          { csrf, seletorSessao, provaSessao, geracaoSessao },
        );
        if (
          entrada.csrf !== csrf ||
          entrada.seletor_sessao !== seletorSessao ||
          entrada.sessao.usuario.id !== usuarioId ||
          entrada.geracao_sessao !== geracaoSessao + 1 ||
          entrada.prova_sessao === provaSessao
        ) {
          throw new FalhaApi('nao_autenticado', 401);
        }
        if (geracao !== this.#geracao) throw new FalhaApi('nao_autenticado', 401);
        this.#accessToken = entrada.access_token;
        this.#provaSessao = entrada.prova_sessao;
        this.#geracaoSessao = entrada.geracao_sessao;
      } catch (erro) {
        if (geracao === this.#geracao) {
          this.limpar();
          throw new FalhaApi('nao_autenticado', 401);
        }
        throw erro;
      }
    })();
    this.#renovacao = renovacao;
    try {
      await renovacao;
    } finally {
      if (this.#renovacao === renovacao) this.#renovacao = null;
    }
  }

  async #consultar<R extends 'sessaoAtual' | 'listarPacientes'>(
    rota: R,
    entrada: unknown = {},
  ): Promise<Dados<R>> {
    const geracao = this.#geracao;
    const token = this.#accessToken;
    const geracaoSessao = this.#geracaoSessao;
    try {
      return await this.#enviar(rota, entrada, { protegido: true });
    } catch (erro) {
      if (
        !(erro instanceof FalhaApi) ||
        erro.status !== 401 ||
        !token ||
        geracao !== this.#geracao ||
        this.#saindo
      )
        throw erro;
      if (token === this.#accessToken && geracaoSessao === this.#geracaoSessao)
        await this.#renovar();
      if (geracao !== this.#geracao) throw new FalhaApi('nao_autenticado', 401);
      return this.#enviar(rota, entrada, { protegido: true });
    }
  }

  async #enviar<R extends Rota>(
    rota: R,
    entrada: unknown = {},
    opcoes: {
      csrf?: string;
      seletorDesafio?: string;
      chave?: string;
      protegido?: boolean;
      seletorSessao?: string;
      provaSessao?: string;
      geracaoSessao?: number;
    } = {},
  ): Promise<Dados<R>> {
    const contrato = contratosRotas[rota];
    const falhaRespostaInvalida = (status: number): FalhaApi => {
      if (opcoes.protegido && contrato.metodo !== 'GET')
        return new FalhaApi('servico_indisponivel', 0, status === 401 || status === 403);
      return new FalhaApi('servico_indisponivel', status);
    };
    const validada = contrato.entrada.safeParse(entrada);
    if (!validada.success) throw new FalhaApi('entrada_invalida', 422);
    const geracao = this.#geracao;
    const geracaoSessao = this.#geracaoSessao;
    const conferirGeracao = () => {
      if (geracao !== this.#geracao) {
        if (opcoes.protegido && contrato.metodo !== 'GET')
          throw new FalhaApi('servico_indisponivel');
        throw new FalhaApi('nao_autenticado', 401);
      }
      if (opcoes.protegido && geracaoSessao !== this.#geracaoSessao) {
        if (contrato.metodo === 'GET') throw new FalhaApi('nao_autenticado', 401);
        throw new FalhaApi('servico_indisponivel');
      }
    };
    const url = new URL(contrato.caminho, window.location.origin);
    const headers = new Headers({ Accept: 'application/json' });
    if (opcoes.protegido) {
      if (!this.#accessToken || !this.#provaSessao || !this.#geracaoSessao || this.#saindo)
        throw new FalhaApi('nao_autenticado', 401);
      headers.set('Authorization', `Bearer ${this.#accessToken}`);
      headers.set('x-ffcm-prova-sessao', this.#provaSessao);
      headers.set('x-ffcm-geracao-sessao', String(this.#geracaoSessao));
    }
    if (opcoes.provaSessao && opcoes.geracaoSessao) {
      headers.set('x-ffcm-prova-sessao', opcoes.provaSessao);
      headers.set('x-ffcm-geracao-sessao', String(opcoes.geracaoSessao));
    }
    if (opcoes.csrf) headers.set('x-csrf', opcoes.csrf);
    if (opcoes.seletorDesafio) headers.set('x-desafio', opcoes.seletorDesafio);
    if (opcoes.seletorSessao) headers.set('x-sessao', opcoes.seletorSessao);
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
    this.limpar();
    const desafio = await this.#enviar('desafioTecnico');
    const entrada = await this.#enviar(
      'entrarTecnico',
      { email, senha },
      { csrf: desafio.csrf, seletorDesafio: desafio.seletor_desafio },
    );
    this.#accessToken = entrada.access_token;
    this.#csrf = entrada.csrf;
    this.#seletorSessao = entrada.seletor_sessao;
    this.#provaSessao = entrada.prova_sessao;
    this.#geracaoSessao = entrada.geracao_sessao;
    this.#usuarioId = entrada.sessao.usuario.id;
    const geracao = this.#geracao;
    try {
      // Perfil/capacidades atuais vêm do servidor, nunca de um JWT decodificado pelo cliente.
      return await this.consultarSessao();
    } catch (erro) {
      if (this.#geracao === geracao) this.limpar();
      throw erro;
    }
  }

  /** O provedor recebe apenas o nonce; desafio, CSRF e credencial ficam em memória. */
  async entrarGoogle(
    obterCredencial: (nonce: string) => Promise<string>,
  ): Promise<Dados<'sessaoAtual'>> {
    this.limpar();
    const geracao = this.#geracao;
    const desafio = await this.#enviar('desafioGoogle');
    let credencial: string;
    try {
      credencial = await obterCredencial(desafio.nonce_hash);
    } catch {
      throw new FalhaApi('servico_indisponivel');
    }
    if (geracao !== this.#geracao) throw new FalhaApi('nao_autenticado', 401);
    const entrada = await this.#enviar(
      'entrarGoogle',
      { desafio_id: desafio.desafio_id, credencial },
      { csrf: desafio.csrf, seletorDesafio: desafio.seletor_desafio },
    );
    this.#accessToken = entrada.access_token;
    this.#csrf = entrada.csrf;
    this.#seletorSessao = entrada.seletor_sessao;
    this.#provaSessao = entrada.prova_sessao;
    this.#geracaoSessao = entrada.geracao_sessao;
    this.#usuarioId = entrada.sessao.usuario.id;
    try {
      return await this.consultarSessao();
    } catch (erro) {
      if (this.#geracao === geracao) this.limpar();
      throw erro;
    }
  }

  consultarSessao(): Promise<Dados<'sessaoAtual'>> {
    return this.#consultar('sessaoAtual');
  }

  listarPacientes(cursor?: string): Promise<Dados<'listarPacientes'>> {
    return this.#consultar('listarPacientes', { limite: 25, ...(cursor ? { cursor } : {}) });
  }

  criarPaciente(entrada: CriarPaciente, chave: string): Promise<Dados<'criarPaciente'>> {
    if (!this.#provaSessao || !this.#geracaoSessao)
      return Promise.reject(new FalhaApi('nao_autenticado', 401));
    const cabecalhos = contratosRotas.criarPaciente.cabecalhos.safeParse({
      'x-chave-idempotencia': chave,
      'x-ffcm-prova-sessao': this.#provaSessao,
      'x-ffcm-geracao-sessao': String(this.#geracaoSessao),
    });
    if (!cabecalhos.success) return Promise.reject(new FalhaApi('entrada_invalida', 422));
    return this.#enviar('criarPaciente', entrada, { chave, protegido: true });
  }

  async sair(): Promise<Dados<'sairSessao'>> {
    if (!this.#csrf || !this.#seletorSessao || !this.#provaSessao || !this.#geracaoSessao)
      throw new FalhaApi('nao_autenticado', 401);
    this.#saindo = true;
    const geracao = this.#geracao;
    const renovacao = this.#renovacao;
    if (renovacao) {
      try {
        await renovacao;
      } catch {
        // Sem confirmação não há prova vigente para afirmar que o servidor revogou.
        throw new FalhaApi('renovacao_incerta');
      }
      if (geracao !== this.#geracao || !this.#saindo) throw new FalhaApi('nao_autenticado', 401);
    }
    this.#accessToken = null;
    this.#geracao += 1;
    // Se a rede falhar, preserva os dados mínimos em memória para tentar encerrar novamente.
    const resultado = await this.#enviar(
      'sairSessao',
      {},
      {
        csrf: this.#csrf,
        seletorSessao: this.#seletorSessao,
        provaSessao: this.#provaSessao,
        geracaoSessao: this.#geracaoSessao,
      },
    );
    this.limpar();
    return resultado;
  }
}
