import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Loader2, Pencil } from "lucide-react";
import { apiFetch } from "../../../lib/apiClient";
import { GOAL_OPTIONS, NICHES, SEGMENT_OPTIONS, TEAM_OPTIONS, TOOL_OPTIONS } from "./formConfig";

const EASE = [0.23, 1, 0.32, 1] as const;
const STEPS = ["Contato", "Empresa", "Objetivo", "Revisão"];

interface Data {
  nome: string;
  email: string;
  whatsapp: string;
  cargo: string;
  empresa: string;
  segmento: string;
  equipe: string;
  usaHoje: string;
  objetivos: string[];
  mensagem: string;
  lgpd: boolean;
  website: string; // honeypot
}
type Errors = Partial<Record<keyof Data, string>>;

export function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validate(step: number, d: Data): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (d.nome.trim().length < 3) e.nome = "Informe seu nome completo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) e.email = "Informe um e-mail válido, como nome@empresa.com.br.";
    const digits = d.whatsapp.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) e.whatsapp = "Informe o WhatsApp com DDD, como (63) 99999-9999.";
  }
  if (step === 1) {
    if (!d.empresa.trim()) e.empresa = "Informe o nome da empresa.";
    if (!d.segmento) e.segmento = "Escolha o segmento da empresa.";
  }
  if (step === 2) {
    if (d.objetivos.length === 0) e.objetivos = "Escolha pelo menos um objetivo.";
    if (d.objetivos.includes("outro") && !d.mensagem.trim()) e.mensagem = "Conte na mensagem o que você procura.";
  }
  if (step === 3 && !d.lgpd) e.lgpd = "Para enviar, aceite o uso dos dados para contato.";
  return e;
}

