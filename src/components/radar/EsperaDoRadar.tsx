/** Contagem enquanto a busca por CNAE espera o serviço de consulta liberar mais empresas. */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function EsperaDoRadar({ ate, onParar }: { ate: number; onParar: () => void }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
      <span>A consulta libera 10 empresas por minuto. Continua sozinha em <b>{Math.max(0, Math.ceil((ate - agora) / 1000))}s</b>; deixe esta tela aberta.</span>
      <button type="button" onClick={onParar} className="ml-auto bg-transparent border-0 p-0 font-bold underline cursor-pointer text-inherit">Parar aqui</button>
    </div>
  );
}
