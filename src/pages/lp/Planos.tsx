import {
  Rocket,
  Send,
  Zap,
  Check,
  Star,
  Coins,
  SlidersHorizontal,
  Info,
  Infinity as InfinityIcon,
  ShieldCheck,
  Headphones,
  RefreshCw,
  Key,
  Scale,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Section, FONT_DISPLAY, FONT_MONO } from "./shared";
import { useLpTheme } from "./theme/LpThemeContext";
import { CREDITS_COPY } from "./plansData";
import { usePublicPlans } from "../../lib/usePublicPlans";

const PLAN_ICONS: Record<string, typeof Rocket> = {
  start: Rocket,
  autopilot: Send,
  autonomous: Zap,
};


export function PlanosSection({ onCta }: { onCta: () => void }) {
  const { theme, glow } = useLpTheme();
  const { plans, tokenTiers: TOKEN_TIERS } = usePublicPlans();
  const PLANS = plans.map((p) => ({ ...p, icon: PLAN_ICONS[p.id] ?? Rocket }));

  return (
    <Section id="planos" className="bg-slate-50/80 border-t border-slate-200/90 py-16 sm:py-20" glow>
      <div className="max-w-[1340px] mx-auto relative z-10 px-4 sm:px-6">
        {/* Header Centralizado, Harmonioso e Moderno */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-4 border shadow-2xs"
            style={{
              background: theme.primaryLight,
              color: theme.primaryDark,
              borderColor: `${theme.primary}30`,
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Planos e Níveis de Operação</span>
          </div>

          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.15]"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            Escolha o nível de{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: theme.heroGradient }}
            >
              autonomia
            </span>{" "}
            da sua operação.
          </h2>

          <p className="text-sm sm:text-base text-slate-600 mt-3 font-normal leading-relaxed max-w-2xl mx-auto">
            Tecnologia que <strong className="font-semibold text-slate-900">encontra</strong>,{" "}
            <strong className="font-semibold text-slate-900">entende</strong> e{" "}
            <strong className="font-semibold text-slate-900">age</strong> sobre oportunidades de vendas.
          </p>
        </div>

        {/* Grid de 4 Colunas com items-start: Cada card termina no último tópico + botão sem buracos vazios */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 sm:gap-6 items-start">
          {PLANS.map((p) => {
            const isHighlight = p.highlight;

            return (
              <div
                key={p.id}
                className={`relative rounded-2xl p-5 sm:p-6 transition-all duration-300 bg-white ${
                  isHighlight
                    ? "border-2 shadow-xl ring-1"
                    : "border border-slate-200/90 shadow-sm hover:shadow-lg hover:border-slate-300"
                }`}
                style={{
                  borderColor: isHighlight ? theme.primary : undefined,
                  boxShadow: isHighlight
                    ? `0 18px 40px -10px ${glow(0.35)}`
                    : undefined,
                }}
              >
                {/* Badge Topo no plano mais escolhido */}
                {p.badgeTop && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-md whitespace-nowrap"
                      style={{ background: theme.primary }}
                    >
                      <Star className="w-2.5 h-2.5 fill-current" />
                      {p.badgeTop}
                    </span>
                  </div>
                )}

                {/* Header do Card: Ícone + Nome */}
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105"
                    style={{
                      background: theme.primaryLight,
                      borderColor: `${theme.primary}30`,
                      color: theme.primaryDark,
                    }}
                  >
                    <p.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3
                      className="text-lg font-black text-slate-900 tracking-wider uppercase"
                      style={{ fontFamily: FONT_DISPLAY }}
                    >
                      {p.name}
                    </h3>
                  </div>
                </div>

                <p className="text-[12px] text-slate-500 leading-snug mb-4 min-h-[34px]">
                  {p.tagline}
                </p>

                {/* Preço Mensal + Setup */}
                <div className="mb-4 pb-3.5 border-b border-slate-100">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-slate-400">R$</span>
                    <span
                      className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight"
                      style={{ fontFamily: FONT_DISPLAY }}
                    >
                      {p.monthlyPrice}
                    </span>
                    <span className="text-xs font-medium text-slate-400">/mês</span>
                  </div>

                  {p.setupPrice && <div className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                    <span className="text-slate-400">Implantação:</span>
                    <span
                      className="font-bold px-1.5 py-0.5 rounded text-[10.5px]"
                      style={{ background: theme.primaryLight, color: theme.primaryDark }}
                    >
                      {p.setupPrice}
                    </span>
                  </div>}
                </div>

                {/* Lista de Features — Direta e Compacta */}
                <div className="space-y-2 mb-5">
                  <p
                    className="text-[10px] font-black uppercase tracking-wider mb-2.5"
                    style={{ color: theme.primaryDark }}
                  >
                    {p.featuresHeader}
                  </p>
                  {p.features.map((feat) => (
                    <div key={feat} className="flex items-center gap-2.5 text-xs text-slate-700">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-white shadow-2xs"
                        style={{ background: theme.primary }}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                      <span className="leading-tight font-medium">{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Botão CTA posicionado logo abaixo do último tópico, terminando o card perfeitamente */}
                <button
                  onClick={onCta}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 shadow-xs hover:shadow-md cursor-pointer ${
                    isHighlight
                      ? "text-white shadow-md hover:scale-[1.02]"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                  style={isHighlight ? { background: theme.primary } : undefined}
                >
                  <span>{p.ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {/* CARD 4: CRÉDITOS DE INTELIGÊNCIA S.P.Y. */}
          <div className="relative rounded-2xl p-5 sm:p-6 bg-white border border-slate-200/90 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all duration-300">
            {/* Header do Card */}
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
                style={{
                  background: theme.primaryLight,
                  borderColor: `${theme.primary}30`,
                  color: theme.primaryDark,
                }}
              >
                <Coins className="w-5 h-5" />
              </div>
              <h3
                className="text-sm font-black text-slate-900 tracking-wider uppercase leading-tight"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                {CREDITS_COPY.title}
              </h3>
            </div>

            <p className="text-[12px] text-slate-500 mb-3.5 leading-snug min-h-[34px]">
              {CREDITS_COPY.description}
            </p>

            {/* Tabela de Valores de Créditos */}
            <div className="space-y-1.5 mb-3.5 bg-slate-50/90 p-3 rounded-xl border border-slate-200/60">
              {TOKEN_TIERS.map((tier) => (
                <div
                  key={tier.credits}
                  className="flex items-center justify-between text-xs py-1 border-b border-slate-200/40 last:border-0"
                >
                  <span className="text-slate-700 font-medium text-[11px]">{tier.credits}</span>
                  <span className="font-bold text-slate-900 font-mono text-[11.5px]">{tier.price}</span>
                </div>
              ))}
            </div>

            {/* Subtexto explicativo */}
            <div className="space-y-1 text-[11px] text-slate-500 leading-snug mb-4">
              <div className="flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: theme.primaryDark }} />
                <span className="font-semibold text-slate-700 text-[11px]">
                  {CREDITS_COPY.extraUsage}
                </span>
              </div>
              <p className="pl-5 text-[10px] text-slate-400 leading-tight">
                {CREDITS_COPY.disclaimer}
              </p>
            </div>

            {/* Seção Você Tem Controle Total */}
            <div className="border-t border-slate-100 pt-3.5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-800 mb-2.5">
                <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: theme.primaryDark }} />
                <span>{CREDITS_COPY.controlTitle}</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <div
                    className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: theme.primaryLight, color: theme.primaryDark }}
                  >
                    <Key className="w-2.5 h-2.5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-[11px] leading-tight">{CREDITS_COPY.controlItems[0].title}</h4>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {CREDITS_COPY.controlItems[0].text}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div
                    className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: theme.primaryLight, color: theme.primaryDark }}
                  >
                    <Scale className="w-2.5 h-2.5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-[11px] leading-tight">{CREDITS_COPY.controlItems[1].title}</h4>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {CREDITS_COPY.controlItems[1].text}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div
                    className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: theme.primaryLight, color: theme.primaryDark }}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-[11px] leading-tight">{CREDITS_COPY.controlItems[2].title}</h4>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {CREDITS_COPY.controlItems[2].text}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de contato direto para o card de créditos */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={onCta}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Falar com especialista</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Barra Inferior com Garantias e Slogan Oficial */}
        <div className="mt-12 pt-8 border-t border-slate-200/90 flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* 4 Pilares de Garantia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 w-full lg:w-auto">
            <div className="flex items-center gap-2.5 bg-white/70 border border-slate-200/70 rounded-xl p-3 shadow-2xs">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: theme.primaryLight,
                  color: theme.primaryDark,
                }}
              >
                <InfinityIcon className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">Sem fidelidade</h4>
                <p className="text-[10.5px] text-slate-500">Cancele quando quiser.</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-white/70 border border-slate-200/70 rounded-xl p-3 shadow-2xs">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: theme.primaryLight,
                  color: theme.primaryDark,
                }}
              >
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">Segurança</h4>
                <p className="text-[10.5px] text-slate-500">Dados protegidos.</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-white/70 border border-slate-200/70 rounded-xl p-3 shadow-2xs">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: theme.primaryLight,
                  color: theme.primaryDark,
                }}
              >
                <Headphones className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">Suporte humano</h4>
                <p className="text-[10.5px] text-slate-500">Acompanhamento ativo.</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-white/70 border border-slate-200/70 rounded-xl p-3 shadow-2xs">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: theme.primaryLight,
                  color: theme.primaryDark,
                }}
              >
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">Evolução contínua</h4>
                <p className="text-[10.5px] text-slate-500">Novidades semanais.</p>
              </div>
            </div>
          </div>

          {/* Slogan à direita */}
          <div className="text-center lg:text-right shrink-0">
            <p
              className="text-xs sm:text-sm font-black tracking-widest text-slate-800 uppercase"
              style={{ fontFamily: FONT_MONO }}
            >
              ENCONTRA. ENTENDE. AGE. CONVERTE.
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              S.P.Y. O sistema operacional de oportunidades comerciais.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
