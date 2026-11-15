/**
 * Escrita na Max Data (MaxAPI Go): cadastrar/alterar cliente, alterar produto, criar ajuste de estoque.
 *
 * Regras de segurança:
 *  - desligado por padrão: só roda se a conexão do tenant tem escritaHabilitada = "Sim";
 *  - só administrador/gestor do tenant (ou master) grava;
 *  - a chave da Max Data fica no servidor (nunca vai ao navegador);
 *  - alteração = lê o registro atual na Max Data, troca só os campos pedidos e reenvia (a API substitui o
 *    registro inteiro: mandar só o campo alterado apagaria o resto, e o `estoque` do produto não pode ser
 *    sobrescrito com valor velho);
 *  - ajuste de estoque nasce PENDENTE: quem conclui é uma pessoa dentro da Max Data (reversível, ao contrário
 *    de um ajuste já concluído);
 *  - depois de gravar na Max Data, o espelho local (maxdata_clientes / maxdata_produtos) é atualizado.
 */
import type { Express } from "express";
import { connFromConfig, maxdataGet, maxdataSend, MaxDataError, type MaxDataConn } from "./maxdataClient.js";
import { mapCliente, mapProduto } from "./maxdataSync.js";

type Deps = {
  requireUser: any;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  supabaseService: any;
  assertSafeHttpUrl: (url: string) => Promise<unknown>;
  limiter: any;
};

// Campos aceitos pelo PUT /product/{id} e pelo POST/PUT /client da coleção MaxAPI Go v2.0.
const CAMPOS_PRODUTO = ["CSOSN", "aplicacao", "balanca", "baseCalc", "cestId", "classeId", "codCST2", "codCst1", "codigoOriginal", "desativado", "descPdv", "descontoMaximo", "descontoMaximoAtacado", "descricao", "estoque", "fabricanteId", "fornecedorId", "fracionado", "geraArquivoBalanca", "grupoId", "localizador", "multiplo", "multiploUn", "naoContEstoque", "ncmId", "prateleira", "promocaoDia", "qtdAtacado", "qtdComEntrada", "reclassificacao", "subGrupoId", "tipo", "tipoReclassificacao", "tipoSped", "unComercialId", "unId", "unTributariaId", "usaEcommerce", "valorCusto", "valorVenda"];
const CAMPOS_CLIENTE = ["aliqDescAutomatico", "celular", "cpfCnpj", "dataNasc", "descAutomatico", "email", "empId", "enderecos", "fantasia", "id", "nome", "obs", "obsVendedor", "pgto_bloqueados", "produtoTablePrecoPrefId", "rgInscEstadual", "telefone", "tipo", "tipoCadastro", "tipoVenda", "ultimaCompra", "vendedorPreferencialId"];

