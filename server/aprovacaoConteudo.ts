/**
 * Aprovação de conteúdo pelo cliente — rotas públicas, sem login. O acesso é só pelo token do link
 * (aleatório, guardado em marketing_content.extras.aprovacao). A página recebe apenas o que o cliente precisa ver:
 * nada de valor, responsável ou notas internas.
 */
import type { Express, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerAprovacao, linkVencido, responder, tokenValido, urlSegura, versaoDoConteudo, type RespostaAprovacao } from "../src/lib/aprovacaoConteudo.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUNAS = "id,tenant_id,title,description,platform,publish_date,extras";

const limpo = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);

const dia = (v: unknown) => {
  const d = v ? new Date(String(v)) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
};

/** Versão do conteúdo de uma linha do banco (mesma conta feita na tela do Marketing). */
export const versaoDaLinha = (row: any) => versaoDoConteudo({
  titulo: row.title, descricao: row.description, canal: row.platform || "Instagram", data: dia(row.publish_date),
  formato: row.extras?.formato, roteiro: row.extras?.script, hashtags: row.extras?.hashtags,
  links: row.extras?.refs, anexos: row.extras?.anexos,
});

/** O que sai para a página pública. */
export function itemPublico(row: any) {
  const a = lerAprovacao(row.extras?.aprovacao)!;
  return {
    id: row.id,
    titulo: String(row.title || ""),
    descricao: String(row.description || ""),
    canal: String(row.platform || ""),
    formato: String(row.extras?.formato || ""),
    data: dia(row.publish_date),
    roteiro: String(row.extras?.script || ""),
    hashtags: (Array.isArray(row.extras?.hashtags) ? row.extras.hashtags : []).map((h: unknown) => String(h)),
    links: (Array.isArray(row.extras?.refs) ? row.extras.refs : []).map((r: any) => r?.url).filter(urlSegura),
    anexos: (Array.isArray(row.extras?.anexos) ? row.extras.anexos : []).filter((x: any) => urlSegura(x?.url)).map((x: any) => ({ url: x.url, nome: String(x.nome || "arquivo") })),
    status: a.status,
    resposta: a.resposta ?? null,
    versao: versaoDaLinha(row),
    /** O conteúdo mudou depois que o cliente respondeu: vale pedir para olhar de novo. */
    alterado: !!a.versaoRespondida && a.status !== "aguardando" && a.versaoRespondida !== versaoDaLinha(row),
  };
}

async function linhasDoToken(db: SupabaseClient, token: string): Promise<any[]> {
  const { data, error } = await db.from("marketing_content").select(COLUNAS)
    .eq("extras->aprovacao->>token", token).is("deleted_at", null).limit(300);
  if (error) throw new Error(error.message);
  const validas = (data ?? []).filter((r: any) => {
    const a = lerAprovacao(r.extras?.aprovacao);
    return a && a.token === token && !linkVencido(a);
  });
  // Um link pertence a uma empresa só.
  return validas.filter((r: any) => r.tenant_id === validas[0].tenant_id);
}

async function avisarEquipe(db: SupabaseClient, row: any, r: RespostaAprovacao) {
  const { data: usuarios } = await db.from("users").select("id,name,active,is_tenant_admin").eq("tenant_id", row.tenant_id);
  const ativos = (usuarios ?? []).filter((u: any) => u.active !== false);
  const nome = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const responsavel = nome(row.extras?.responsavel);
  let alvos = ativos.filter((u: any) => u.is_tenant_admin || (responsavel && nome(u.name) === responsavel));
  if (!alvos.length) alvos = ativos;
  if (!alvos.length) return;
  const aprovado = r.decisao === "aprovado";
  await db.from("notifications").insert(alvos.map((u: any) => ({
    tenant_id: row.tenant_id,
    user_id: u.id,
    title: aprovado ? "Conteúdo aprovado pelo cliente" : "Cliente pediu ajustes no conteúdo",
    description: `${r.nome} ${aprovado ? "aprovou" : "pediu ajustes em"} "${row.title}"${r.comentario ? `: ${r.comentario.slice(0, 200)}` : "."}`,
    type: aprovado ? "success" : "warning",
    link_url: "/app/marketing/conteudo",
  })));
}

