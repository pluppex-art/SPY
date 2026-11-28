# Repescagem pela Aurora

A Aurora chama o cliente que parou de responder por um **número só dela**, que não conversa. O vendedor é avisado
quando a mensagem chega ao cliente e quando ele responde ("levanta a mão"), no número da Aurora ou no do vendedor.

O número é uma sessão do WAHA sem webhook, `aurora-repescagem-<12 primeiros caracteres do id da empresa>`,
conectada por QR na própria tela (`server/repescagemNumero.ts`). Sem número conectado, nada é enviado.

| Peça | Onde |
|---|---|
| Tela (ligar e configurar) | Configurações › CRM › SLA — `src/pages/settings/sections/SettingsRepescagemAurora.tsx` |
| Configuração gravada | `app_settings`, chave `crm_repescagem_aurora` |
| Fluxo por empresa | n8n `[PLUPPEX AI OS] Repescagem Aurora (Empresa)` — `AEL8wg1FYkkRrwHf` |
| Agendador (5 em 5 min) | n8n `[PLUPPEX AI OS] Repescagem Aurora (Agendador)` — `6RXZzh1rK383yAYZ` |
| Regras | `regras.cjs` (nó "Decidir"), testes em `tests/crm/repescagemAurora.test.ts` |
| Histórico | `aurora_audit_log`: `repescagem_chamada`, `repescagem_entregue`, `repescagem_falha`, `repescagem_resposta`, `repescagem_recusa` |

## Travas

- Vem **desligada** e em **modo de teste** (só o número de teste faz o papel de cliente, após 5 minutos).
- Chama só quem já escreveu, tem lead em aberto, parou de responder há mais que o prazo e há no máximo 15 dias,
  em conversa parada **depois** de a função ser ligada. Nunca número da equipe.
- Uma chamada por empresa a cada 5 minutos, limite diário e intervalo mínimo de 7 dias por cliente.
- Quem responde SAIR (ou diz que não quer) não é chamado de novo.

## Testar

O celular de teste **não pode** estar no cadastro de nenhum usuário ou colaborador da empresa: desde 27/11 os Agentes
Secretos ignoram esses números antes de gravar a conversa. Por isso, no teste os avisos chegam só por WhatsApp; o
pop-up no sistema só é visto fora do modo de teste.

## Mudar as regras

Edite `regras.cjs`, rode os testes, gere com `node gerar-fluxo.cjs <pasta>` e leve o conteúdo de `decidir.js`
ao nó "Decidir". Publique o fluxo depois (gravar não publica pela tela do n8n; pela API pública publica na hora).

Pendente: ligar o "fluxo de erro" (`XEPfAJgvGoC1n9eQ`) nas configurações dos dois fluxos, na tela do n8n.
