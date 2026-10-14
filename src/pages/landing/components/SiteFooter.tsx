import { Link, useLocation } from "react-router-dom";
import { Logo } from "../../../components/ui/Logo";

export function SiteFooter() {
  const { pathname } = useLocation();
  const A = ({ href, children }: { href: string; children: React.ReactNode }) =>
    pathname === "/landing" ? <a href={href}>{children}</a> : <Link to={`/landing${href}`}>{children}</Link>;
  return (
    <footer className="sp-footer">
      <div className="sp-wrap">
        <div className="sp-footer__grid">
          <div className="sp-footer__brand">
            <Logo variant="full" color="orange" size={32} />
            <p>CRM e ERP multiempresa, com a Aurora, assistente de IA.</p>
          </div>
          <nav aria-label="Navegação do rodapé">
            <h2>Produto</h2>
            <ul>
              <li><A href="#recursos">O que faz</A></li>
              <li><A href="#modulos">Módulos</A></li>
              <li><A href="#aurora">Aurora</A></li>
              <li><A href="#financeiro">Financeiro</A></li>
              <li><A href="#integracoes">Integrações e segurança</A></li>
              <li><A href="#planos">Planos</A></li>
              <li><A href="#implantacao">Implantação</A></li>
              <li><A href="#faq">Perguntas frequentes</A></li>
              <li><A href="#contato">Falar com a equipe</A></li>
            </ul>
          </nav>
          <nav aria-label="Segmentos">
            <h2>Segmentos</h2>
            <ul>
              <li><Link to="/f/varejo">Varejo</Link></li>
              <li><Link to="/f/automotivo">Automotivo</Link></li>
              <li><Link to="/f/solar">Energia solar</Link></li>
              <li><Link to="/f/imobiliaria">Imobiliária</Link></li>
              <li><Link to="/f/clinica">Clínica</Link></li>
              <li><Link to="/f/educacao">Educação</Link></li>
            </ul>
          </nav>
          <nav aria-label="Acesso">
            <h2>Acesso</h2>
            <ul>
              <li><Link to="/login">Acessar o sistema</Link></li>
              <li><Link to="/f/spy">Implantar o S.P.Y.</Link></li>
              <li><Link to="/contato">Contato</Link></li>
              <li><Link to="/privacidade">Política de privacidade</Link></li>
              <li><Link to="/termos">Termos de uso</Link></li>
            </ul>
          </nav>
        </div>
        <p className="sp-footer__legal">© {new Date().getFullYear()} S.P.Y. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