function buildSummary(d: Data): string {
  const seg = SEGMENT_OPTIONS.find((s) => s.id === d.segmento)?.label ?? "-";
  const goals = d.objetivos.map((g) => GOAL_OPTIONS.find((o) => o.id === g)?.label ?? g).join(", ");
  return [
    `Cargo: ${d.cargo.trim() || "-"}`,
    `Empresa: ${d.empresa.trim()}`,
    `Segmento: ${seg}`,
    `Tamanho da equipe: ${d.equipe || "-"}`,
    `Usa hoje: ${d.usaHoje || "-"}`,
    `Objetivos: ${goals}`,
    `Mensagem: ${d.mensagem.trim() || "-"}`,
    `Consentimento LGPD: sim (${new Date().toLocaleString("pt-BR")})`,
  ]
    .join("\n")
    .slice(0, 3900);
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="sp-field" data-invalid={!!error}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="sp-field__hint">{hint}</p>}
      {error && (
        <p className="sp-field__err" id={`${id}-err`} role="alert">
          <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}

export function LeadForm({ nicheKey = "spy", compact = false }: { nicheKey?: string; compact?: boolean }) {
  const cfg = NICHES[nicheKey] ?? NICHES.spy;
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [d, setD] = useState<Data>({
    nome: "", email: "", whatsapp: "", cargo: "", empresa: "", segmento: cfg.segment ?? "", equipe: "", usaHoje: "",
    objetivos: [], mensagem: "", lgpd: false, website: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [serverError, setServerError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);

  // reinicia se a rota mudar de segmento
  useEffect(() => {
    setStep(0);
    setState("idle");
    setErrors({});
    setD((p) => ({ ...p, segmento: cfg.segment ?? p.segmento }));
  }, [cfg.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // foco no primeiro campo ao trocar de passo (não no carregamento inicial)
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("input:not([tabindex='-1']), textarea, [data-autofocus]")?.focus({ preventScroll: false });
    }, 60);
    return () => window.clearTimeout(t);
  }, [step, state]);

  const set = <K extends keyof Data>(k: K, v: Data[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const goto = (n: number) => {
    setDir(n > step ? 1 : -1);
    wantFocus.current = true;
    setStep(n);
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    const errs = validate(step, d);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const key = Object.keys(errs)[0];
      panelRef.current?.querySelector<HTMLElement>(`#${compact ? "c-" : ""}f-${key}`)?.focus();
      return;
    }
    if (step < 3) goto(step + 1);
    else submit();
  };

  const submit = async () => {
    if (d.website) {
      setState("done"); // honeypot: robôs veem sucesso, nada é enviado
      return;
    }
    setState("sending");
    setServerError("");
    try {
      const res = await apiFetch("/api/public/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: cfg.payloadName,
          name: d.nome.trim(),
          phone: d.whatsapp.trim(),
          email: d.email.trim(),
          summary: buildSummary(d),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Não foi possível enviar agora.");
      setState("done");
    } catch (err: any) {
      setServerError(err?.message || "Não foi possível enviar agora. Tente novamente.");
      setState("error");
    }
  };

  const p = compact ? "c-" : "";
  const inv = (k: keyof Data) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${p}f-${k}-err` : undefined });

  const anim = reduce
    ? {}
    : {
        initial: { opacity: 0, x: dir * 16 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: dir * -16 },
        transition: { duration: 0.24, ease: EASE },
      };

  if (state === "done") {
    return (
      <div className={`sp-form sp-form--done${compact ? " sp-form--compact" : ""}`} role="status">
        <span className="sp-form__ok" aria-hidden="true">
          <Check size={28} strokeWidth={2.25} />
        </span>
        <h2>Recebemos o seu contato, {d.nome.trim().split(" ")[0]}.</h2>
        <p>A equipe do S.P.Y. vai analisar as suas respostas e entrar em contato pelo WhatsApp ou e-mail informados para combinar os próximos passos.</p>
        <ol>
          <li>Analisamos o seu cenário e o segmento da empresa.</li>
          <li>Entramos em contato para conversar sobre a implantação.</li>
          <li>Você acompanha a configuração do seu ambiente.</li>
        </ol>
        <Link to="/landing" className="sp-btn sp-btn--ghost">
          Voltar ao site
        </Link>
      </div>
    );
  }

  return (
    <form className={`sp-form${compact ? " sp-form--compact" : ""}`} onSubmit={next} noValidate aria-label={`Formulário de contato: ${cfg.title}`}>
      <ol className="sp-steps-ind" aria-label="Progresso">
        {STEPS.map((s, i) => (
          <li key={s} data-state={i < step ? "done" : i === step ? "current" : "todo"} aria-current={i === step ? "step" : undefined}>
            <span aria-hidden="true">{i < step ? <Check size={14} strokeWidth={2.5} /> : i + 1}</span>
            <b>{s}</b>
          </li>
        ))}
      </ol>
      <p className="sp-sr" aria-live="polite">{`Passo ${step + 1} de 4: ${STEPS[step]}`}</p>

      <div ref={panelRef} className="sp-form__panel">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...anim}>
            {step === 0 && (
              <fieldset>
                <legend>Como podemos falar com você?</legend>
                <Field id={`${p}f-nome`} label="Nome completo" error={errors.nome}>
                  <input id={`${p}f-nome`} autoComplete="name" value={d.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Maria Souza" {...inv("nome")} />
                </Field>
                <Field id={`${p}f-email`} label="E-mail" error={errors.email}>
                  <input id={`${p}f-email`} type="email" inputMode="email" autoComplete="email" value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="maria@empresa.com.br" {...inv("email")} />
                </Field>
                <Field id={`${p}f-whatsapp`} label="WhatsApp" error={errors.whatsapp}>
                  <input id={`${p}f-whatsapp`} type="tel" inputMode="tel" autoComplete="tel-national" value={d.whatsapp} onChange={(e) => set("whatsapp", maskPhone(e.target.value))} placeholder="(63) 99999-9999" {...inv("whatsapp")} />
                </Field>
                <Field id={`${p}f-cargo`} label="Cargo (opcional)">
                  <input id={`${p}f-cargo`} autoComplete="organization-title" value={d.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="Sócia, gerente comercial…" />
                </Field>
              </fieldset>
            )}

            {step === 1 && (
              <fieldset>
                <legend>Sobre a sua empresa</legend>
                <Field id={`${p}f-empresa`} label="Nome da empresa" error={errors.empresa}>
                  <input id={`${p}f-empresa`} autoComplete="organization" value={d.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="Nome fantasia" {...inv("empresa")} />
                </Field>
                <div className="sp-field" data-invalid={!!errors.segmento}>
                  <span className="sp-field__label" id={`${p}seg-l`}>Segmento</span>
                  <div className="sp-chips" role="radiogroup" aria-labelledby={`${p}seg-l`}>
                    {SEGMENT_OPTIONS.map(({ id, label, icon: Icon }) => (
                      <button key={id} type="button" role="radio" aria-checked={d.segmento === id} id={id === SEGMENT_OPTIONS[0].id ? `${p}f-segmento` : undefined} onClick={() => set("segmento", id)}>
                        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {errors.segmento && <p className="sp-field__err" role="alert"><AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> {errors.segmento}</p>}
                </div>
                <div className="sp-field">
                  <span className="sp-field__label" id={`${p}team-l`}>Tamanho da equipe comercial (opcional)</span>
                  <div className="sp-chips" role="radiogroup" aria-labelledby={`${p}team-l`}>
                    {TEAM_OPTIONS.map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={d.equipe === o} onClick={() => set("equipe", d.equipe === o ? "" : o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sp-field">
                  <span className="sp-field__label" id={`${p}tool-l`}>O que usa hoje (opcional)</span>
                  <div className="sp-chips" role="radiogroup" aria-labelledby={`${p}tool-l`}>
                    {TOOL_OPTIONS.map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={d.usaHoje === o} onClick={() => set("usaHoje", d.usaHoje === o ? "" : o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              </fieldset>
            )}

            {step === 2 && (
              <fieldset>
                <legend>O que você quer resolver?</legend>
                <div className="sp-field" data-invalid={!!errors.objetivos}>
                  <span className="sp-field__label" id={`${p}goal-l`}>Escolha uma ou mais opções</span>
                  <div className="sp-goals" role="group" aria-labelledby={`${p}goal-l`}>
                    {GOAL_OPTIONS.map((g, i) => {
                      const on = d.objetivos.includes(g.id);
                      return (
                        <button key={g.id} type="button" role="checkbox" aria-checked={on} id={i === 0 ? `${p}f-objetivos` : undefined} onClick={() => set("objetivos", on ? d.objetivos.filter((x) => x !== g.id) : [...d.objetivos, g.id])}>
                          <span className="sp-goals__box" aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                          <span>
                            <strong>{g.label}</strong>
                            <small>{g.text}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.objetivos && <p className="sp-field__err" role="alert"><AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> {errors.objetivos}</p>}
                </div>
                <Field id={`${p}f-mensagem`} label="Mensagem (opcional)" error={errors.mensagem}>
                  <textarea id={`${p}f-mensagem`} rows={3} value={d.mensagem} onChange={(e) => set("mensagem", e.target.value)} placeholder="Conte como a sua operação funciona hoje." {...inv("mensagem")} />
                </Field>
              </fieldset>
            )}

            {step === 3 && (
              <fieldset>
                <legend>Confira e envie</legend>
                <dl className="sp-review">
                  {[
                    [0, "Contato", `${d.nome} · ${d.email} · ${d.whatsapp}${d.cargo ? ` · ${d.cargo}` : ""}`],
                    [1, "Empresa", `${d.empresa} · ${SEGMENT_OPTIONS.find((s) => s.id === d.segmento)?.label ?? ""}${d.equipe ? ` · ${d.equipe}` : ""}${d.usaHoje ? ` · Usa ${d.usaHoje.toLowerCase()}` : ""}`],
                    [2, "Objetivo", `${d.objetivos.map((g) => GOAL_OPTIONS.find((o) => o.id === g)?.label).join(", ")}${d.mensagem.trim() ? ` · “${d.mensagem.trim()}”` : ""}`],
                  ].map(([n, k, v]) => (
                    <div key={String(k)}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                      <button type="button" onClick={() => goto(n as number)} aria-label={`Editar ${k}`}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> Editar
                      </button>
                    </div>
                  ))}
                </dl>
                <div className="sp-field" data-invalid={!!errors.lgpd}>
                  <label className="sp-consent" htmlFor={`${p}f-lgpd`}>
                    <input id={`${p}f-lgpd`} type="checkbox" checked={d.lgpd} onChange={(e) => set("lgpd", e.target.checked)} {...inv("lgpd")} />
                    <span>
                      Concordo em ser contatado pelo S.P.Y. com os dados informados, conforme a{" "}
                      <Link to="/privacidade" target="_blank" rel="noopener">política de privacidade</Link>.
                    </span>
                  </label>
                  {errors.lgpd && <p className="sp-field__err" id={`${p}f-lgpd-err`} role="alert"><AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> {errors.lgpd}</p>}
                </div>
                {state === "error" && (
                  <div className="sp-form__error" role="alert">
                    <AlertTriangle size={18} strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <strong>Não foi possível enviar.</strong>
                      <p>{serverError} Seus dados continuam aqui, é só tentar de novo.</p>
                    </div>
                  </div>
                )}
              </fieldset>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <input className="sp-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={d.website} onChange={(e) => set("website", e.target.value)} />

      <div className="sp-form__nav">
        {step > 0 ? (
          <button type="button" className="sp-btn sp-btn--ghost" onClick={() => goto(step - 1)} disabled={state === "sending"}>
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" /> Voltar
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="sp-btn sp-btn--primary" disabled={state === "sending"}>
          {state === "sending" ? (
            <>
              <Loader2 size={18} strokeWidth={1.75} className="sp-spin" aria-hidden="true" /> Enviando…
            </>
          ) : step < 3 ? (
            <>
              Continuar <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </>
          ) : state === "error" ? (
            "Tentar novamente"
          ) : (
            <>
              Enviar contato <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
