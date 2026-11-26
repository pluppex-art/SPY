// Busca os repositórios da conta conectada pela API GraphQL do GitHub: uma consulta por página já traz
// linguagens, branches, PRs/issues abertos e os últimos commits (pela REST seriam várias chamadas por repositório).

export interface Linguagem { nome: string; cor: string; bytes: number }

export interface RepoGitHub {
  id: string;
  nome: string;
  dono: string;
  descricao: string;
  url: string;
  privado: boolean;
  arquivado: boolean;
  fork: boolean;
  atualizadoEm: string | null;
  tamanhoKb: number;
  estrelas: number;
  forks: number;
  linguagem: string;
  linguagens: Linguagem[];
  branches: number;
  prsAbertos: number;
  issuesAbertas: number;
  branchPrincipal: string;
  ultimoCommit: { mensagem: string; autor: string; em: string } | null;
  /** Autores dos últimos 10 commits da branch principal (não é a lista completa de contribuidores). */
  autoresRecentes: string[];
}

export interface ResultadoGitHub { repos: RepoGitHub[]; avisos: string[] }

const SEM_COR = "#64748B";
export const MAX_PAGINAS = 15;

export const CONSULTA = `query($cursor: String, $tamanho: Int!) {
  viewer {
    repositories(first: $tamanho, after: $cursor, orderBy: {field: PUSHED_AT, direction: DESC},
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name url isPrivate isArchived isFork description pushedAt diskUsage stargazerCount forkCount
        owner { login }
        primaryLanguage { name color }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } }
        refs(refPrefix: "refs/heads/") { totalCount }
        pullRequests(states: OPEN) { totalCount }
        issues(states: OPEN) { totalCount }
        defaultBranchRef { name target { ... on Commit { history(first: 10) { nodes { messageHeadline committedDate author { name user { login } } } } } } }
      }
    }
  }
}`;

export function repoDoGitHub(n: any): RepoGitHub {
  const commits: any[] = n?.defaultBranchRef?.target?.history?.nodes?.filter(Boolean) ?? [];
  const autor = (c: any): string => c?.author?.user?.login || c?.author?.name || "";
  return {
    id: String(n.id),
    nome: n.name,
    dono: n.owner?.login ?? "",
    descricao: n.description ?? "",
    url: n.url,
    privado: !!n.isPrivate,
    arquivado: !!n.isArchived,
    fork: !!n.isFork,
    atualizadoEm: n.pushedAt ?? null,
    tamanhoKb: n.diskUsage ?? 0,
    estrelas: n.stargazerCount ?? 0,
    forks: n.forkCount ?? 0,
    linguagem: n.primaryLanguage?.name ?? "",
    linguagens: (n.languages?.edges ?? []).filter(Boolean).map((e: any) => ({ nome: e.node.name, cor: e.node.color || SEM_COR, bytes: e.size ?? 0 })),
    branches: n.refs?.totalCount ?? 0,
    prsAbertos: n.pullRequests?.totalCount ?? 0,
    issuesAbertas: n.issues?.totalCount ?? 0,
    branchPrincipal: n.defaultBranchRef?.name ?? "",
    ultimoCommit: commits[0] ? { mensagem: commits[0].messageHeadline ?? "", autor: autor(commits[0]), em: commits[0].committedDate } : null,
    autoresRecentes: Array.from(new Set(commits.map(autor).filter(Boolean))),
  };
}

/** Soma o código por linguagem e devolve da maior para a menor, com a fatia (%) de cada uma. */
export function somarLinguagens(listas: Linguagem[][]): (Linguagem & { pct: number })[] {
  const soma = new Map<string, Linguagem>();
  for (const l of listas.flat()) soma.set(l.nome, { ...l, bytes: (soma.get(l.nome)?.bytes ?? 0) + l.bytes });
  const total = Array.from(soma.values()).reduce((s, l) => s + l.bytes, 0);
  return Array.from(soma.values()).sort((a, b) => b.bytes - a.bytes).map((l) => ({ ...l, pct: total ? (l.bytes / total) * 100 : 0 }));
}

/** Traz todos os repositórios que o token enxerga. Erro vira mensagem em português; falha parcial vira aviso. */
export async function buscarRepositorios(token: string, fetchFn: typeof fetch = fetch): Promise<ResultadoGitHub> {
  const repos: RepoGitHub[] = [];
  const avisos = new Set<string>();
  let cursor: string | null = null;
  let tamanho = 40;

  for (let pagina = 0; pagina < MAX_PAGINAS; ) {
    const res = await fetchFn("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: CONSULTA, variables: { cursor, tamanho } }),
    });
    if (res.status === 401) throw new Error("O GitHub recusou o token (expirado ou revogado). Desconecte e conecte com um token novo.");
    // Consulta pesada demais (muitos commits): tenta de novo com páginas menores.
    if ((res.status === 502 || res.status === 504) && tamanho > 10) { tamanho = 10; continue; }
    const corpo: any = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`O GitHub respondeu ${res.status}${corpo?.message ? `: ${corpo.message}` : ""}.`);

    const erros: string[] = (corpo?.errors ?? []).map((e: any) => String(e?.message ?? "")).filter(Boolean);
    const lista = corpo?.data?.viewer?.repositories;
    if (!lista) {
      if (tamanho > 10 && erros.some((m) => /timeout|something went wrong/i.test(m))) { tamanho = 10; continue; }
      throw new Error(`O GitHub não devolveu os repositórios${erros[0] ? `: ${erros[0]}` : "."}`);
    }
    erros.slice(0, 3).forEach((m) => avisos.add(m));
    repos.push(...(lista.nodes ?? []).filter(Boolean).map(repoDoGitHub));

    const escopos = res.headers.get("x-oauth-scopes"); // só tokens clássicos informam
    if (pagina === 0 && escopos !== null && !escopos.split(",").some((e) => e.trim() === "repo")) {
      avisos.add("O token não tem o escopo “repo”: repositórios privados não aparecem.");
    }

    pagina++;
    if (!lista.pageInfo?.hasNextPage) return { repos, avisos: Array.from(avisos) };
    cursor = lista.pageInfo.endCursor;
  }
  avisos.add(`Mostrando os ${repos.length} repositórios atualizados mais recentemente.`);
  return { repos, avisos: Array.from(avisos) };
}
