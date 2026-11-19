import { useState } from "react";
import { Link2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { montarLinkUtm } from "../../lib/linkUtm";

const FONTES = ["instagram", "facebook", "google", "tiktok", "linkedin", "youtube", "whatsapp", "email", "sms"];
const input = "h-9 px-2 rounded-lg text-xs font-medium border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-primary)]";

/** Gera links com UTM: quem clicar e virar lead entra no painel de canais com a campanha certa. */
export function GeradorLinkUtm() {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ url: "", source: "", medium: "", campaign: "", content: "" });
  const r = montarLinkUtm(f);
  const set = (k: keyof typeof f) => (e: any) => setF((p) => ({ ...p, [k]: e.target.value }));
  const copiar = async () => {
    if (!r.ok) return;
    try { await navigator.clipboard.writeText(r.link); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar; selecione e copie o link."); }
  };
  return (
    <Card className="p-4 space-y-3">
      <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]"><Link2 className="w-4 h-4 text-[var(--color-primary-blue)]" /> Gerador de links rastreados {aberto ? "▴" : "▾"}</button>
      {aberto && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">Use esse link nos anúncios, bio do Instagram, e-mails e WhatsApp. Quando alguém clicar e virar lead (formulário ou página do SPY), aparece no painel de canais com a campanha certa.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)] sm:col-span-2">Endereço da página (formulário, página do SPY ou seu site)
              <input value={f.url} onChange={set("url")} placeholder="https://www.spycrm.com.br/form/..." className={input} /></label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Origem do clique *
              <input list="utm-fontes" value={f.source} onChange={set("source")} placeholder="instagram, google, email…" className={input} /><datalist id="utm-fontes">{FONTES.map((x) => <option key={x} value={x} />)}</datalist></label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Tipo (opcional)
              <input value={f.medium} onChange={set("medium")} placeholder="cpc, stories, bio, newsletter…" className={input} /></label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Campanha (opcional)
              <input value={f.campaign} onChange={set("campaign")} placeholder="black friday 2026" className={input} /></label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[var(--color-text-muted)]">Anúncio/criativo (opcional)
              <input value={f.content} onChange={set("content")} placeholder="video 1" className={input} /></label>
          </div>
          {r.ok ? (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--color-surface-sunken)] p-2">
              <p className="text-[11px] break-all flex-1 text-[var(--color-text-primary)]">{r.link}</p>
              <button onClick={() => void copiar()} className="shrink-0 h-7 px-2 rounded-md text-[11px] font-bold border border-[var(--color-border-default)] flex items-center gap-1"><Copy className="w-3 h-3" /> Copiar</button>
            </div>
          ) : r.ok === false && (f.url || f.source) ? <p className="text-[11px] text-[var(--color-text-faint)]">{r.erro}</p> : null}
        </div>
      )}
    </Card>
  );
}
