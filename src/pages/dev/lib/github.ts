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

// ── Detalhes de um repositório ("o que é o projeto") ─────────────────────────

export const CONSULTA_DETALHES = `query($id: ID!) {
  node(id: $id) {
    ... on Repository {
      createdAt homepageUrl
      licenseInfo { name }
      repositoryTopics(first: 20) { nodes { topic { name } } }
      pacote: object(expression: "HEAD:package.json") { ... on Blob { text } }
      raiz: object(expression: "HEAD:") { ... on Tree { entries { name } } }
      refs(refPrefix: "refs/heads/", first: 30) { nodes { name } }
      pullRequests(states: OPEN, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title url updatedAt author { login } } }
      issues(states: OPEN, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title url updatedAt author { login } } }
      defaultBranchRef { target { ... on Commit { history(first: 15) { totalCount nodes { messageHeadline committedDate url author { name user { login } } } } } } }
    }
  }
}`;

export interface ItemAberto { numero: number; titulo: string; url: string; autor: string; em: string }
export interface Commit { mensagem: string; url: string; autor: string; em: string }
export interface DetalhesRepo {
  criadoEm: string | null;
  site: string | null;
  licenca: string | null;
  topicos: string[];
  tecnologias: string[];
  branches: string[];
  prs: ItemAberto[];
  issues: ItemAberto[];
  commits: Commit[];
  totalCommits: number;
  readme: string;
}

const PACOTES: Record<string, string> = {
  next: "Next.js", react: "React", "react-native": "React Native", expo: "Expo", vue: "Vue", nuxt: "Nuxt", svelte: "Svelte", astro: "Astro",
  "@angular/core": "Angular", vite: "Vite", electron: "Electron", express: "Express", fastify: "Fastify", "@nestjs/core": "NestJS",
  typescript: "TypeScript", tailwindcss: "Tailwind CSS", "@supabase/supabase-js": "Supabase", firebase: "Firebase", prisma: "Prisma",
  "@prisma/client": "Prisma", mongoose: "MongoDB", pg: "PostgreSQL", redis: "Redis", ioredis: "Redis", stripe: "Stripe", openai: "OpenAI",
  "@anthropic-ai/sdk": "Anthropic", "@google/genai": "Google Gemini",
};
const ARQUIVOS: Record<string, string> = {
  Dockerfile: "Docker", "docker-compose.yml": "Docker", "vercel.json": "Vercel", "requirements.txt": "Python", "pyproject.toml": "Python",
  "composer.json": "PHP", "go.mod": "Go", "Cargo.toml": "Rust", "pubspec.yaml": "Flutter", "pom.xml": "Java", Gemfile: "Ruby",
};

/** Do que o projeto é feito, pelas dependências do package.json e pelos arquivos da raiz. */
export function tecnologias(pacoteJson: string | null | undefined, arquivos: string[]): string[] {
  let deps: string[] = [];
  try {
    const p = JSON.parse(pacoteJson || "{}");
    deps = Object.keys({ ...p?.dependencies, ...p?.devDependencies });
  } catch { /* package.json inválido: fica só o que os arquivos mostram */ }
  return Array.from(new Set([...deps.map((d) => PACOTES[d]), ...arquivos.map((a) => ARQUIVOS[a])].filter(Boolean))).sort();
}

export type Bloco = { tipo: "titulo" | "texto" | "item" | "codigo"; texto: string };

/** README em blocos simples de texto. Sem HTML, imagens nem selos: o conteúdo é de terceiros e vira só texto na tela. */
export function blocosDoReadme(md: string): Bloco[] {
  const limpar = (s: string) => s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/(\*\*|__|`)/g, "")
    .trim();
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [], codigo: string[] | null = null;
  const fechar = () => {
    const texto = limpar(paragrafo.join(" "));
    if (texto) blocos.push({ tipo: "texto", texto });
    paragrafo = [];
  };
  for (const linha of md.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(linha)) {
      if (codigo) { if (codigo.length) blocos.push({ tipo: "codigo", texto: codigo.join("\n") }); codigo = null; }
      else { fechar(); codigo = []; }
      continue;
    }
    if (codigo) { codigo.push(linha); continue; }
    const titulo = linha.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    const item = linha.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    if (titulo || item) {
      fechar();
      const texto = limpar((titulo ?? item)![1]);
      if (texto) blocos.push({ tipo: titulo ? "titulo" : "item", texto });
    } else if (!linha.trim() || /^\s*([-=*_]\s*){3,}$/.test(linha)) fechar();
    else paragrafo.push(linha.trim());
  }
  fechar();
  if (codigo?.length) blocos.push({ tipo: "codigo", texto: codigo.join("\n") });
  return blocos;
}

/** O que é o projeto: a descrição do GitHub; se faltar ou for curta demais, junta o primeiro parágrafo de verdade do README. */
export function resumoDoProjeto(descricao: string, readme: string): string {
  const curta = descricao.trim();
  if (curta.length >= 60) return curta;
  const p = blocosDoReadme(readme).find((b) => b.tipo === "texto" && b.texto.length >= 30);
  return [curta, p?.texto.slice(0, 600)].filter(Boolean).join("\n\n");
}

export function detalhesDoGitHub(n: any, readme: string): DetalhesRepo {
  const abertos = (c: any): ItemAberto[] => (c?.nodes ?? []).filter(Boolean).map((x: any) => ({ numero: x.number, titulo: x.title, url: x.url, autor: x.author?.login ?? "", em: x.updatedAt }));
  const historico = n?.defaultBranchRef?.target?.history;
  return {
    criadoEm: n?.createdAt ?? null,
    site: /^https?:\/\//i.test(n?.homepageUrl ?? "") ? n.homepageUrl : null,
    licenca: n?.licenseInfo?.name ?? null,
    topicos: (n?.repositoryTopics?.nodes ?? []).map((t: any) => t?.topic?.name).filter(Boolean),
    tecnologias: tecnologias(n?.pacote?.text, (n?.raiz?.entries ?? []).map((e: any) => e.name)),
    branches: (n?.refs?.nodes ?? []).map((b: any) => b?.name).filter(Boolean),
    prs: abertos(n?.pullRequests),
    issues: abertos(n?.issues),
    commits: (historico?.nodes ?? []).filter(Boolean).map((c: any) => ({ mensagem: c.messageHeadline ?? "", url: c.url, autor: c.author?.user?.login || c.author?.name || "", em: c.committedDate })),
    totalCommits: historico?.totalCount ?? 0,
    readme,
  };
}

export async function buscarDetalhes(token: string, id: string, dono: string, nome: string, fetchFn: typeof fetch = fetch): Promise<DetalhesRepo> {
  const auth = { Authorization: `Bearer ${token}` };
  const [res, resReadme] = await Promise.all([
    fetchFn("https://api.github.com/graphql", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ query: CONSULTA_DETALHES, variables: { id } }) }),
    // A REST acha o README com qualquer nome (README.md, readme.rst, em docs/…). 404 = não tem.
    fetchFn(`https://api.github.com/repos/${encodeURIComponent(dono)}/${encodeURIComponent(nome)}/readme`, { headers: { ...auth, Accept: "application/vnd.github.raw+json" } }),
  ]);
  const corpo: any = await res.json().catch(() => null);
  if (!res.ok || !corpo?.data?.node) {
    throw new Error(`O GitHub não devolveu os detalhes${corpo?.errors?.[0]?.message ? `: ${corpo.errors[0].message}` : ` (${res.status}).`}`);
  }
  return detalhesDoGitHub(corpo.data.node, resReadme.ok ? await resReadme.text() : "");
}
