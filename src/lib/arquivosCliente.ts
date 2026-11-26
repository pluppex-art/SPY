/**
 * Banco de arquivos por cliente. Os arquivos ficam no armazenamento privado (bucket `finance`, cuja regra já separa por
 * empresa), em `<empresa>/clientes/<cliente>/<categoria>/<quando>__<nome>`. A lista da tela é a própria pasta: não há
 * tabela à parte para ficar fora de sincronia, e o backup da empresa leva tudo junto.
 */
export const BUCKET_ARQUIVOS = "finance";
/** Limite configurado no armazenamento. */
export const LIMITE_ARQUIVO = 25 * 1024 * 1024;
export const VALIDADE_LINK_DIAS = 7;

export const CATEGORIAS = [
  { id: "documentos", nome: "Documentos" },
  { id: "contratos", nome: "Contratos" },
  { id: "midias", nome: "Artes e mídias" },
  { id: "fiscal", nome: "Fiscal e financeiro" },
  { id: "relatorios", nome: "Relatórios" },
  { id: "outros", nome: "Outros" },
] as const;

export type CategoriaArquivo = (typeof CATEGORIAS)[number]["id"];

export interface ArquivoCliente {
  caminho: string;
  nome: string;
  categoria: CategoriaArquivo;
  tamanho: number;
  tipo: string;
  criadoEm: string;
}

export const pastaDaCategoria = (tenantId: string, clienteId: string, categoria: CategoriaArquivo) =>
  `${tenantId}/clientes/${clienteId}/${categoria}`;

/** O armazenamento recusa acentos e vários símbolos no nome: troca por equivalentes simples, mantendo a extensão. */
export function nomeSeguro(nome: string): string {
  const limpo = nome.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  const ponto = limpo.lastIndexOf(".");
  const ext = ponto > 0 && limpo.length - ponto <= 10 ? limpo.slice(ponto) : "";
  const base = limpo.slice(0, limpo.length - ext.length).slice(0, 120 - ext.length).trim();
  return `${base || "arquivo"}${ext}`;
}

export const chaveDoArquivo = (nome: string, quando = Date.now()) => `${quando}__${nomeSeguro(nome)}`;
export const nomeExibido = (chave: string) => chave.replace(/^\d{10,}__/, "");

/** Programas e atalhos executáveis não entram no banco de arquivos. */
const BLOQUEADAS = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|sh|app|apk|lnk|reg|html?|svg)$/i;

export function motivoRecusa(arquivo: { name: string; size: number }): string | null {
  if (BLOQUEADAS.test(arquivo.name.trim())) return "esse tipo de arquivo não é aceito (envie compactado em .zip se precisar)";
  if (arquivo.size <= 0) return "o arquivo está vazio";
  if (arquivo.size > LIMITE_ARQUIVO) return "passa de 25 MB";
  return null;
}

/** Abre na própria aba só o que o navegador mostra com segurança; o resto é baixado. */
export const abreNoNavegador = (nome: string) => /\.(pdf|png|jpe?g|webp|gif|mp4|webm|mp3)$/i.test(nome);

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${(mb / 1024).toFixed(2).replace(".", ",")} GB`;
}
