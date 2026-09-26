import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, ClipboardList, Loader2, Lock, PartyPopper,
  Moon, Plug, Rocket, ShieldCheck, Sparkles, Sun, Target, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { ImplementationSectionForm } from "../../components/implementacao/ImplementationFormFields";
import { IMPLEMENTATION_SECTIONS, computeProgress, type ImplData } from "../../lib/implementationForm";
import { cn } from "../../lib/utils";
import { SECTION_ICON } from "../../components/implementacao/sectionIcons";
import { contrastWithWhite, MIN_BRAND_CONTRAST } from "../../lib/theme";


const PAGE_BG = "min-h-screen bg-[var(--color-surface)] bg-[radial-gradient(60%_40%_at_50%_0%,color-mix(in_srgb,var(--color-primary-blue)_10%,transparent),transparent)]";

interface PublicImplementation {
  clienteNome: string;
  tenant: { name: string; primary_color: string | null };
  status: string;
  data: ImplData;
  editable: boolean;
}

const SAVE_DELAY_MS = 800;

/**
 * Link seguro em que o CLIENTE preenche a parte dele da implantação. Só os
 * campos marcados `audience: "client"` existem aqui — status de integração,
 * checklist de go-live e notas internas nem chegam do servidor. Acesso é pelo
 * token (share_token) na URL, mesmo modelo da proposta pública.
 */
