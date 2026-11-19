/** FR-030/FR-031: guarda de anexos no Google Drive institucional da Francescato.
 *
 * O ENDEREÇO do Google é fixo aqui, de propósito, pelo mesmo critério já aplicado na frente de
 * transcrição: endereço editável pela tela de administração viraria alavanca para apontar a
 * credencial do Vault para um servidor escolhido por quem editou. O que é variável e vem do
 * banco é a PASTA RAIZ (`ffcm.documentos.drive_pasta_raiz`).
 *
 * Sobre compartilhamento (FR-031): este módulo NUNCA chama `permissions.create`. O arquivo
 * nasce dentro da pasta compartilhada institucional e herda as permissões dela. Não conceder
 * nada é a forma mais forte de garantir que nada seja concedido a `anyone` — não há caminho de
 * código que torne um anexo público, nem por engano de parâmetro.
 *
 * A credencial nunca é registrada, devolvida ao navegador ou incluída em mensagem de erro. */

const ENDERECO_TOKEN = 'https://oauth2.googleapis.com/token';
const ENDERECO_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const ENDERECO_ARQUIVOS = 'https://www.googleapis.com/drive/v3/files';
const ESCOPO = 'https://www.googleapis.com/auth/drive';
export const TAMANHO_MAXIMO_DOCUMENTO = 8 * 1024 * 1024;

/** Não inclui causa nem resposta do provedor: a topologia do cofre e o conteúdo do erro
 * remoto não descem ao navegador. */
export class ErroDriveIndisponivel extends Error {
  constructor() {
    super('Guarda de documentos indisponível.');
    this.name = 'ErroDriveIndisponivel';
  }
}

type Credencial = { client_email: string; private_key: string };

function lerCredencial(segredoJson: string): Credencial {
  let bruto: unknown;
  try {
    bruto = JSON.parse(segredoJson);
  } catch {
    throw new ErroDriveIndisponivel();
  }
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto))
    throw new ErroDriveIndisponivel();
  const { client_email: email, private_key: chave } = bruto as Record<string, unknown>;
  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+$/.test(email) ||
    typeof chave !== 'string' ||
    !chave.includes('BEGIN PRIVATE KEY')
  )
    throw new ErroDriveIndisponivel();
  return { client_email: email, private_key: chave };
}

function base64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importarChave(pem: string): Promise<CryptoKey> {
  const corpo = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const binario = atob(corpo);
    bytes = new Uint8Array(new ArrayBuffer(binario.length));
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  } catch {
    throw new ErroDriveIndisponivel();
  }
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      bytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new ErroDriveIndisponivel();
  }
}

/** Troca a credencial de conta de serviço por um token de acesso de vida curta. O token fica
 * só nesta chamada: não é guardado entre requisições, para que revogar a credencial no Google
 * tenha efeito imediato na próxima operação. */
async function obterToken(credencial: Credencial, sinal: AbortSignal): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
  );
  const corpo = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: credencial.client_email,
        scope: ESCOPO,
        aud: ENDERECO_TOKEN,
        iat: agora,
        exp: agora + 300,
      }),
    ),
  );
  const chave = await importarChave(credencial.private_key);
  const assinatura = base64Url(
    new Uint8Array(
      await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        chave,
        new TextEncoder().encode(`${cabecalho}.${corpo}`),
      ),
    ),
  );
  const resposta = await fetch(ENDERECO_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
    signal: sinal,
  });
  if (!resposta.ok) throw new ErroDriveIndisponivel();
  const dados: unknown = await resposta.json();
  const token = (dados as Record<string, unknown> | null)?.access_token;
  if (typeof token !== 'string' || token.length === 0) throw new ErroDriveIndisponivel();
  return token;
}

export type PortaDrive = {
  obter?(fileId: string): Promise<Uint8Array<ArrayBuffer>>;
  enviar(entrada: {
    nome: string;
    tipo: string;
    bytes: Uint8Array;
    pastaRaiz: string;
    pastaPaciente?: string;
    reservarPasta?: (raiz: string, candidata: string) => Promise<{ id: string; marcador: string }>;
  }): Promise<{ file_id: string }>;
  consultarCompartilhamento?(
    fileId: string,
    audiencia: 'equipe' | 'equipe_e_familia',
  ): Promise<'divergente' | 'revisao_necessaria'>;
  remover(fileId: string): Promise<void>;
  conferir(fileId: string): Promise<{ disponivel: boolean }>;
};

/** Adaptador real. Recebe a credencial já lida do Vault por quem chama: este módulo não sabe
 * de onde ela veio e não tem como alcançar o cofre sozinho. */
