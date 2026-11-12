import { useEdgeSwipeBack } from "../hooks/useSwipeGestures";
import { setSaleSoundEnabled } from "../lib/notifications";
import { useState, useEffect, Suspense } from "react";
import { prefetchMainRoutes } from "../lib/prefetchRoutes";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { modulosDoCargo, cargoPermiteModulo, moduloDaRota } from "../lib/accessControl";
import { useAuth } from "../contexts/AuthContext";
import { Sidebar } from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";
import { MobileNav } from "./layout/MobileNav";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuroraWidget } from "./ui/AuroraWidget";
import { OnboardingWizard } from "./OnboardingWizard";
import { WhatsAppPairingModal } from "./WhatsAppPairingModal";
import { AgenteSecretoConexao } from "./AgenteSecretoConexao";
import { SDRWebhookModal } from "./ui/modals/crm/SDRWebhookModal";
import { useData } from "../contexts/DataContextTypes";
import { BillingBanner, SuspendedScreen, useIsBlocked } from "./BillingGate";
import { InstallAppPrompt } from "./InstallAppPrompt";

/**
 * Acesso por perfil às páginas: o que o cargo não libera (e some do menu) também não abre digitando o endereço.
 * Mesma regra do menu (lib/accessControl). Master não é restringido; rota sem módulo no menu fica livre.
 */
function AcessoPorPerfil({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  const { cargos } = useData();
  const { pathname } = useLocation();
  const modulo = moduloDaRota(pathname);
  const bloqueado = !!user && !user.isMaster && !!modulo && !cargoPermiteModulo(modulosDoCargo(user, cargos as any[]), modulo);
  useEffect(() => {
    if (bloqueado) toast.info("Seu perfil não tem acesso a esta página.");
  }, [bloqueado, pathname]);
  return bloqueado ? <Navigate to="/app" replace /> : children;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isModuleEnabled } = useAuth();
  const { theme } = useData();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  useEffect(() => { prefetchMainRoutes(); }, []);
  useEffect(() => { setSaleSoundEnabled(user?.preferences?.saleSound === true); }, [user?.preferences?.saleSound]);

  // Arrastar da borda esquerda = voltar (celular/tablet). Com um modal ou a folha "Mais" aberta não faz
  // nada (elas têm o próprio gesto de fechar); sem histórico pra voltar também não faz nada.
  useEdgeSwipeBack(() => {
    if (window.innerWidth >= 1024) return;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
  });
  const [isSDRWebhookOpen, setIsSDRWebhookOpen] = useState(false);
  const isBlocked = useIsBlocked();

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  return (
    <div className="h-dvh overflow-hidden bg-[var(--color-surface)] text-[var(--color-text-primary)] font-sans flex transition-all">
      <Sidebar
        isSidebarCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        isMobileSidebarOpen={isMobileSidebarOpen}
        setIsMobileSidebarOpen={setIsMobileSidebarOpen}
        setIsSDRWebhookOpen={setIsSDRWebhookOpen}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="absolute top-[-300px] right-[-100px] w-[800px] h-[800px] bg-blue-600/5 blur-[150px] rounded-full pointer-events-none"></div>

        <Topbar
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          isMobileSidebarOpen={isMobileSidebarOpen}
          setIsMobileSidebarOpen={setIsMobileSidebarOpen}
        />

        <BillingBanner />
        <InstallAppPrompt />

        <div className={`flex-1 min-h-0 relative ${location.pathname.includes("/messaging") || location.pathname.includes("/mensageria") ? "overflow-hidden p-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-2 md:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-2.5" : "overflow-y-auto overscroll-contain p-4 md:p-8 md:pb-[calc(6rem+env(safe-area-inset-bottom))] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8"}`}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<div role="status" aria-live="polite" className="flex items-center justify-center py-24 text-sm text-[var(--color-text-faint)]">Carregando...</div>}>
              {isBlocked ? <SuspendedScreen /> : <AcessoPorPerfil><Outlet /></AcessoPorPerfil>}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <MobileNav
        isMobileMoreOpen={isMobileMoreOpen}
        setIsMobileMoreOpen={setIsMobileMoreOpen}
        setIsSDRWebhookOpen={setIsSDRWebhookOpen}
      />
      <SDRWebhookModal isOpen={isSDRWebhookOpen} onClose={() => setIsSDRWebhookOpen(false)} />

      {/* Aurora era restrita a usuários master (G-TECH) porque as ferramentas de escrita
          (calendário/WhatsApp) estavam hardcoded pro tenant da G-TECH. Liberada aqui pra
          qualquer tenant com o módulo "aurora" ativo — a parametrização por tenant das
          ferramentas de escrita está sendo feita em paralelo (n8n / backend); até isso
          terminar, tenants não-master verão o widget mas chamadas à Aurora pessoal ainda
          são bloqueadas no backend (server.ts, rota /api/ai/aurora-chat, checagem is_master). */}
      {/* A Aurora aparece para TODOS os usuários da empresa: só depende do módulo da empresa, nunca do cargo. */}
      {isModuleEnabled("aurora") && <AuroraWidget />}
      <OnboardingWizard />
      <WhatsAppPairingModal />
      <AgenteSecretoConexao />

      <Toaster
        theme={theme}
        position={typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? "top-center" : "top-right"}
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: "!rounded-[var(--radius-panel)] !border-[var(--color-border-default)] !bg-[var(--color-surface-elevated)] !text-[var(--color-text-primary)] !shadow-[var(--shadow-panel)]",
            description: "!text-[var(--color-text-muted)]",
          },
        }}
      />
    </div>
  );
}
