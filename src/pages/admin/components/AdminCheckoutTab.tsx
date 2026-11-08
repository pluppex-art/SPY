import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, RefreshCw, Trash2, X } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { apiFetch } from "../../../lib/apiClient";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { brl } from "../../../lib/saasApi";

type Config = { active: boolean; pix_key: string; receiver_name: string; receiver_city: string; notify_email: string; single_plan_code: string | null; list_price_cents: number; offer_cents: number | null; list_setup_cents?: number | null; list_monthly_cents?: number | null };
type Promo = { id: string; code: string | null; label: string; plan_code: string | null; percent_off: number; amount_off_cents: number; setup_waived: boolean; valid_until: string | null; max_uses: number | null; uses: number; active: boolean };
type Order = { id: string; status: string; plan_name: string; nome: string; empresa: string; email: string; telefone: string; documento: string; total_cents: number; promo_code: string | null; created_at: string; informed_paid_at: string | null; paid_at: string | null; error: string | null; comprovante_path: string | null; kind?: string; fulfilled_at?: string | null; agentes_ok?: boolean | null; agentes_erro?: string | null; acesso_email_ok?: boolean | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Aguardando Pix", cls: "text-[var(--color-text-muted)]" },
  awaiting_confirmation: { label: "Cliente avisou — conferir", cls: "text-amber-500" },
  paid: { label: "Pago", cls: "text-emerald-500" },
  canceled: { label: "Cancelado", cls: "text-rose-500" },
  expired: { label: "Expirado", cls: "text-[var(--color-text-muted)]" },
};

const campo = "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-blue)]";
const th = "py-1.5 text-left font-semibold text-[var(--color-text-muted)]";
const row = "border-t border-[var(--color-border-default)]";