export function registrarAprovacaoConteudo(app: Express, db: SupabaseClient | null, limites?: { ler: RequestHandler; responder: RequestHandler }) {
  const ler = limites?.ler ?? rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
  const gravar = limites?.responder ?? rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false });
  const naoEncontrado = (res: Response) => res.status(404).json({ error: "Link não encontrado ou vencido. Peça um novo link à agência." });

  app.get("/api/public-aprovacao/:token", ler, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!db) return res.status(503).json({ error: "Servidor indisponível." });
    const token = req.params.token;
    if (!tokenValido(token)) return naoEncontrado(res);
    try {
      const linhas = await linhasDoToken(db, token);
      if (!linhas.length) return naoEncontrado(res);
      const tenantId = linhas[0].tenant_id;
      const clientes = new Set(linhas.map((r) => r.extras?.clienteId || ""));
      const clienteId = clientes.size === 1 ? [...clientes][0] : "";
      const [{ data: tenant }, { data: cliente }] = await Promise.all([
        db.from("tenants").select("name,primary_color").eq("id", tenantId).maybeSingle(),
        clienteId
          ? db.from("empresa_filiais").select("nome").eq("id", clienteId).eq("tenant_id", tenantId).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);
      const itens = linhas.map(itemPublico).sort((a, b) => (a.data || "9999").localeCompare(b.data || "9999"));
      return res.json({ empresa: tenant?.name || "", cor: tenant?.primary_color || null, cliente: cliente?.nome || "", itens });
    } catch (e: any) {
      console.error("[public-aprovacao] leitura:", e?.message);
      return res.status(500).json({ error: "Não foi possível carregar os conteúdos." });
    }
  });

  app.post("/api/public-aprovacao/:token/:itemId", gravar, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!db) return res.status(503).json({ error: "Servidor indisponível." });
    const { token, itemId } = req.params;
    if (!tokenValido(token) || !UUID.test(itemId)) return naoEncontrado(res);
    const decisao = req.body?.decisao;
    if (decisao !== "aprovado" && decisao !== "ajustes") return res.status(400).json({ error: "Escolha aprovar ou pedir ajuste." });
    const nome = limpo(req.body?.nome, 80);
    if (nome.length < 2) return res.status(400).json({ error: "Informe seu nome." });
    const comentario = limpo(req.body?.comentario, 2000);
    if (decisao === "ajustes" && comentario.length < 3) return res.status(400).json({ error: "Escreva o que precisa mudar." });
    try {
      const row = (await linhasDoToken(db, token)).find((r) => r.id === itemId);
      if (!row) return naoEncontrado(res);
      const versao = versaoDaLinha(row);
      if (String(req.body?.versao || "") !== versao) {
        return res.status(409).json({ error: "Este conteúdo foi atualizado. Confira a nova versão antes de responder.", item: itemPublico(row) });
      }
      const resposta: RespostaAprovacao = { decisao, comentario, nome, em: new Date().toISOString() };
      const extras = { ...row.extras, aprovacao: responder(lerAprovacao(row.extras.aprovacao)!, resposta, versao) };
      const { data: gravada, error } = await db.from("marketing_content")
        .update({ extras, updated_at: resposta.em })
        .eq("id", itemId).eq("tenant_id", row.tenant_id).eq("extras->aprovacao->>token", token)
        .select(COLUNAS).maybeSingle();
      if (error) throw new Error(error.message);
      if (!gravada) return naoEncontrado(res);
      await avisarEquipe(db, gravada, resposta).catch((e: any) => console.error("[public-aprovacao] aviso à equipe:", e?.message));
      return res.json({ ok: true, item: itemPublico(gravada) });
    } catch (e: any) {
      console.error("[public-aprovacao] resposta:", e?.message);
      return res.status(500).json({ error: "Não foi possível registrar sua resposta. Tente de novo." });
    }
  });
}
