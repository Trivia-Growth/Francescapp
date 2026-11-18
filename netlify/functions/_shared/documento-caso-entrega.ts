import { operarDocumentoCasoNativo } from './documento-caso-nativo.ts';
import { TAMANHO_MAXIMO_DOCUMENTO } from './google-drive.ts';

/** Duas leituras atestadas e auditadas no banco. A segunda confere audiência/vínculo
 * após I/O; uma versão diferente exige nova tentativa, nunca entrega bytes antigos. */
export async function entregarDocumentoCaso(
  request: Request,
  comando: { paciente_id: string; documento_id: string },
  portas: Parameters<typeof operarDocumentoCasoNativo>[2],
) {
  const erro = (codigo: 'sem_permissao' | 'servico_indisponivel') => ({
    ok: false as const,
    erro: { codigo },
    request_id: crypto.randomUUID(),
  });
  const leitura = { operacao: 'ler' as const, ...comando };
  const inicial = await operarDocumentoCasoNativo(request, leitura, portas);
  if (!inicial.ok) return inicial;
  const documento = inicial.dados.documentos.find(
    (item) => item.documento_id.toLowerCase() === comando.documento_id.toLowerCase(),
  );
  if (!documento || documento.estado !== 'disponivel') return erro('sem_permissao');
  if (!portas.drive?.porta.obter) return erro('servico_indisponivel');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await portas.drive.porta.obter(documento.drive_file_id);
    if (!bytes.byteLength || bytes.byteLength > TAMANHO_MAXIMO_DOCUMENTO || request.signal.aborted)
      return erro('servico_indisponivel');
  } catch {
    return erro('servico_indisponivel');
  }
  const final = await operarDocumentoCasoNativo(request, leitura, portas);
  if (!final.ok) return final;
  const atual = final.dados.documentos.find((item) => item.documento_id === documento.documento_id);
  if (
    request.signal.aborted ||
    !atual ||
    atual.estado !== 'disponivel' ||
    atual.registro_id !== documento.registro_id ||
    atual.versao !== documento.versao ||
    atual.drive_file_id !== documento.drive_file_id
  )
    return erro('sem_permissao');
  return {
    ok: true as const,
    dados: { arquivo: { bytes, nome: atual.nome_visivel } },
    request_id: final.request_id,
  };
}
