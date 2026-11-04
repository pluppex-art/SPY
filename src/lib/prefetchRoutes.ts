/**
 * Pré-carrega, em segundo plano e quando o navegador está ocioso, o código das telas mais usadas.
 * Assim o toque na barra inferior não espera o download do arquivo da tela (o Service Worker
 * guarda em cache). Não roda com "economia de dados" nem em conexão 2G.
 */
const ROUTES: Array<() => Promise<unknown>> = [
  () => import("../pages/crm/Pipeline"),
  () => import("../pages/crm/Clientes"),
  () => import("../pages/operative/Tarefas"),
  () => import("../pages/crm/Messaging"),
  () => import("../pages/dashboard/CentralReceita"),
  () => import("../pages/crm/Propostas"),
  () => import("../pages/crm/AgendaCRM"),
  () => import("../pages/reunioes/index"),
  () => import("../components/ui/LeadDetailsModal"),
];

export function prefetchMainRoutes() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType))) return;

  const idle: (cb: () => void) => void =
    "requestIdleCallback" in window
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 4000 })
      : (cb) => setTimeout(cb, 1500);

  let i = 0;
  const next = () => {
    const load = ROUTES[i++];
    if (!load) return;
    load().catch(() => {}).finally(() => idle(next));
  };
  // Espera o carregamento inicial dos dados terminar de brigar por rede/CPU.
  setTimeout(() => idle(next), 3000);
}
