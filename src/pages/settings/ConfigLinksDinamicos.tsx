import React, { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormField } from "../../components/ui/form-field";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { Link2, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useTenantDynamicLinks, type DynamicLinkType } from "../../hooks/useTenantDynamicLinks";

const LINK_TYPE_LABELS: Record<DynamicLinkType, string> = {
  payment: "Pagamento",
  scheduling: "Agendamento",
  checkout: "Checkout",
  contract: "Contrato",
};

export function ConfigLinksDinamicos() {
  const { links, loading, saving, create, update, remove } = useTenantDynamicLinks();
  const [form, setForm] = useState<{ link_type: DynamicLinkType; label: string; url: string }>({
    link_type: "payment",
    label: "",
    url: "",
  });

  const isUrlValid = form.url === "" || form.url.startsWith("https://");

  const handleCreate = async () => {
    if (!form.label || !form.url) {
      toast.error("Preencha um nome e a URL.");
      return;
    }
    if (!form.url.startsWith("https://")) {
      toast.error("Por segurança, a URL deve usar HTTPS.");
      return;
    }
    const { error } = await create(form);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Link cadastrado. A Aurora/Júlia já pode consultá-lo ao vivo.");
    setForm({ link_type: "payment", label: "", url: "" });
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { error } = await update(id, { active: !active });
    if (error) toast.error(error);
  };

  const handleDelete = async (id: string, label: string) => {
    if (!(await confirmDialog({ title: "Excluir link", description: `Excluir o link "${label}"? Essa ação não pode ser desfeita.` }))) return;
    const { error } = await remove(id);
    if (error) toast.error(error);
    else toast.success("Link removido.");
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] flex items-center gap-2.5">
          Links Dinâmicos
          <Link2 className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Cadastre aqui os links reais que sua empresa já usa (pagamento, agendamento, checkout, contrato) — a Aurora e a
          Júlia consultam essa lista ao vivo em vez de ter qualquer link fixo no prompt. Atualizar um link aqui reflete
          imediatamente, sem precisar editar nenhuma automação.
        </p>
      </div>

      <Card className="p-4 bg-warning/5 border border-warning/20 flex gap-3">
        <ShieldAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-text-muted)]">
          Isto NÃO gera um link de pagamento ou checkout novo — o SPY ainda não processa pagamentos diretamente. Cadastre
          aqui o link que você já tem hoje (ex.: o link de cobrança da sua conta Asaas/Mercado Pago/Stripe, ou o seu
          Calendly) só para centralizá-lo num único lugar que a IA consulta.
        </p>
      </Card>

      <Card className="p-6 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Novo Link</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <FormField label="Tipo">
            <select
              value={form.link_type}
              onChange={(e) => setForm((f) => ({ ...f, link_type: e.target.value as DynamicLinkType }))}
              className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-10"
            >
              {Object.entries(LINK_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Nome (rótulo)">
            <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex.: Link de pagamento padrão" />
          </FormField>
          <FormField label="URL" required error={!isUrlValid ? "A URL deve usar HTTPS." : undefined}>
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              className="font-mono text-xs"
            />
          </FormField>
        </div>
        <Button onClick={handleCreate} disabled={saving || !isUrlValid} className="font-bold text-xs h-10">
          Cadastrar Link
        </Button>
      </Card>

      <Card className="p-5 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center justify-between">
          <span>Links Cadastrados</span>
          <Badge variant="secondary">{links.length}</Badge>
        </h3>
        <div className="space-y-2.5">
          {loading ? (
            <div className="text-center py-8 text-[var(--color-text-faint)] text-xs">Carregando...</div>
          ) : links.length === 0 ? (
            <EmptyState icon={Link2} title="Nenhum link cadastrado" description="Cadastre um link acima para a Aurora/Júlia usarem." className="py-8" />
          ) : (
            links.map((link) => (
              <div key={link.id} className="bg-[var(--color-surface-sunken)] p-3.5 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{LINK_TYPE_LABELS[link.linkType]}</Badge>
                    <span className="font-bold text-[var(--color-text-primary)] truncate">{link.label}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--color-text-muted)] truncate mt-1">{link.url}</div>
                </div>
                <div className="flex gap-2 items-center shrink-0">
                  <button onClick={() => handleToggleActive(link.id, link.active)} className="cursor-pointer">
                    <Badge variant={link.active ? "success" : "neutral"} dot dotPulse={link.active}>{link.active ? "Ativo" : "Pausado"}</Badge>
                  </button>
                  <button onClick={() => handleDelete(link.id, link.label)} className="text-[var(--color-text-faint)] hover:text-danger p-1 transition-colors" title="Remover link">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
