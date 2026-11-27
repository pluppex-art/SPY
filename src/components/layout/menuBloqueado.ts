import { Lock, Users } from "lucide-react";
import { SOBRE_O_MODULO, skuDoModulo } from "../../lib/catalogoSpy";

/** Módulos de uso geral que aparecem no menu com cadeado quando a empresa não tem (os de segmento ficam só na página). */
const COM_CADEADO = ["financeiro", "marketing", "engajamento", "agendamento", "bi", "rh", "chatbot", "radar", "agente_interno"];

/**
 * Seções que o menu acrescenta para o administrador: o que falta contratar e o cadastro de usuários.
 * Não tira nada do menu: só mostra o que antes ficava escondido.
 */
export function secoesExtras({ admin, ligado }: { admin: boolean; ligado: (modulo: string) => boolean }) {
  if (!admin) return [];
  const itens = COM_CADEADO.filter((m) => !ligado(m)).map((m) => {
    const sku = skuDoModulo(m)!;
    return { name: SOBRE_O_MODULO[sku]?.[0] ?? sku, path: `/app/modulos?m=${m}`, icon: Lock };
  });
  return [
    // Cadastrar a equipe faz parte de todo plano, mesmo sem o módulo de RH (que é onde a tela aparece no menu).
    ...(ligado("rh") ? [] : [{ title: "Equipe", items: [{ name: "Usuários da Equipe", path: "/app/equipe", icon: Users }] }]),
    { title: "Liberar módulos", items: [...itens, { name: "Todos os módulos", path: "/app/modulos", icon: Lock }] },
  ];
}
