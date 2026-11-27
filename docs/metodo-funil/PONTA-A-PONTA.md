# Método do funil · fluxo completo no Funil Comercial da SPY | IA

**Situação:** preparado em 27/11/2026. Falta rodar a migração; depois, publicar o fluxo dos prazos no n8n.

## Colunas confirmadas

| Coluna | Significa |
|---|---|
| Novo Lead | Lead novo |
| Diagnostico, Reunião / Apresentação | Em atendimento |
| Proposta, Negociação | Orçamento |
| Contrato | Aguardando pagamento |
| Não Respondeu | Repescagem: cliente sumiu |
| Follow-Up | Repescagem: adiou, preço, vai pesquisar, sem estoque |
| Ganho, Perdido, Desqualificado | Iguais |

## Repescagem por etapa

Valores propostos; podem ser ajustados por empresa.

| Veio de | Entra depois de | Dias das tentativas | Fim sem retorno |
|---|---|---|---|
| Atendimento (e Lead novo já respondido) | 48h sem resposta | 1, 3, 7, 15 | Perdido no 16º dia |
| Orçamento | 72h sem resposta | 1, 2, 4, 7, 10, 15, 21 | Perdido no 22º dia |
| Aguardando pagamento | 24h sem resposta | 1, 2, 4, 7 | Perdido no 8º dia |

Quando o cliente responde, o lead volta para a **mesma coluna** de onde saiu. Se o cliente adiar ou reclamar do preço, o agente leva para Follow-Up e usa o prazo do motivo.

Ajuste por empresa: `app_settings`, chave `crm_repescagem`, por exemplo `{"orcamento": {"horas": 48, "dias": [1, 3, 7]}}`.

## Peças

| Parte | Onde | Situação |
|---|---|---|
| Agente lê a conversa e move | `[PLUPPEX AI OS] Agente Secreto` (`4b1f8e1a`) | Publicado |
| Prazos, repescagem, avisos e método ligado | [20261231_metodo_funil_ponta_a_ponta.sql](../../supabase/migrations/20261231_metodo_funil_ponta_a_ponta.sql) | Falta rodar |
| Relógio dos prazos | `[PLUPPEX AI OS] Metodo SPY - Motor de Prazos` (`fDm6SGu2RjjbDz5k`), a cada 2 min | Criado desligado |

## O que a migração faz

- Cria o executor dos prazos: alerta de prazo estourado, aviso ao administrador no 1º atendimento, retornos, repescagem automática, tentativas, cobrança vencida e perda sem retorno. Só age no expediente do funil (sem configuração: todos os dias, 8h às 20h).
- Torna a nota opcional para o vendedor e deixa de criar a tarefa "Revisar nota".
- Liga o método no Funil Comercial e dá a situação aos leads atuais, sem prazos retroativos: a contagem começa na próxima conversa.
- Testa tudo no fim e desfaz o teste. Se algo falhar, nada é aplicado.

## O que ainda não faz

- Aviso ao vendedor por WhatsApp (só dentro do SPY).
- Mensagem automática ao cliente: quem chama é o vendedor.
- Relatórios (próximo passo).
- Os agentes dos clientes ainda não receberam a mudança.

## Para voltar atrás

- Desligar o método: `update public.crm_funis set metodo_ativo = false where id = '3x7skf56bjq';`
- Desativar o fluxo dos prazos no n8n.
- Agente: republicar `673f307a-fb40-45ef-b1c6-ffddf74c7d9b`.
