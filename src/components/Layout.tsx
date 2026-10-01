import { useState, useEffect, Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { Sidebar } from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";
import { MobileNav } from "./layout/MobileNav";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuroraWidget } from "./ui/AuroraWidget";
import { OnboardingWizard } from "./OnboardingWizard";
import { SDRWebhookModal } from "./ui/modals/crm/SDRWebhookModal";
import { useData } from "../contexts/DataContextTypes";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isModuleEnabled } = useAuth();
  const { theme } = useData();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isSDRWebhookOpen, setIsSDRWebhookOpen] = useState(false);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--color-surface)] text-[var(--color-text-primary)] font-sans flex transition-all">
      <Sidebar
        isSidebarCollapsed={isSidebarCollapsed}
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

        <div className={`flex-1 min-h-0 relative ${location.pathname.includes("/messaging") || location.pathname.includes("/mensageria") ? "overflow-hidden p-1 pb-20 sm:p-2 sm:pb-2.5" : "overflow-y-auto p-4 md:p-8 pb-24 sm:pb-8"}`}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<div className="flex items-center justify-center py-24 text-sm text-slate-400">Carregando...</div>}>
              <Outlet />
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
      {isModuleEnabled("aurora") && <AuroraWidget />}
      <OnboardingWizard />

      <Toaster
        theme={theme}
        position="top-right"
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
