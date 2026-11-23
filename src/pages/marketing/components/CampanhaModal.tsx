import { Modal } from "../../../components/ui/modal";
import type { Campanha } from "../useMarketingTrafego";
import { CampanhaFormulario } from "./CampanhaFormulario";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  colunas: { id: string; title: string }[];
  /** Data sugerida ao criar (vem do clique num dia do calendário). */
  dataInicial?: string;
  /** Etapa sugerida ao criar (vem do botão “Adicionar” de uma coluna do quadro). */
  etapaInicial?: string;
  onSalvar: (dados: Omit<Campanha, "id" | "date">, id?: string) => Promise<boolean>;
}

/** Criar uma campanha de tráfego pago. Para editar, abra a campanha: a edição fica no painel de detalhes. */
export function CampanhaModal({ isOpen, onClose, colunas, dataInicial, etapaInicial, onSalvar }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg" title="Nova campanha de tráfego" description="Planeje a campanha: onde vai rodar, quanto vai investir e quando começa e termina.">
      <CampanhaFormulario campanha={null} colunas={colunas} dataInicial={dataInicial} etapaInicial={etapaInicial} onSalvar={onSalvar} onSalvo={onClose} onCancelar={onClose} />
    </Modal>
  );
}
