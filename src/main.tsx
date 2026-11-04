import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyThemeColor, DEFAULT_BRAND_COLOR } from './lib/theme';

// Aplica a cor padrão e o favicon imediatamente no carregamento; a cor real
// do tenant chega depois, assim que o Supabase resolver (ver useLoginTheme /
// DataContext), sem depender de nenhum cache local.
applyThemeColor(DEFAULT_BRAND_COLOR);

// PWA: service worker só em produção (em dev ele atrapalharia o HMR). Guarda só o casco do app,
// nunca /api — ver public/sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem SW o app segue funcionando normal */ });
  });
}

// Extensões de navegador (gerenciadores de senha, tradutores) mutam o DOM
// fora do controle do React — envolvem/movem <input>s para outro elemento
// pai. Quando o React tenta remover/reordenar esses nós depois, o pai que
// ele espera não é mais o pai real, e insertBefore/removeChild lançam
// NotFoundError, derrubando a árvore inteira. Isso reduz essas duas
// operações a um no-op seguro quando o nó já não pertence mais ao pai
// esperado, em vez de deixar o React quebrar a renderização inteira.
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

// Ignora erros inofensivos do WebSocket do Vite no ambiente de dev
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message || '';
  if (message.includes('WebSocket') || message.includes('WebSocket closed')) {
    event.preventDefault();
  }
});

const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args) => {
  const msg = args[0]?.toString() || '';
  if (
    msg.includes('failed to connect to websocket') || 
    msg.includes('WebSocket closed without opened') ||
    msg.includes('WebSocket is already in CLOSING or CLOSED state')
  ) {
    return;
  }
  originalError.apply(console, args);
};

console.warn = (...args) => {
  const msg = args[0]?.toString() || '';
  if (msg.includes('[vite] failed to connect to websocket')) {
    return;
  }
  originalWarn.apply(console, args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
