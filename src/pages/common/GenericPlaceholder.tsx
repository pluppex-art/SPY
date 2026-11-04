import { Outlet, Navigate } from "react-router-dom";

export default function GenericPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60dvh] text-slate-400 space-y-6">
      <div className="w-20 h-20 rounded-2xl bg-[var(--color-premium-black)] border border-slate-700/50 flex items-center justify-center text-slate-400">
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-[var(--color-white-text)]">Módulo Temporariamente Indisponível</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Esta área está sendo reestruturada para receber novas funcionalidades e relatórios avançados. Novidades em breve!
        </p>
      </div>
      {/* Achado de UX 2026-09-21: o botão "Notifique-me" usava alert() nativo
          e não gravava a "inscrição" em lugar nenhum — removido em vez de
          fingir uma ação que não existe de verdade. */}
    </div>
  );
}
