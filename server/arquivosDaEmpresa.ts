// Onde ficam os arquivos de uma empresa no armazenamento. O backup copia e a exclusão apaga exatamente estes lugares.

export const BUCKET_BACKUP = "backups-empresas";
const BUCKET_FOTOS = "avatars";                  // fotos ficam na pasta do usuário
const BUCKET_CHECKOUT = "checkout-comprovantes"; // comprovantes ficam na pasta do pedido

export interface Pasta { bucket: string; prefixo: string }
export interface Arquivo { bucket: string; caminho: string; /** registrado no banco, mas pode já não existir */ opcional?: boolean }

async function todas(consulta: () => any): Promise<any[]> {
  const linhas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta().range(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data || []));
    if ((data || []).length < 1000) return linhas;
  }
}

export async function locaisDosArquivos(db: any, tenantId: string): Promise<{ pastas: Pasta[]; soltos: Arquivo[] }> {
  const { data, error } = await db.storage.listBuckets();
  if (error) throw new Error(error.message);
  const buckets: string[] = (data || []).map((b: any) => b.id).filter((b: string) => b !== BUCKET_BACKUP);
  const pastas: Pasta[] = buckets.map((bucket) => ({ bucket, prefixo: tenantId }));
  if (buckets.includes(BUCKET_FOTOS)) {
    const usuarios = await todas(() => db.from("users").select("id").eq("tenant_id", tenantId).order("id"));
    pastas.push(...usuarios.map((u) => ({ bucket: BUCKET_FOTOS, prefixo: String(u.id) })));
  }
  const soltos: Arquivo[] = [];
  if (buckets.includes(BUCKET_CHECKOUT)) {
    const pedidos = await todas(() => db.from("checkout_orders").select("id, comprovante_path").eq("tenant_id", tenantId).order("id"));
    for (const p of pedidos) {
      const caminho = String(p.comprovante_path || "");
      if (caminho && !caminho.startsWith(`${tenantId}/`)) soltos.push({ bucket: BUCKET_CHECKOUT, caminho, opcional: true });
    }
  }
  return { pastas, soltos };
}

/** Todos os arquivos dentro de uma pasta, descendo pelas subpastas. */
export async function arquivosDaPasta(db: any, pasta: Pasta): Promise<Arquivo[]> {
  const achados: Arquivo[] = [], fila = [pasta.prefixo];
  while (fila.length) {
    const prefixo = fila.shift()!;
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db.storage.from(pasta.bucket).list(prefixo, { limit: 1000, offset: de });
      if (error) throw new Error(`${pasta.bucket}/${prefixo}: ${error.message}`);
      for (const o of data || []) {
        if (o.id) achados.push({ bucket: pasta.bucket, caminho: `${prefixo}/${o.name}` });
        else fila.push(`${prefixo}/${o.name}`);
      }
      if ((data || []).length < 1000) break;
    }
  }
  return achados;
}