export function criarPortaDrive(segredoJson: string, sinal: AbortSignal): PortaDrive {
  const credencial = lerCredencial(segredoJson);
  const autenticar = () => obterToken(credencial, sinal);
  return {
    async obter(fileId) {
      const token = await autenticar();
      const resposta = await fetch(
        `${ENDERECO_ARQUIVOS}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        { headers: { authorization: `Bearer ${token}` }, signal: sinal, redirect: 'error' },
      );
      if (!resposta.ok || !resposta.body) throw new ErroDriveIndisponivel();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        while (true) {
          const parte = await leitor.read();
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > TAMANHO_MAXIMO_DOCUMENTO) throw new ErroDriveIndisponivel();
          partes.push(parte.value);
        }
        if (!tamanho) throw new ErroDriveIndisponivel();
        const bytes = new Uint8Array(new ArrayBuffer(tamanho));
        let posicao = 0;
        for (const parte of partes) {
          bytes.set(parte, posicao);
          posicao += parte.byteLength;
        }
        return bytes;
      } catch {
        await leitor.cancel().catch(() => {});
        throw new ErroDriveIndisponivel();
      } finally {
        leitor.releaseLock();
      }
    },
    async enviar({ nome, tipo, bytes, pastaRaiz, pastaPaciente, reservarPasta }) {
      if (typeof pastaRaiz !== 'string' || pastaRaiz.trim().length === 0)
        throw new ErroDriveIndisponivel();
      const token = await autenticar();
      let pastaDestino = pastaRaiz.trim();
      if (pastaPaciente !== undefined) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(pastaPaciente) || !reservarPasta)
          throw new ErroDriveIndisponivel();
        // Google admite ID pré-gerado para folders. Reserva DB única precede criação.
        const gerados = await fetch(
          `${ENDERECO_ARQUIVOS}/generateIds?count=1&space=drive&type=files`,
          {
            headers: { authorization: `Bearer ${token}` },
            signal: sinal,
            redirect: 'error',
          },
        );
        if (!gerados.ok) throw new ErroDriveIndisponivel();
        const ids: unknown = await gerados.json();
        if (
          !ids ||
          typeof ids !== 'object' ||
          !('ids' in ids) ||
          !Array.isArray(ids.ids) ||
          ids.ids.length !== 1 ||
          typeof ids.ids[0] !== 'string' ||
          !/^[A-Za-z0-9_-]{1,256}$/.test(ids.ids[0])
        )
          throw new ErroDriveIndisponivel();
        const reserva = await reservarPasta(pastaRaiz.trim(), ids.ids[0]);
        if (
          !/^[A-Za-z0-9_-]{1,256}$/.test(reserva.id) ||
          !/^[A-Za-z0-9_-]{43}$/.test(reserva.marcador)
        )
          throw new ErroDriveIndisponivel();
        pastaDestino = reserva.id;
        const endereco = `${ENDERECO_ARQUIVOS}/${encodeURIComponent(pastaDestino)}?supportsAllDrives=true&fields=id,mimeType,parents,appProperties,trashed`;
        const consultar = () =>
          fetch(endereco, {
            headers: { authorization: `Bearer ${token}` },
            signal: sinal,
            redirect: 'error',
          });
        let respostaPasta = await consultar();
        if (respostaPasta.status === 404) {
          const criada = await fetch(`${ENDERECO_ARQUIVOS}?supportsAllDrives=true&fields=id`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              id: pastaDestino,
              name: `caso-${reserva.marcador}`,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [pastaRaiz.trim()],
              appProperties: { ffcm_paciente: reserva.marcador },
            }),
            signal: sinal,
            redirect: 'error',
          });
          if (!criada.ok && criada.status !== 409) throw new ErroDriveIndisponivel();
          // Inclui recovery de timeout anterior e 409 concorrente: não adota por nome.
          respostaPasta = await consultar();
        }
        if (!respostaPasta.ok) throw new ErroDriveIndisponivel();
        const pasta: unknown = await respostaPasta.json();
        if (
          !pasta ||
          typeof pasta !== 'object' ||
          !('id' in pasta) ||
          pasta.id !== pastaDestino ||
          !('mimeType' in pasta) ||
          pasta.mimeType !== 'application/vnd.google-apps.folder' ||
          !('parents' in pasta) ||
          !Array.isArray(pasta.parents) ||
          pasta.parents.length !== 1 ||
          pasta.parents[0] !== pastaRaiz.trim() ||
          !('trashed' in pasta) ||
          pasta.trashed !== false ||
          !('appProperties' in pasta) ||
          !pasta.appProperties ||
          typeof pasta.appProperties !== 'object' ||
          !('ffcm_paciente' in pasta.appProperties) ||
          pasta.appProperties.ffcm_paciente !== reserva.marcador
        )
          throw new ErroDriveIndisponivel();
      }
      const limite = `ffcm${crypto.randomUUID().replace(/-/g, '')}`;
      const metadado = JSON.stringify({ name: nome, parents: [pastaDestino] });
      const cabecalho = new TextEncoder().encode(
        `--${limite}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadado}\r\n--${limite}\r\ncontent-type: ${tipo}\r\n\r\n`,
      );
      const rodape = new TextEncoder().encode(`\r\n--${limite}--\r\n`);
      const corpo = new Uint8Array(cabecalho.length + bytes.length + rodape.length);
      corpo.set(cabecalho, 0);
      corpo.set(bytes, cabecalho.length);
      corpo.set(rodape, cabecalho.length + bytes.length);
      const resposta = await fetch(
        `${ENDERECO_UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': `multipart/related; boundary=${limite}`,
          },
          body: corpo,
          signal: sinal,
        },
      );
      if (!resposta.ok) throw new ErroDriveIndisponivel();
      const dados: unknown = await resposta.json();
      const id = (dados as Record<string, unknown> | null)?.id;
      if (typeof id !== 'string' || id.length === 0) throw new ErroDriveIndisponivel();
      return { file_id: id };
    },
    async consultarCompartilhamento(fileId, audiencia) {
      // Uma ACL nominal não prova vínculo ativo ao caso. Sem identidade Google dos
      // destinatários, encaminhar revisão; nunca declarar compatibilidade presumida.
      const token = await autenticar();
      let pagina: string | undefined;
      const paginas = new Set<string>();
      do {
        const url = new URL(`${ENDERECO_ARQUIVOS}/${encodeURIComponent(fileId)}/permissions`);
        url.searchParams.set('supportsAllDrives', 'true');
        url.searchParams.set('fields', 'nextPageToken,permissions(type,deleted)');
        url.searchParams.set('pageSize', '100');
        if (pagina) url.searchParams.set('pageToken', pagina);
        const resposta = await fetch(url, {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
          signal: sinal,
          redirect: 'error',
        });
        if (!resposta.ok) throw new ErroDriveIndisponivel();
        const dados: unknown = await resposta.json();
        if (
          !dados ||
          typeof dados !== 'object' ||
          !('permissions' in dados) ||
          !Array.isArray(dados.permissions)
        )
          throw new ErroDriveIndisponivel();
        for (const permissao of dados.permissions) {
          if (
            !permissao ||
            typeof permissao !== 'object' ||
            !('type' in permissao) ||
            typeof permissao.type !== 'string'
          )
            throw new ErroDriveIndisponivel();
          if (permissao.deleted === true) continue;
          // Nenhuma audiência do produto autoriza acesso público. Domínio inteiro
          // tampouco equivale à equipe vinculada ou à família do caso.
          if (
            permissao.type === 'anyone' ||
            (audiencia === 'equipe' && permissao.type === 'domain')
          )
            return 'divergente';
        }
        const proxima = 'nextPageToken' in dados ? dados.nextPageToken : undefined;
        if (
          proxima !== undefined &&
          (typeof proxima !== 'string' || !proxima || paginas.has(proxima) || paginas.size >= 100)
        )
          throw new ErroDriveIndisponivel();
        pagina = proxima as string | undefined;
        if (pagina) paginas.add(pagina);
      } while (pagina);
      return 'revisao_necessaria';
    },
    async remover(fileId) {
      const token = await autenticar();
      const resposta = await fetch(
        `${ENDERECO_ARQUIVOS}/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
        { method: 'DELETE', headers: { authorization: `Bearer ${token}` }, signal: sinal },
      );
      // 404 conta como removido: o objetivo é que o arquivo não exista mais.
      if (!resposta.ok && resposta.status !== 404) throw new ErroDriveIndisponivel();
    },
    async conferir(fileId) {
      const token = await autenticar();
      const resposta = await fetch(
        `${ENDERECO_ARQUIVOS}/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,trashed`,
        { headers: { authorization: `Bearer ${token}` }, signal: sinal },
      );
      if (resposta.status === 404) return { disponivel: false };
      if (!resposta.ok) throw new ErroDriveIndisponivel();
      const dados: unknown = await resposta.json();
      return { disponivel: (dados as Record<string, unknown> | null)?.trashed !== true };
    },
  };
}