const pick = (src: any, keys: string[]) => Object.fromEntries(keys.filter((k) => src?.[k] !== undefined).map((k) => [k, src[k]]));
const um = (b: any) => (Array.isArray(b) ? b[0] : b?.docs?.[0] ?? b);
const digitos = (v: any) => String(v ?? "").replace(/\D/g, "");
const str = (v: any, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const FONTE = (which: string) => `maxdata:${which}`;
const ehPapelAdmin = (role: any) => /admin|gestor|gerente|diretor|dono|propriet/i.test(String(role || ""));

export function registerMaxdataWriteRoutes(app: Express, d: Deps) {
  const guard = [d.requireUser, d.limiter];

  /** Conexão com permissão de escrita; devolve null (e já respondeu) se algo impede. */
  async function carregar(req: any, res: any, tenantId: string, which: "notas" | "estoque"): Promise<MaxDataConn | null> {
    const { data: eu } = await req.supabase.from("users").select("role, is_master").eq("id", req.user.id).maybeSingle();
    if (!(eu?.is_master || ehPapelAdmin(eu?.role))) { res.status(403).json({ error: "Só administradores podem gravar na Max Data." }); return null; }
    const key = which === "estoque" ? "integracoes_maxdata_estoque" : "integracoes_maxdata";
    const { data } = await req.supabase.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", key).maybeSingle();
    if (data?.value?.escritaHabilitada !== "Sim") {
      res.status(403).json({ code: "escrita_desativada", error: "A gravação na Max Data está desligada. Ative em Configurações → Integrações → Max Data → \"Gravar na Max Data\"." });
      return null;
    }
    const parsed = connFromConfig(data.value || {});
    if ("error" in parsed) { res.status(409).json({ error: parsed.error }); return null; }
    try { await d.assertSafeHttpUrl(parsed.conn.baseUrl); } catch (e: any) { res.status(400).json({ error: `URL da API não permitida: ${e?.message || "inválida"}` }); return null; }
    return parsed.conn;
  }
  const whichDe = (v: any): "notas" | "estoque" => (v === "notas" ? "notas" : "estoque");
  const erroHttp = (e: any) => (e instanceof MaxDataError ? (e.status && e.status >= 400 && e.status < 500 ? 422 : 502) : 500);
  const log = (acao: string, tenantId: string, extra: Record<string, unknown>) => console.log(`[maxdata-write] ${acao}`, JSON.stringify({ tenantId, ...extra }));

  // Está liberado para este tenant? (a tela usa para mostrar ou esconder os botões de gravar)
  app.get("/api/integrations/maxdata/escrita", ...guard, async (req: any, res: any) => {
    const tenantId = await d.resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const { data: eu } = await req.supabase.from("users").select("role, is_master").eq("id", req.user.id).maybeSingle();
    const pode = !!(eu?.is_master || ehPapelAdmin(eu?.role));
    const { data } = await req.supabase.from("app_settings").select("key, value").eq("tenant_id", tenantId).in("key", ["integracoes_maxdata", "integracoes_maxdata_estoque"]);
    const ligada = (data ?? []).some((r: any) => r.value?.escritaHabilitada === "Sim");
    return res.json({ habilitada: pode && ligada });
  });

  // ── Teste de gravação SEM efeito: lê um cliente e reenvia exatamente o mesmo registro ──
  app.post("/api/integrations/maxdata/escrita/testar", ...guard, async (req: any, res: any) => {
    const tenantId = await d.resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const conn = await carregar(req, res, tenantId, whichDe(req.body?.which));
    if (!conn) return;
    try {
      const lista = await maxdataGet<any>(conn, "/client?limit=1&page=1");
      const primeiro = um(lista);
      if (!primeiro?.id) return res.status(409).json({ error: "Não há nenhum cliente na Max Data para usar no teste." });
      const atual = um(await maxdataGet<any>(conn, `/client/${primeiro.id}`));
      await maxdataSend(conn, "PUT", `/client/${primeiro.id}`, pick(atual, CAMPOS_CLIENTE));
      log("teste_gravacao", tenantId, { user: req.user.id });
      return res.json({ ok: true, mensagem: "Gravação aceita: a Max Data recebeu a alteração (idêntica ao que já existia, nada mudou)." });
    } catch (e: any) {
      const m = e?.message || "";
      const dica = e instanceof MaxDataError && (e.status === 403 || e.status === 405)
        ? " A chave provavelmente não tem permissão de escrita, ou o repasse de IP está bloqueando POST/PUT."
        : e instanceof MaxDataError && !e.status ? " Se a leitura funciona, o repasse de IP pode estar bloqueando POST/PUT." : "";
      return res.status(erroHttp(e)).json({ error: `${m}${dica}` });
    }
  });

  // ── Cliente: cadastrar ──
  app.post("/api/integrations/maxdata/clientes", ...guard, async (req: any, res: any) => {
    const tenantId = await d.resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const which = whichDe(req.body?.which);
    const conn = await carregar(req, res, tenantId, which);
    if (!conn) return;
    const c = req.body?.cliente || {};
    const nome = str(c.nome, 120);
    if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });
    const doc = digitos(c.documento);
    if (doc && ![11, 14].includes(doc.length)) return res.status(400).json({ error: "CPF/CNPJ inválido." });
    try {
      // Evita duplicar: documento já cadastrado na Max Data vira erro claro, não um segundo cadastro.
      if (doc) {
        const existente = await maxdataGet<any>(conn, `/client/cpfcnpj/${doc}`).catch(() => null);
        if (um(existente)?.id) return res.status(409).json({ error: `Já existe cliente com este CPF/CNPJ na Max Data (${um(existente).nome || "id " + um(existente).id}).` });
      }
      const payload: any = {
        empId: conn.empId, nome, fantasia: str(c.fantasia, 120) || nome, cpfCnpj: doc,
        tipo: doc.length === 14 ? "juridica" : "fisica", tipoCadastro: "cliente",
        celular: digitos(c.telefone), email: str(c.email, 120),
        enderecos: [{ cidade: str(c.cidade, 80), uf: str(c.estado, 2).toUpperCase() }],
      };
      const resp = await maxdataSend<any>(conn, "POST", "/client", payload);
      let criado = um(resp);
      if (!criado?.id && doc) criado = um(await maxdataGet<any>(conn, `/client/cpfcnpj/${doc}`).catch(() => null)); // a API pode não devolver o registro
      if (!criado?.id) return res.status(202).json({ ok: true, aviso: "Cadastrado na Max Data; a próxima sincronização traz o registro para cá." });
      let local: any = null;
      if (d.supabaseService) {
        const { data } = await d.supabaseService.from("maxdata_clientes").upsert(mapCliente(criado, tenantId, FONTE(which)), { onConflict: "tenant_id,externo_sistema,externo_id" }).select("*").maybeSingle();
        local = data;
      }
      log("cliente_criado", tenantId, { externoId: criado.id, user: req.user.id });
      return res.status(201).json({ ok: true, externoId: String(criado.id), cliente: local });
    } catch (e: any) {
      return res.status(erroHttp(e)).json({ error: e?.message || "Falha ao cadastrar na Max Data." });
    }
  });

  // ── Cliente: alterar ──
  app.put("/api/integrations/maxdata/clientes/:externoId", ...guard, async (req: any, res: any) => {
    const tenantId = await d.resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const externoId = digitos(req.params.externoId);
    if (!externoId) return res.status(400).json({ error: "Id inválido." });
    const which = whichDe(req.body?.which);
    const conn = await carregar(req, res, tenantId, which);
    if (!conn) return;
    const c = req.body?.cliente || {};
    try {
      const atual = um(await maxdataGet<any>(conn, `/client/${externoId}`));
      if (!atual?.id) return res.status(404).json({ error: "Cliente não encontrado na Max Data." });
      const novo: any = { ...pick(atual, CAMPOS_CLIENTE) };
      if (c.nome !== undefined) { const n = str(c.nome, 120); if (!n) return res.status(400).json({ error: "Nome é obrigatório." }); novo.nome = n; }
      if (c.email !== undefined) novo.email = str(c.email, 120);
      if (c.telefone !== undefined) novo.celular = digitos(c.telefone);
      if (c.documento !== undefined) {
        const doc = digitos(c.documento);
        if (doc && ![11, 14].includes(doc.length)) return res.status(400).json({ error: "CPF/CNPJ inválido." });
        novo.cpfCnpj = doc;
      }
      if (c.cidade !== undefined || c.estado !== undefined) {
        const end = Array.isArray(novo.enderecos) && novo.enderecos.length ? [...novo.enderecos] : [{}];
        end[0] = { ...end[0], ...(c.cidade !== undefined ? { cidade: str(c.cidade, 80) } : {}), ...(c.estado !== undefined ? { uf: str(c.estado, 2).toUpperCase() } : {}) };
        novo.enderecos = end;
      }
      await maxdataSend(conn, "PUT", `/client/${externoId}`, novo);
      let local: any = null;
      if (d.supabaseService) {
        const { data } = await d.supabaseService.from("maxdata_clientes").upsert(mapCliente({ ...atual, ...novo }, tenantId, FONTE(which)), { onConflict: "tenant_id,externo_sistema,externo_id" }).select("*").maybeSingle();
        local = data;
      }
      log("cliente_alterado", tenantId, { externoId, user: req.user.id, campos: Object.keys(c) });
      return res.json({ ok: true, cliente: local });
    } catch (e: any) {
      return res.status(erroHttp(e)).json({ error: e?.message || "Falha ao alterar na Max Data." });
    }
  });

  // ── Produto: alterar (a API não tem cadastro de produto novo) ──
  app.put("/api/integrations/maxdata/produtos/:externoId", ...guard, async (req: any, res: any) => {
    const tenantId = await d.resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const externoId = digitos(req.params.externoId);
    if (!externoId) return res.status(400).json({ error: "Id inválido." });
    const which = whichDe(req.body?.which);
    const conn = await carregar(req, res, tenantId, which);
    if (!conn) return;
    const p = req.body?.produto || {};
    const preco = (v: any) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : null; };
    try {
      const atual = um(await maxdataGet<any>(conn, `/product/${externoId}`));
      if (!atual?.id) return res.status(404).json({ error: "Produto não encontrado na Max Data." });
      const novo: any = { ...pick(atual, CAMPOS_PRODUTO) }; // `estoque` segue o valor ATUAL: esta rota nunca mexe em saldo
      if (p.descricao !== undefined) { const n = str(p.descricao, 120); if (!n) return res.status(400).json({ error: "Descrição é obrigatória." }); novo.descricao = n; }
      if (p.valorVenda !== undefined) { const v = preco(p.valorVenda); if (v === null) return res.status(400).json({ error: "Preço de venda inválido." }); novo.valorVenda = v; }
      if (p.valorCusto !== undefined) { const v = preco(p.valorCusto); if (v === null) return res.status(400).json({ error: "Custo inválido." }); novo.valorCusto = v; }
      if (p.desativado !== undefined) novo.desativado = !!p.desativado;
      if (p.localizador !== undefined) novo.localizador = str(p.localizador, 60);
      await maxdataSend(conn, "PUT", `/product/${externoId}`, novo);
      let local: any = null;
      if (d.supabaseService) {
        const { data } = await d.supabaseService.from("maxdata_produtos").upsert(mapProduto({ ...atual, ...novo }, tenantId, FONTE(which)), { onConflict: "tenant_id,externo_sistema,externo_id" }).select("*").maybeSingle();
        local = data;
      }
      log("produto_alterado", tenantId, { externoId, user: req.user.id, campos: Object.keys(p) });
      return res.json({ ok: true, produto: local });
    } catch (e: any) {
      return res.status(erroHttp(e)).json({ error: e?.message || "Falha ao alterar na Max Data." });
    }
  });

  // ── Estoque: criar ajuste PENDENTE (concluir é feito dentro da Max Data) ──
  app.post("/api/integrations/maxdata/estoque/ajuste", ...guard, async (req: any, res: any) => {
    const tenantId = await d.resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const conn = await carregar(req, res, tenantId, "estoque");
    if (!conn) return;
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (!itens.length || itens.length > 200) return res.status(400).json({ error: "Informe de 1 a 200 itens." });
    const limpos: { lote: string; produtoId: number; qtdeInformada: number }[] = [];
    for (const i of itens) {
      const produtoId = Number(digitos(i?.produtoId)), q = Number(i?.qtde);
      if (!produtoId || !Number.isFinite(q) || q < 0 || q > 1e7) return res.status(400).json({ error: "Item inválido: produto e quantidade (≥ 0) são obrigatórios." });
      limpos.push({ lote: str(i?.lote, 40), produtoId, qtdeInformada: q });
    }
    try {
      const resp = await maxdataSend<any>(conn, "POST", "/adjustmentstock", {
        clienteId: conn.empId, usuarioId: conn.idUser, status: "pendente", itens: limpos,
        obs: str(req.body?.obs, 200) || "Ajuste criado pelo S.P.Y.",
      });
      log("ajuste_estoque_criado", tenantId, { itens: limpos.length, user: req.user.id });
      return res.status(201).json({ ok: true, ajuste: um(resp) ?? null, aviso: "Ajuste criado como PENDENTE. Conclua-o na Max Data para atualizar o saldo." });
    } catch (e: any) {
      return res.status(erroHttp(e)).json({ error: e?.message || "Falha ao criar o ajuste na Max Data." });
    }
  });
}