export default function ImplementacaoPublica() {
  const { token } = useParams<{ token: string }>();
  const [impl, setImpl] = useState<PublicImplementation | null | undefined>(undefined);
  const [data, setData] = useState<ImplData>({});
  const [active, setActive] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Tema claro/escuro: lembra a escolha do cliente; sem escolha, segue o sistema dele. Aplica a MESMA
  // classe `dark` em <html> que o resto do S.P.Y. usa (as variáveis --color-* acompanham) e devolve
  // o estado anterior ao sair da página.
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("implantacao_tema");
      if (saved === "dark" || saved === "light") return saved === "dark";
    } catch { /* sem storage: segue o sistema */ }
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.toggle("dark", isDark);
    return () => { root.classList.toggle("dark", hadDark); };
  }, [isDark]);
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    try { localStorage.setItem("implantacao_tema", next ? "dark" : "light"); } catch { /* só não lembra */ }
  };

  const pending = useRef<Record<string, any>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Link com token não deve ser indexado.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    if (!token) { setImpl(null); return; }
    fetch(`/api/public-implementation/${token}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PublicImplementation | null) => {
        setImpl(d);
        if (d) {
          setData(d.data || {});
          const first = IMPLEMENTATION_SECTIONS.find((s) => s.fields.some((f) => f.audience === "client"));
          setActive(first?.id || "");
          document.title = `Implementação — ${d.clienteNome}`;
        }
      })
      .catch(() => setImpl(null));
  }, [token]);

  const flush = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const fields = pending.current;
    if (!token || Object.keys(fields).length === 0) return;
    pending.current = {};
    setSaveState("saving");
    try {
      const r = await fetch(`/api/public-implementation/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSaveState("saved");
    } catch {
      // Devolve pra fila — o próximo ajuste (ou o próximo ciclo) tenta de novo.
      pending.current = { ...fields, ...pending.current };
      setSaveState("error");
    }
  };

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { flushRef.current(); }, []);

  const handleChange = (fieldId: string, value: any) => {
    setData((prev) => {
      const next = { ...prev, [fieldId]: value };
      if (value === undefined) delete next[fieldId];
      return next;
    });
    // JSON descarta `undefined` — `null` é como o servidor entende "limpar a resposta".
    pending.current[fieldId] = value === undefined ? null : value;
    setSaveState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  };

  if (impl === undefined) {
    return (
      <div className={cn(PAGE_BG, "flex flex-col items-center justify-center gap-3")}>
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-faint)]" />
        <p className="text-xs text-[var(--color-text-faint)]">Carregando seu formulário…</p>
      </div>
    );
  }

  if (!impl) {
    return (
      <div className={cn(PAGE_BG, "flex items-center justify-center px-4")}>
        <Card className="p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <h1 className="text-base font-bold text-[var(--color-text-primary)] mb-1">Link não encontrado</h1>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">Este link é inválido ou foi substituído. Peça um novo link a quem te enviou.</p>
        </Card>
      </div>
    );
  }

  const sections = IMPLEMENTATION_SECTIONS.filter((s) => s.fields.some((f) => f.audience === "client"));
  const idx = Math.max(0, sections.findIndex((s) => s.id === active));
  const section = sections[idx];
  const { overall, sections: bySection } = computeProgress(data, "client");
  const brandColor = impl.tenant.primary_color && /^#[0-9a-fA-F]{6}$/.test(impl.tenant.primary_color) ? impl.tenant.primary_color : null;
  const brand = brandColor ? ({ "--color-primary-blue": brandColor } as CSSProperties) : undefined;
  // Topo: cor da marca SEM degradê e letras sempre brancas. Se a cor for clara demais para texto branco,
  // escurece só o fundo (a letra continua branca). `!text-white` porque o tema claro sobrescreve `text-white`.
  const heroTooLight = brandColor ? contrastWithWhite(brandColor) < MIN_BRAND_CONTRAST : false;
  const heroBg = heroTooLight ? "color-mix(in srgb, var(--color-primary-blue) 55%, #0b1120)" : "var(--color-primary-blue)";
  const allDone = overall.total > 0 && overall.percent >= 100;
  const isDone = (id: string) => (bySection[id]?.total ?? 0) > 0 && bySection[id].percent >= 100;
  const go = (i: number) => { setActive(sections[i].id); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const SectionIcon = SECTION_ICON[section.id] || ClipboardList;

  return (
    <div className={cn(PAGE_BG, "px-4 py-6 sm:py-10")} style={brand}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Topo */}
        <header
          className="relative overflow-hidden rounded-3xl p-6 sm:p-8 shadow-[var(--shadow-panel)] !text-white"
          style={{ backgroundColor: heroBg }}
        >
          <div className="relative flex items-start justify-between gap-3 flex-wrap">
            {impl.tenant.name ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest bg-white/15 !text-white">
                <Building2 className="w-3.5 h-3.5" /> {impl.tenant.name}
              </span>
            ) : <span />}
            <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold min-h-[26px] bg-white/15 !text-white">
              {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Salvando…</>}
              {saveState === "saved" && <><Check className="w-3 h-3" /> Tudo salvo</>}
              {saveState === "error" && <>Não foi possível salvar — tentaremos de novo</>}
              {saveState === "idle" && <><ShieldCheck className="w-3 h-3" /> Salva automaticamente</>}
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
              title={isDark ? "Modo claro" : "Modo escuro"}
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors bg-white/15 hover:bg-white/25 !text-white"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            </div>
          </div>

          <div className="relative mt-5 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight !text-white">Vamos implantar {impl.clienteNome}</h1>
              <p className={cn("text-sm mt-2 max-w-xl leading-relaxed", "!text-white opacity-90")}>
                Preencha o que souber, no seu tempo. Tudo é salvo automaticamente e você pode voltar depois pelo mesmo link.
              </p>
            </div>
            <div className="md:w-64">
              <div className="flex items-end justify-between mb-1.5">
                <span className={cn("text-[11px] font-semibold uppercase tracking-wide", "!text-white opacity-80")}>Seu preenchimento</span>
                <span className="text-3xl font-black tabular-nums leading-none !text-white">{overall.percent}%</span>
              </div>
              <div className={cn("h-2.5 rounded-full overflow-hidden", "bg-white/25")}>
                <div className={cn("h-full rounded-full transition-all duration-500", "bg-white")} style={{ width: `${Math.min(100, overall.percent)}%` }} />
              </div>
              <p className={cn("text-[11px] mt-1.5", "!text-white opacity-80")}>{overall.done} de {overall.total} itens principais respondidos</p>
            </div>
          </div>
        </header>

        {!impl.editable && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 text-xs text-emerald-600">
            <Lock className="w-4 h-4 shrink-0" /> Esta implementação foi concluída — o formulário está somente para consulta.
          </div>
        )}

        {allDone && impl.editable && (
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3.5">
            <PartyPopper className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-600">Tudo respondido — obrigado!</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Nossa equipe já recebe suas respostas e segue a partir daqui. Se lembrar de algo, é só voltar neste link e ajustar.</p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[250px_1fr] items-start">
          {/* Etapas — coluna lateral no desktop, faixa rolável no celular */}
          <nav aria-label="Etapas" className="lg:sticky lg:top-6">
            <ol className="hidden lg:flex flex-col gap-1 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-2 shadow-[var(--shadow-control)]">
              {sections.map((s, i) => {
                const done = isDone(s.id);
                const cur = i === idx;
                const Icon = SECTION_ICON[s.id] || ClipboardList;
                const b = bySection[s.id];
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-current={cur ? "step" : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer transition-colors",
                        cur ? "bg-[var(--color-primary-blue)]/10" : "hover:bg-[var(--color-surface-sunken)]"
                      )}
                    >
                      <span className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black",
                        done ? "bg-emerald-500 !text-white" : cur ? "bg-[var(--color-primary-blue)] !text-white" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"
                      )}>
                        {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-xs font-bold truncate", cur ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-primary)]")}>{s.title}</span>
                        <span className="block text-[10px] text-[var(--color-text-faint)] tabular-nums">
                          {b?.total > 0 ? `${b.done} de ${b.total} respondidos` : "Opcional"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="lg:hidden flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {sections.map((s, i) => {
                const done = isDone(s.id);
                const cur = i === idx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => go(i)}
                    className={cn(
                      "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer transition-colors",
                      cur ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] !text-white" : "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"
                    )}
                  >
                    {done ? <CheckCircle2 className={cn("w-3.5 h-3.5", cur ? "!text-white" : "text-emerald-500")} /> : <span className="opacity-70 tabular-nums">{i + 1}</span>}
                    {s.title}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Etapa atual */}
          <div className="space-y-4 min-w-0">
            <Card className="p-5 sm:p-7">
              <div className="flex items-start gap-4 mb-6 pb-5 border-b border-[var(--color-border-subtle)]">
                <span className="w-11 h-11 rounded-2xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
                  <SectionIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]">Etapa {idx + 1} de {sections.length}</p>
                  <h2 className="text-lg font-black tracking-tight text-[var(--color-text-primary)]">{section.title}</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{section.description}</p>
                </div>
              </div>

              <fieldset disabled={!impl.editable} className="contents">
                <ImplementationSectionForm section={section} data={data} onChange={handleChange} audience="client" />
              </fieldset>

              <div className="flex items-center justify-between gap-3 mt-8 pt-5 border-t border-[var(--color-border-subtle)]">
                <button
                  type="button"
                  onClick={() => go(idx - 1)}
                  disabled={idx === 0}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-[var(--radius-control)] border border-[var(--color-border-default)] text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Anterior
                </button>
                {idx < sections.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => go(idx + 1)}
                    className="inline-flex items-center gap-1.5 px-5 h-10 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-xs font-bold hover:brightness-110 shadow-[var(--shadow-control)] cursor-pointer"
                  >
                    Próxima etapa <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Última etapa — suas respostas já estão salvas
                  </span>
                )}
              </div>
            </Card>

            <p className="text-[11px] text-[var(--color-text-faint)] flex items-start gap-2 max-w-2xl leading-relaxed">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
              Por segurança, nunca envie senhas ou códigos de acesso por aqui — quando precisarmos de acesso, você concede diretamente na plataforma (ex.: Business Manager).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
