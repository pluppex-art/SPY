# Vídeos de venda (VSL) do S.P.Y.

Dois vídeos 1920x1080, animados em código, com narração, trilha própria e legendas.

| Vídeo | Roteiro | Página |
|---|---|---|
| Consultiva | `roteiros/consultiva.js` | `/vendas/video` |
| Varejo | `roteiros/varejo.js` | `/vendas/video-varejo` |

## Gerar

```bash
node scripts/vsl/gerar.mjs varejo
node scripts/vsl/gerar.mjs consultiva
node scripts/vsl/gerar.mjs varejo --quadros 5,20   # só imagens, para conferir
```

O resultado sai em `scripts/vsl/saida/spy-vsl-<nome>.mp4` (a pasta não vai para o git).
Requer macOS (comando `say`), ffmpeg, o Playwright do projeto e internet (fontes do Google).

## Trocar a voz

- Um áudio só por vídeo, sem pausas marcadas (o que os modelos novos do ElevenLabs devolvem):
  `uv run --python 3.12 --with faster-whisper scripts/vsl/cortar-voz.py <vídeo> narracao.mp3`.
  Ele transcreve no computador, grava uma fala por arquivo em `voz/<vídeo>/` e lista o que vale ouvir.
- Voz do ElevenLabs (ou outra) em blocos: salve como `scripts/vsl/voz/<vídeo>/bloco-1.mp3`, `bloco-2.mp3`...,
  com `<break time="1.5s" />` entre as falas no texto. O gerador corta nas pausas sozinho.
- Sua voz: grave uma fala por arquivo em `scripts/vsl/voz/<vídeo>/<cena>-<n>.m4a` (também .wav ou .mp3), começando em 0.
  Ex.: `voz/varejo/balcao-0.m4a`. Os tempos do vídeo se ajustam sozinhos à gravação.
- Outra voz do Mac: `VSL_VOZ="Nome da voz" node scripts/vsl/gerar.mjs varejo`.

## Regra de conteúdo

Só entra o que o sistema faz. Conferido no código e no n8n em 27/11/2026:

| No vídeo | Condição para valer no cliente |
|---|---|
| Agente Secreto cria o lead, registra a análise, cria tarefa e reunião | Módulo contratado e WhatsApp do vendedor conectado |
| Preço enviado leva o negócio a Orçamento | Cliente presente na conversa |
| Aviso na tela e pela Aurora no WhatsApp | "Cliente esperando resposta" ligado (vem desligado e em modo de teste). Avisa só o vendedor |
| **Aurora chama o cliente, ele levanta a mão e o vendedor é avisado** (roteiro de 27/11, 2ª narração) | **Ainda não existe no sistema** (verificado em 27/11). Não publicar esse vídeo como disponível antes de a função funcionar, salvo decisão do dono |
| Radar e Ruptura | Telas do sistema; não avisam ninguém |
| Gestor pede o relatório de ruptura à Aurora (em texto) | Aurora completa ativa na empresa, perfil administrador. **Confirmar a ativação em cada cliente novo** |
| Vendedor pede o resumo dele | Cargo configurado. **Confirmar a Aurora no cliente** |
| Excel e Imprimir/PDF | Botão "Gerar relatório" na tela |

Não afirmar: aviso automático de ruptura ou de negócio esfriando, repescagem automática, chance de fechamento
calculada por IA, relatório de ruptura em PDF ou Excel, Aurora dentro do sistema para clientes.

## Publicar

As páginas mostram os arquivos de `public/videos/`. Depois de gerar um vídeo novo, comprima com um **nome novo**
(o navegador guarda o antigo por um ano), crie a capa e troque `VERSOES.<vídeo>.video` em
`src/pages/vendas/VendaVideo.tsx`:

```bash
# 1.15 = velocidade aprovada em 27/11/2026 (imagem e voz juntas, sem mudar o tom)
ffmpeg -i scripts/vsl/saida/spy-vsl-varejo.mp4 -filter_complex "[0:v]setpts=PTS/1.15,fps=30[v];[0:a]atempo=1.15[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 26 -tune animation -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart public/videos/vsl-varejo-v3.mp4
ffmpeg -ss 15 -i public/videos/vsl-varejo-v3.mp4 -frames:v 1 -q:v 4 public/videos/vsl-varejo-v3.jpg
```

Também vale link do YouTube (pode ser "não listado") ou do Vimeo no mesmo campo.
