import { forwardRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Clock, Sparkles } from "lucide-react";
import { Section, Kicker, SectionTitle, FadeIn, PillarBadge, FONT_DISPLAY, FONT_MONO } from "./shared";
import { useLpTheme } from "./theme/LpThemeContext";

const labelStyle = { fontFamily: FONT_MONO };
const labelClass = "text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-2";
const inputClass =
  "w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20 transition-all";

interface FormState {
  nome: string;
  empresa: string;
  whatsapp: string;
  email: string;
  volumeLeads: string;
  desafio: string;
}

const EMPTY: FormState = { nome: "", empresa: "", whatsapp: "", email: "", volumeLeads: "", desafio: "" };

const TRUST_POINTS = [
  { icon: Sparkles, text: "Conversa consultiva sobre sua operação, sem discurso genérico." },
  { icon: Clock, text: "Resposta em até 1 dia útil." },
  { icon: ShieldCheck, text: "Sem compromisso — você decide o próximo passo." },
];

export const CTAFinalFormSection = forwardRef<HTMLDivElement>(function CTAFinalFormSection(_props, ref) {
  const { theme, glow } = useLpTheme();
  const [data, setData] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setData((d) => ({ ...d, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Partial<Record<keyof FormState, boolean>> = {};
    if (!data.nome.trim()) nextErrors.nome = true;
    if (!data.empresa.trim()) nextErrors.empresa = true;
    if (!data.whatsapp.trim()) nextErrors.whatsapp = true;
    if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) nextErrors.email = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Endpoint público (sem login) que grava o contato como lead novo.
      // Os campos extras do formulário viajam no resumo, que vira a observação do lead.
      const summary = [
        `Empresa: ${data.empresa.trim()}`,
        data.volumeLeads ? `Leads por mês: ${data.volumeLeads}` : null,
        data.desafio.trim() ? `Principal desafio: ${data.desafio.trim()}` : null,
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/public/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: "Landing page S.P.Y.",
          name: data.nome.trim(),
          phone: data.whatsapp.trim(),
          email: data.email.trim(),
          summary,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Não foi possível enviar agora.");
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.message || "Não foi possível enviar agora. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={ref}>
      <Section id="contato" className="border-t border-slate-200">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <Kicker>Próximo passo</Kicker>
            <SectionTitle as="h2" className="text-3xl sm:text-5xl lg:text-[3.4rem] mb-6">
              A próxima geração da<br />operação empresarial<br /><span className="text-slate-400">começa aqui.</span>
            </SectionTitle>
            <p className="text-slate-500 text-base sm:text-lg mb-8 max-w-md mx-auto lg:mx-0">
              Conecte sua empresa. Ative sua inteligência. Transforme operação em crescimento.
            </p>
            <div className="space-y-3 max-w-sm mx-auto lg:mx-0">
              {TRUST_POINTS.map((t) => (
                <div key={t.text} className="flex items-start gap-3 text-left">
                  <t.icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: theme.primaryDark }} />
                  <span className="text-sm text-slate-500">{t.text}</span>
                </div>
              ))}
            </div>
          </div>

          <FadeIn delay={0.1} className="relative">
            <div
              className="absolute -inset-6 rounded-[36px] blur-3xl pointer-events-none"
              style={{ background: `radial-gradient(circle, ${glow(0.18)} 0%, transparent 70%)` }}
            />
            <div
              className="relative rounded-2xl border border-slate-200 bg-white p-7 sm:p-9 shadow-xl"
              style={{ boxShadow: `0 20px 50px -10px ${glow(0.1)}` }}
            >
              {submitted ? (
                <div className="text-center py-8">
                  <div
                    className="w-14 h-14 rounded-full border flex items-center justify-center mx-auto mb-5"
                    style={{ background: `${theme.primary}15`, borderColor: `${theme.primary}40`, color: theme.primaryDark }}
                  >
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: FONT_DISPLAY }}>
                    Recebemos seu pedido.
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
                    Agora queremos entender melhor sua operação para mostrar onde o S.P.Y. pode gerar mais valor.
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-slate-900 mb-6" style={{ fontFamily: FONT_DISPLAY }}>
                    Vamos entender sua operação.
                  </h3>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass} style={labelStyle}>Nome *</label>
                        <input value={data.nome} onChange={set("nome")} className={`${inputClass} ${errors.nome ? "border-rose-400" : ""}`} placeholder="Seu nome" />
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>Empresa *</label>
                        <input value={data.empresa} onChange={set("empresa")} className={`${inputClass} ${errors.empresa ? "border-rose-400" : ""}`} placeholder="Nome da empresa" />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass} style={labelStyle}>WhatsApp *</label>
                        <input value={data.whatsapp} onChange={set("whatsapp")} className={`${inputClass} ${errors.whatsapp ? "border-rose-400" : ""}`} placeholder="(00) 00000-0000" />
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>E-mail *</label>
                        <input type="email" value={data.email} onChange={set("email")} className={`${inputClass} ${errors.email ? "border-rose-400" : ""}`} placeholder="voce@empresa.com" />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Quantidade aproximada de leads por mês</label>
                      <select value={data.volumeLeads} onChange={set("volumeLeads")} className={inputClass}>
                        <option value="">Selecione</option>
                        <option value="ate_50">Até 50</option>
                        <option value="50_200">50 a 200</option>
                        <option value="200_500">200 a 500</option>
                        <option value="500_mais">Mais de 500</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Principal desafio comercial</label>
                      <input value={data.desafio} onChange={set("desafio")} className={inputClass} placeholder="Ex: leads esfriando, follow-up manual..." />
                    </div>

                    {submitError && (
                      <p role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                        {submitError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className={`w-full mt-2 py-4 rounded-xl text-sm font-bold transition-all shadow-lg disabled:opacity-70 flex items-center justify-center gap-2 ${theme.ctaClass}`}
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {submitting ? "Enviando..." : "Quero conhecer o S.P.Y."}
                    </button>
                  </form>
                </>
              )}
            </div>
          </FadeIn>
        </div>
      </Section>
    </div>
  );
});
