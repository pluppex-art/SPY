import { Button } from "../../../../components/ui/button";
import { Modal } from "../../../../components/ui/modal";
import { FormField } from "../../../../components/ui/form-field";
import { Input } from "../../../../components/ui/input";
import { Activity, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface LandingPageTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPage: { id: string; name: string } | null;
  pixelId: string;
  setPixelId: (v: string) => void;
  gtagId: string;
  setGtagId: (v: string) => void;
  onSave: () => void;
}

export function LandingPageTrackingModal({
  isOpen,
  onClose,
  selectedPage,
  pixelId,
  setPixelId,
  gtagId,
  setGtagId,
  onSave,
}: LandingPageTrackingModalProps) {
  if (!isOpen || !selectedPage) return null;
  const script = `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/lp/tracker.js?id=${selectedPage.id}" async></script>`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--color-text-primary)]">
              Rastreamento de Tráfego
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] truncate max-w-[260px]">
              {selectedPage.name}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave} className="font-bold">
            Salvar Tags
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField
          label="ID do Pixel Meta (Facebook & Insta)"
          hint="Ex: 10293847568291 — Injeta script do Pixel na página"
        >
          <Input
            type="text"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="Ex: 10293847568291"
            className="font-mono text-xs"
          />
        </FormField>

        <FormField
          label="Google Analytics / Google Tag (G-TAG)"
          hint="Ex: G-XXXXXXXXXX ou AW-XXXXXXXXX"
        >
          <Input
            type="text"
            value={gtagId}
            onChange={(e) => setGtagId(e.target.value)}
            placeholder="Ex: G-XXXXXXXXXX"
            className="font-mono text-xs"
          />
        </FormField>

        <div className="pt-2 space-y-2">
          <Button
            variant="outline"
            onClick={() => {
              const pixel = pixelId.trim(); const g = gtagId.trim();
              const erros: string[] = [];
              if (pixel && !/^\d{8,20}$/.test(pixel)) erros.push("O Pixel da Meta tem só números (8 a 20 dígitos).");
              if (g && !/^(G|AW|GT|UA)-[A-Z0-9-]{4,}$/i.test(g)) erros.push("A Google Tag começa com G-, AW- ou GT- (ex.: G-ABC123XYZ).");
              if (erros.length) toast.error(erros.join(" "));
              else toast.success(pixel || g ? "Formato dos IDs conferido. O envio dos dados depende do script estar instalado na página." : "Nenhum ID informado.");
            }}
            className="w-full text-xs font-bold gap-2"
          >
            <Sparkles className="w-4 h-4" /> Conferir formato dos IDs
          </Button>
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Script que conta visitas e contatos</span>
            <button type="button" className="text-[11px] font-bold flex items-center gap-1 text-[var(--color-primary-blue)]" onClick={() => { navigator.clipboard.writeText(script).then(() => toast.success("Script copiado.")); }}><Copy className="w-3.5 h-3.5" />Copiar</button>
          </div>
          <pre className="text-[10px] font-mono overflow-x-auto p-2 rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] whitespace-pre-wrap break-all">{script}</pre>
          <p className="text-[11px] text-[var(--color-text-muted)]">Cole antes de <code>&lt;/head&gt;</code> da página. Ele conta a visita, os cliques e, quando alguém envia um formulário com nome e WhatsApp/e-mail, registra a conversão e cria o lead em Vendas.</p>
        </div>
      </div>
    </Modal>
  );
}
