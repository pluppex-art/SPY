import { test } from "node:test";
import assert from "node:assert/strict";
import { valorParado, videoDaPagina } from "../../src/pages/vendas/conta.js";

test("valor parado: orçamentos x valor médio x percentual, sem negativo nem acima de 100%", () => {
  assert.deepEqual(valorParado(50, 1500, 30), { mes: 22500, ano: 270000 });
  assert.equal(valorParado(10, 100, 250).mes, 1000);
  assert.equal(valorParado(-5, 100, 50).mes, 0);
  assert.equal(valorParado(Number.NaN, 100, 50).mes, 0);
});

test("vídeo: só YouTube, Vimeo ou arquivo de vídeo em https", () => {
  const yt = { tipo: "quadro", url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0" };
  assert.deepEqual(videoDaPagina("https://youtu.be/dQw4w9WgXcQ"), yt);
  assert.deepEqual(videoDaPagina("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), yt);
  assert.deepEqual(videoDaPagina("https://vimeo.com/123456789"), { tipo: "quadro", url: "https://player.vimeo.com/video/123456789" });
  assert.deepEqual(videoDaPagina("https://cdn.exemplo.com/vsl.mp4"), { tipo: "arquivo", url: "https://cdn.exemplo.com/vsl.mp4" });
  for (const ruim of ["", "javascript:alert(1)", "http://youtu.be/dQw4w9WgXcQ", "https://youtube.com/watch?v=curto", "https://exemplo.com/pagina", "https://youtube.com.golpe.com/watch?v=dQw4w9WgXcQ"]) {
    assert.equal(videoDaPagina(ruim), null, ruim);
  }
});
