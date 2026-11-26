// Ambientes a partir do GitHub: cada publicação registrada (ex.: pela Vercel) ou o site informado no repositório.

export const TIPOS_AMBIENTE = ["Produção", "Staging", "Desenvolvimento", "QA"] as const;

export interface SugestaoAmbiente {
  chave: string;
  nome: string;
  tipo: string;
  url: string;
  versao: string;
  publicadoEm: string;
}

/** Aceita "site.com.br" ou "https://…"; devolve vazio se não for um endereço web. */
export function normalizarUrl(texto: string): string {
  const t = texto.trim();
  if (!t) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? u.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

const tipoDe = (ambiente: string) =>
  /^prod/i.test(ambiente) ? "Produção" : /stag|homolog/i.test(ambiente) ? "Staging" : /\bqa\b|test/i.test(ambiente) ? "QA" : "Desenvolvimento";

/** Um ambiente por publicação nomeada do repositório (as de pré-visualização ficam de fora). */
export function sugestoesDoRepo(repo: any): SugestaoAmbiente[] {
  const site = normalizarUrl(repo?.homepageUrl ?? "");
  const porAmbiente = new Map<string, any[]>();
  for (const d of repo?.deployments?.nodes ?? []) {
    if (!d?.environment || /preview/i.test(d.environment)) continue;
    porAmbiente.set(d.environment, [...(porAmbiente.get(d.environment) ?? []), d]);
  }
  const producoes = Array.from(porAmbiente.keys()).filter((a) => tipoDe(a) === "Produção");
  const lista: SugestaoAmbiente[] = Array.from(porAmbiente, ([ambiente, ds]) => {
    // A lista vem da mais nova para a mais antiga: vale a última publicação que deu certo.
    const boa = ds.find((d) => ["SUCCESS", "INACTIVE"].includes(d.latestStatus?.state)) ?? null;
    // O site do repositório é o endereço estável; o da publicação muda a cada versão.
    const ehPrincipal = tipoDe(ambiente) === "Produção" && (producoes.length === 1 || ambiente === "Production" || ambiente.endsWith(` ${repo.name}`));
    const url = (ehPrincipal && site) || normalizarUrl(boa?.latestStatus?.environmentUrl ?? "");
    const extra = ambiente.replace(/^production\s*[–-]?\s*/i, "");
    const nome = tipoDe(ambiente) === "Produção" ? (extra && extra !== repo.name ? `${repo.name} (${extra})` : repo.name) : `${repo.name} (${ambiente})`;
    return { chave: `${repo.nameWithOwner}:${ambiente}`, nome, tipo: tipoDe(ambiente), url, versao: boa?.commitOid?.slice(0, 7) ?? "", publicadoEm: boa?.createdAt ?? "" };
  }).filter((s) => s.url);
  if (!porAmbiente.size && site) lista.push({ chave: `${repo.nameWithOwner}:site`, nome: repo.name, tipo: "Produção", url: site, versao: "", publicadoEm: "" });
  return lista;
}

const CONSULTA = `query($cursor: String) {
  viewer {
    repositories(first: 40, after: $cursor, orderBy: {field: PUSHED_AT, direction: DESC},
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
      pageInfo { hasNextPage endCursor }
      nodes { name nameWithOwner homepageUrl isArchived
        deployments(first: 20, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { environment createdAt commitOid latestStatus { state environmentUrl } } } }
    }
  }
}`;

export async function buscarSugestoes(token: string, fetchFn: typeof fetch = fetch): Promise<SugestaoAmbiente[]> {
  const sugestoes: SugestaoAmbiente[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < 8; pagina++) {
    const res = await fetchFn("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: CONSULTA, variables: { cursor } }),
    });
    if (res.status === 401) throw new Error("O GitHub recusou o token. Reconecte em Dev > Repositórios.");
    const corpo: any = await res.json().catch(() => null);
    const lista = corpo?.data?.viewer?.repositories;
    if (!res.ok || !lista) throw new Error(`O GitHub não devolveu as publicações${corpo?.errors?.[0]?.message ? `: ${corpo.errors[0].message}` : ` (${res.status}).`}`);
    for (const r of lista.nodes ?? []) if (r && !r.isArchived) sugestoes.push(...sugestoesDoRepo(r));
    if (!lista.pageInfo?.hasNextPage) break;
    cursor = lista.pageInfo.endCursor;
  }
  return sugestoes;
}
