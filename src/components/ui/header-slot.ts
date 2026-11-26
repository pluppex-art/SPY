import { createContext } from "react";

/** Lugar no cabeçalho da página (junto dos botões de ação) onde o botão "Indicadores" é desenhado. */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);
