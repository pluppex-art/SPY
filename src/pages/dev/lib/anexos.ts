import { supabase } from '../../../lib/supabase';

export const BUCKET_ANEXOS = 'dev-anexos';
export const TAMANHO_MAXIMO = 15 * 1024 * 1024;

export interface Anexo {
  /** Caminho no bucket privado (<empresa>/<tarefa>/arquivo). */
  path?: string;
  /** Endereço externo, quando o anexo não está no bucket (ex.: enviado por uma automação). */
  url?: string;
  nome: string;
  tipo?: string;
  tamanho?: number;
}

export const ehImagem = (a: Anexo) => (a.tipo || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.path || a.url || a.nome || '');

/** Só http(s): um link "javascript:" gravado por fora nunca vira link clicável. */
export const urlSegura = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : undefined);

const nomeSeguro = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'arquivo';

/** Envia os arquivos e devolve os anexos gravados e os nomes que falharam. */
export async function enviarAnexos(tenantId: string, taskId: string | number, arquivos: File[]): Promise<{ anexos: Anexo[]; falhas: string[] }> {
  const anexos: Anexo[] = [], falhas: string[] = [];
  for (const [i, f] of arquivos.entries()) {
    if (!supabase || f.size > TAMANHO_MAXIMO) { falhas.push(f.size > TAMANHO_MAXIMO ? `${f.name} (passa de 15 MB)` : f.name); continue; }
    const path = `${tenantId}/${taskId}/${Date.now()}-${i}-${nomeSeguro(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET_ANEXOS).upload(path, f, { contentType: f.type || 'application/octet-stream' });
    if (error) { falhas.push(f.name); continue; }
    anexos.push({ path, nome: f.name, tipo: f.type, tamanho: f.size });
  }
  return { anexos, falhas };
}

export async function apagarAnexo(a: Anexo) {
  if (a.path && supabase) await supabase.storage.from(BUCKET_ANEXOS).remove([a.path]);
}

/** Links temporários (1 hora) para os arquivos do bucket privado: caminho → URL. */
export async function linksDosAnexos(paths: string[]): Promise<Record<string, string>> {
  if (!supabase || paths.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data || []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** Imagens coladas (Ctrl/Cmd+V) viram arquivos. */
export function arquivosColados(e: { clipboardData: DataTransfer | null }): File[] {
  return Array.from(e.clipboardData?.files || []).map((f, i) =>
    f.name && f.name !== 'image.png' ? f : new File([f], `print-${Date.now()}-${i}.${(f.type.split('/')[1] || 'png')}`, { type: f.type }));
}