async function call<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`);
  return json as T;
}

/** Checkout por Pix: dados do recebedor, promoções (troca de valores) e pedidos para confirmar. */
export function AdminCheckoutTab() {
  const [cfg, setCfg] = useState<Config>({ active: false, pix_key: "", receiver_name: "", receiver_city: "", notify_email: "", single_plan_code: null, list_price_cents: 0, offer_cents: null });
  const [promos, setPromos] = useState<Promo[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [novo, setNovo] = useState({ code: "", label: "", planCode: "", percentOff: "", amountOff: "", setupWaived: false, validUntil: "", maxUses: "" });

  const load = useCallback(async () => {
    try {
      const r = await call<{ config: Config | null; promos: Promo[]; orders: Order[] }>("GET", "/api/checkout/admin");
      if (r.config) setCfg(r.config);
      setPromos(r.promos); setOrders(r.orders);
    } catch (e: any) { toast.error(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); } catch (e: any) { toast.error(e.message || "Falha na operação."); } finally { setBusy(false); }
  };

  const salvarConfig = () => run(() => call("PUT", "/api/checkout/admin/config", {
    active: cfg.active, pixKey: cfg.pix_key, receiverName: cfg.receiver_name, receiverCity: cfg.receiver_city, notifyEmail: cfg.notify_email,
    singlePlanCode: cfg.single_plan_code || "", listPriceCents: cfg.list_price_cents, listSetupCents: cfg.list_setup_cents || 0, listMonthlyCents: cfg.list_monthly_cents || 0, offerCents: cfg.offer_cents,
  }), "Configuração salva.");

  const criarPromo = () => run(async () => {
    await call("POST", "/api/checkout/admin/promos", {
      code: novo.code, label: novo.label, planCode: novo.planCode, percentOff: Number(novo.percentOff) || 0,
      amountOffCents: Math.round((Number(String(novo.amountOff).replace(",", ".")) || 0) * 100), setupWaived: novo.setupWaived,
      validUntil: novo.validUntil || null, maxUses: Number(novo.maxUses) || null,
    });
    setNovo({ code: "", label: "", planCode: "", percentOff: "", amountOff: "", setupWaived: false, validUntil: "", maxUses: "" });
  }, "Promoção criada.");

  const verComprovante = async (o: Order) => {
    try { const r = await call<{ url: string }>("GET", `/api/checkout/admin/orders/${o.id}/comprovante`); window.open(r.url, "_blank", "noopener"); }
    catch (e: any) { toast.error(e.message); }
  };

  const confirmar = async (o: Order) => {
    const ok = await confirmDialog({
      title: "Confirmar pagamento?",
      description: o.kind === "renewal"
        ? `Confirme que o Pix de ${brl(o.total_cents)} de ${o.nome} (${o.empresa}) caiu na conta. Isso renova/reativa a assinatura da empresa que já existe.`
        : `Confirme que o Pix de ${brl(o.total_cents)} de ${o.nome} (${o.empresa}) caiu na conta. Isso cria a empresa, libera o acesso e envia o e-mail de senha ao cliente.`,
      confirmText: "Confirmar e liberar",
    });
    if (!ok) return;
    await run(async () => {
      const r = await call<{ emailEnviado?: boolean; checks?: Record<string, boolean> }>("POST", `/api/checkout/admin/orders/${o.id}/confirm`);
      const falhou = Object.entries(r.checks || {}).filter(([, v]) => !v).map(([k]) => k);
      if (falhou.length) toast.warning(`Empresa criada, mas confira: ${falhou.join(", ")}.`);
      else if (r.emailEnviado === false) toast.warning("Acesso criado, mas o e-mail não saiu. Use \"Esqueci a senha\" com o e-mail do cliente.");
    }, "Pagamento confirmado e acesso liberado.");
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-sm">Checkout por Pix</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Página pública para o cliente se cadastrar e pagar. Os preços vêm dos planos; as promoções abaixo trocam o valor na hora.</p>
          </div>
          <a href="/checkout" target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--color-primary-blue)] inline-flex items-center gap-1">Abrir checkout <ExternalLink className="w-3 h-3" /></a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">Chave Pix (onde o dinheiro cai)
            <input className={`${campo} mt-1`} value={cfg.pix_key} onChange={(e) => setCfg({ ...cfg, pix_key: e.target.value })} placeholder="CNPJ, e-mail, telefone ou chave aleatória" /></label>
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">E-mails que recebem os avisos (financeiro, comercial…)
            <input className={`${campo} mt-1`} value={cfg.notify_email} onChange={(e) => setCfg({ ...cfg, notify_email: e.target.value })} placeholder="financeiro@empresa.com, comercial@empresa.com" /></label>
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">Nome do recebedor (até 25 letras)
            <input className={`${campo} mt-1`} maxLength={25} value={cfg.receiver_name} onChange={(e) => setCfg({ ...cfg, receiver_name: e.target.value })} /></label>
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">Cidade do recebedor
            <input className={`${campo} mt-1`} maxLength={15} value={cfg.receiver_city} onChange={(e) => setCfg({ ...cfg, receiver_city: e.target.value })} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">Produto único (código do plano)
            <input className={`${campo} mt-1`} value={cfg.single_plan_code ?? ""} onChange={(e) => setCfg({ ...cfg, single_plan_code: e.target.value })} placeholder="start — vazio = cliente escolhe o plano" /></label>
          <div className="text-xs font-semibold text-[var(--color-text-muted)]">Valor de tabela (riscado): implantação + mensalidade, R$
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input className={campo} inputMode="decimal" aria-label="Implantação de tabela" value={cfg.list_setup_cents ? String(cfg.list_setup_cents / 100) : ""} onChange={(e) => setCfg({ ...cfg, list_setup_cents: Math.round((Number(e.target.value.replace(",", ".")) || 0) * 100) || null })} placeholder="5000" />
              <input className={campo} inputMode="decimal" aria-label="Mensalidade de tabela" value={cfg.list_monthly_cents ? String(cfg.list_monthly_cents / 100) : ""} onChange={(e) => setCfg({ ...cfg, list_monthly_cents: Math.round((Number(e.target.value.replace(",", ".")) || 0) * 100) || null })} placeholder="2000" />
            </div>
            <span className="mt-1 block font-normal">Total riscado: {brl((cfg.list_setup_cents || 0) + (cfg.list_monthly_cents || 0) || cfg.list_price_cents)}</span></div>
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">Valor promocional hoje, R$ (sem implantação)
            <input className={`${campo} mt-1`} inputMode="decimal" value={cfg.offer_cents ? String(cfg.offer_cents / 100) : ""} onChange={(e) => setCfg({ ...cfg, offer_cents: Math.round((Number(e.target.value.replace(",", ".")) || 0) * 100) || null })} placeholder="1000" /></label>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input type="checkbox" checked={cfg.active} onChange={(e) => setCfg({ ...cfg, active: e.target.checked })} /> Checkout ativo (aceitando pedidos)
          </label>
          <Button size="sm" disabled={busy} onClick={() => void salvarConfig()}>Salvar</Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-black text-sm">Promoções e cupons</h3>
        <p className="text-xs text-[var(--color-text-muted)]">Sem cupom = promoção automática (aparece para todos). Com cupom = o cliente digita no checkout.</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className={campo} placeholder="Cupom (vazio = automática)" value={novo.code} onChange={(e) => setNovo({ ...novo, code: e.target.value })} aria-label="Cupom" />
          <input className={campo} placeholder="Nome (ex.: Black Friday)" value={novo.label} onChange={(e) => setNovo({ ...novo, label: e.target.value })} aria-label="Nome da promoção" />
          <input className={campo} placeholder="Código do plano (vazio = todos)" value={novo.planCode} onChange={(e) => setNovo({ ...novo, planCode: e.target.value })} aria-label="Plano" />
          <input className={campo} placeholder="Desconto %" inputMode="numeric" value={novo.percentOff} onChange={(e) => setNovo({ ...novo, percentOff: e.target.value })} aria-label="Desconto em porcentagem" />
          <input className={campo} placeholder="Desconto em R$" inputMode="decimal" value={novo.amountOff} onChange={(e) => setNovo({ ...novo, amountOff: e.target.value })} aria-label="Desconto em reais" />
          <input className={campo} type="date" value={novo.validUntil} onChange={(e) => setNovo({ ...novo, validUntil: e.target.value })} aria-label="Válida até" />
          <input className={campo} placeholder="Máx. de usos" inputMode="numeric" value={novo.maxUses} onChange={(e) => setNovo({ ...novo, maxUses: e.target.value })} aria-label="Máximo de usos" />
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={novo.setupWaived} onChange={(e) => setNovo({ ...novo, setupWaived: e.target.checked })} /> Isentar implantação</label>
        </div>
        <Button size="sm" disabled={busy} onClick={() => void criarPromo()}>Criar promoção</Button>
        {promos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Promoção</th><th className={th}>Cupom</th><th className={th}>Plano</th><th className={th}>Desconto</th><th className={th}>Validade</th><th className={th}>Usos</th><th className={th}>Ativa</th><th /></tr></thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id} className={row}>
                    <td className="py-2 font-semibold">{p.label || "—"}</td>
                    <td className="text-xs">{p.code || "automática"}</td>
                    <td className="text-xs">{p.plan_code || "todos"}</td>
                    <td className="text-xs">{[p.percent_off ? `${p.percent_off}%` : "", p.amount_off_cents ? brl(p.amount_off_cents) : "", p.setup_waived ? "sem implantação" : ""].filter(Boolean).join(" + ")}</td>
                    <td className="text-xs">{p.valid_until ? new Date(p.valid_until).toLocaleDateString("pt-BR") : "sem fim"}</td>
                    <td className="text-xs">{p.uses}{p.max_uses ? `/${p.max_uses}` : ""}</td>
                    <td><input type="checkbox" checked={p.active} disabled={busy} aria-label={`Ativar ${p.label || p.code || "promoção"}`}
                      onChange={() => void run(() => call("POST", "/api/checkout/admin/promos", {
                        id: p.id, code: p.code, label: p.label, planCode: p.plan_code, percentOff: p.percent_off, amountOffCents: p.amount_off_cents,
                        setupWaived: p.setup_waived, validUntil: p.valid_until, maxUses: p.max_uses, active: !p.active,
                      }), "Promoção atualizada.")} /></td>
                    <td><button type="button" className="p-1 hover:text-rose-400" aria-label="Excluir promoção" disabled={busy}
                      onClick={async () => { if (await confirmDialog({ title: "Excluir promoção?", description: "Ela deixa de valer no checkout.", confirmText: "Excluir" })) void run(() => call("DELETE", `/api/checkout/admin/promos/${p.id}`), "Promoção excluída."); }}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm">Pedidos</h3>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar</Button>
        </div>
        {orders.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Nenhum pedido ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Cliente</th><th className={th}>Plano</th><th className={th}>Total</th><th className={th}>Status</th><th className={th}>Data</th><th /></tr></thead>
              <tbody>
                {orders.map((o) => {
                  const s = STATUS[o.status] ?? STATUS.pending;
                  return (
                    <tr key={o.id} className={row}>
                      <td className="py-2"><span className="font-semibold">{o.nome}</span><span className="block text-xs text-[var(--color-text-muted)]">{o.empresa} · {o.telefone} · {o.email}</span>{o.error && <span className="block text-xs text-rose-500">{o.error}</span>}
                        {o.kind === "renewal" && <span className="block text-xs text-[var(--color-text-muted)]">Renovação / reativação</span>}
                        {o.status === "paid" && o.acesso_email_ok === false && <span className="block text-xs text-amber-500">E-mail de acesso não saiu: peça para usar “Esqueci a senha”.</span>}
                        {o.status === "paid" && o.agentes_ok === false && <span className="block text-xs text-amber-500">Agentes n8n não acionados{o.agentes_erro ? `: ${o.agentes_erro}` : ""}.</span>}
                        {o.status === "paid" && o.fulfilled_at === null && <span className="block text-xs text-rose-500">Pago, mas a liberação não terminou: clique em “Retomar”.</span>}</td>
                      <td className="text-xs">{o.plan_name}{o.promo_code ? <Badge className="ml-1">{o.promo_code}</Badge> : null}</td>
                      <td className="font-semibold">{brl(o.total_cents)}</td>
                      <td className={`text-xs font-semibold ${s.cls}`}>{s.label}</td>
                      <td className="text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                      <td className="text-right whitespace-nowrap">
                        {o.comprovante_path && <Button size="sm" variant="outline" className="mr-1" onClick={() => void verComprovante(o)}>Ver comprovante</Button>}
                        {o.status === "paid" && o.fulfilled_at === null && (
                          <Button size="sm" disabled={busy} onClick={() => void confirmar(o)}><Check className="w-3.5 h-3.5 mr-1" /> Retomar</Button>
                        )}
                        {o.status !== "paid" && o.status !== "canceled" && (
                          <>
                            <Button size="sm" disabled={busy || !o.comprovante_path} title={o.comprovante_path ? "" : "Aguardando o comprovante do cliente"} onClick={() => void confirmar(o)}><Check className="w-3.5 h-3.5 mr-1" /> Confirmar Pix</Button>
                            <button type="button" className="ml-1 p-1 hover:text-rose-400" aria-label="Cancelar pedido" disabled={busy} onClick={() => void run(() => call("POST", `/api/checkout/admin/orders/${o.id}/cancel`), "Pedido cancelado.")}><X className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
