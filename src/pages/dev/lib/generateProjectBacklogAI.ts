import { apiFetch } from '../../../lib/apiClient';
import type { Priority } from '../hooks/useDevSprints';

export type GeneratedBacklogTask = {
  title: string;
  type: 'feature' | 'bug' | 'chore' | 'refactor';
  priority: Priority;
  points: number;
  tags: string[];
};

export type GeneratedBacklog = {
  tasks: GeneratedBacklogTask[];
};

function safeJsonParse<T>(raw: string): T {
  const text = raw
    .trim()
    // remove possible markdown code fences
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(text) as T;
}

function buildPrompt(input: { productName: string; description: string }) {
  return `Você é o SPY Dev Planner.

Objetivo: gerar um backlog de desenvolvimento (Kanban) para um projeto.

Você DEVE adaptar as tasks ao TIPO do produto (ex.: site institucional, app mobile, agente de IA, API, dashboard, CRM, etc.).

REGRAS ABSOLUTAS:
1) Retorne APENAS JSON válido, sem markdown.
2) Não invente requisitos que não estejam relacionados ao nome/descrição.
3) Se faltarem detalhes, você pode inferir apenas o que for obviamente necessário para o tipo de produto, explicando no TÍTULO/Tags.
4) Para cada task, escolha: type ∈ {"feature","bug","chore","refactor"}.
5) Para priority use apenas: "crítica" | "alta" | "média" | "baixa".
6) points: número inteiro entre 1 e 13 (maior quando for mais complexo).
7) tags: lista curta (2 a 5 strings) com palavras-chave.
8) Cada task deve ser BEM EXPLICATIVA no campo "title" (como uma instrução clara do que fazer), incluindo:
   - o objetivo da task
   - a entrega final (ex.: endpoint X pronto, página Y criada, tool Z integrada)
   - o critério de qualidade (ex.: testes, validação, observabilidade)
9) Cada task deve estar mapeada a: (a) objetivos do produto, (b) fluxo principal, (c) qualidade (testes/observabilidade) e (d) entregas por etapa.
10) Inclua sempre ao menos:
    - 1 task de planejamento/levantamento (chore)
    - 1 task de setup/infra (chore)
    - 1 task de implementação do núcleo (feature)
    - 1 task de testes/validação (chore ou refactor)
    - 1 task de documentação/handoff (chore)

ADAPTAÇÃO POR TIPO (exemplos — use como guia):

- Site institucional: SEO básico, páginas (home/sobre/contato), formulários (se houver), performance (LCP), analytics, responsividade, sitemap/robots.
- Agente de IA: integração do provedor, prompt/guardrails, memória/contexto, ferramentas (tools) e fluxos, avaliação/segurança (filtro de respostas), testes de cenários.
- API: endpoints, autenticação/autorização (se houver), validação de payloads, logs/metrics, testes de integração.
- App mobile: autenticação, navegação, telas principais, armazenamento offline (se fizer sentido), testes manuais/e2e.
- Dashboard/BI: queries agregadas, filtros, performance, exportação (se houver), testes de consistência.

FORMATO DE SAÍDA:
{
  "tasks": [
    {
      "title": "...",
      "type": "feature|bug|chore|refactor",
      "priority": "crítica|alta|média|baixa",
      "points": 1,
      "tags": ["...","..."]
    }
  ]
}

NOME:
${input.productName}

DESCRIÇÃO:
${input.description}
`;
}

// A chamada à IA acontece no servidor (POST /api/ai/generate-json): nenhuma chave de IA fica no navegador.
async function callServer(prompt: string) {
  const res = await apiFetch('/api/ai/generate-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha ao gerar o backlog (HTTP ${res.status}).`);
  return safeJsonParse<GeneratedBacklog>(String(data.raw ?? ''));
}

export async function generateProjectBacklogAI(
  input: { productName: string; description: string }
): Promise<GeneratedBacklog> {
  return callServer(buildPrompt(input));
}
