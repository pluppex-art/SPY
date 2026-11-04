import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Instagram, Facebook, Twitter, Linkedin, Share2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";

const CHANNELS = [
  { icon: Instagram, color: "text-rose-500", label: "Instagram" },
  { icon: Linkedin, color: "text-blue-500", label: "LinkedIn" },
  { icon: Twitter, color: "text-cyan-500", label: "Twitter/X" },
  { icon: Facebook, color: "text-indigo-500", label: "Facebook" },
];

export default function MarketingSocial() {
  return (
    <PageContainer
      title="Social Media & Comunidade"
      description="Gestão de redes sociais orgânicas — recurso ainda não conectado nesta instância."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        {CHANNELS.map((ch, i) => (
          <Card key={i} className="p-4 md:p-6 min-w-0 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
            <div className="flex justify-between items-center mb-4">
              <ch.icon className={`w-5 h-5 ${ch.color}`} />
              <span className="text-xs font-bold text-slate-500">—</span>
            </div>
            <div className="text-2xl font-display font-black text-white mb-1 italic">—</div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{ch.label} (não conectado)</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <Card className="p-6 md:p-10 bg-[var(--color-surface-elevated)] border-white/5 flex flex-col items-center justify-center text-center gap-3">
            <Share2 className="w-10 h-10 text-slate-600" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Nenhuma rede social conectada</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              A publicação e o acompanhamento de desempenho de posts em redes sociais ainda não estão disponíveis
              nesta instância do S.P.Y. Quando essa integração existir, o feed de desempenho aparecerá aqui.
            </p>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6 bg-[var(--color-surface-elevated)] border-white/5">
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Status de Integração</h3>
            <ul className="space-y-4">
              {CHANNELS.filter(c => c.label !== "Twitter/X").map((ch, i) => (
                <li key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ch.icon className={`w-4 h-4 ${ch.color}`} />
                    <span className="text-xs font-bold text-slate-300">{ch.label}</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-slate-600" title="Não conectado" />
                </li>
              ))}
            </ul>
            <Button
              onClick={() => toast.info("Conexão com redes sociais ainda não disponível — em breve.")}
              className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10"
            >
              Conectar Contas
            </Button>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
