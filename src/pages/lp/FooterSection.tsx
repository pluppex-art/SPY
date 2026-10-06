import { Link } from "react-router-dom";
import { Logo } from "../../components/ui/Logo";
import { useLpTheme } from "./theme/LpThemeContext";

export function FooterSection() {
  const { theme } = useLpTheme();

  return (
    <footer className="border-t border-slate-200 px-5 sm:px-8 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2.5 mb-2">
            <Logo variant="full" size={26} color={theme.logoColor} className="justify-center sm:justify-start" />
          </div>
          <p className="text-[11px] text-slate-500">Sistema Operacional de Oportunidades Comerciais.</p>
          <p className="text-[11px] text-slate-400 italic mt-0.5">Encontra. Entende. Age. Converte.</p>
        </div>

        <div className="flex items-center gap-6 text-[12px] font-medium text-slate-500">
          <Link to="/privacidade" className="hover:text-slate-900 transition-colors">Privacidade</Link>
          <a href="#" className="hover:text-slate-900 transition-colors">Termos</a>
          <a href="#" className="hover:text-slate-900 transition-colors">Contato</a>
        </div>
      </div>
    </footer>
  );
}
