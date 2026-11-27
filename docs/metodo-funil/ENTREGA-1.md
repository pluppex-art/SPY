# Método do funil · Entrega 1: fundação do banco

**Situação:** plano e migração prontos para revisão (27/11/2026). **Nada foi aplicado** no banco e o app não mudou.

**Pronto quando:** um funil de teste tem as etapas com tipo e as situações padrão estão carregadas.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| [entrega-1_fundacao.sql](entrega-1_fundacao.sql) | A migração |
| [entrega-1_funil-de-teste.sql](entrega-1_funil-de-teste.sql) | Cria um funil desativado na SPY \| IA e confere o resultado |
| [entrega-1_desfazer.sql](entrega-1_desfazer.sql) | Volta ao estado anterior |
| [opcional_proteger-tabela-de-backup.sql](opcional_proteger-tabela-de-backup.sql) | Correção de segurança, independente do método |
| [proposta_telefone-reabertura.sql](proposta_telefone-reabertura.sql) | Só para a entrega 5 ou 6. **Não aplicar agora** |

## O que a migração cria

| Bloco | Conteúdo |
|---|---|
| Funis | `crm_funis.template` e `metodo_ativo` (nasce desligado); tipo canônico em cada etapa; proteção para a tela não apagar o tipo ao editar o funil |
| Catálogo | `crm_situacoes` (21 situações de fábrica) e `crm_motivos` (12 motivos) |
| Registros | `lead_estado`, `lead_notas`, `lead_status_historico`, `lead_timers`, `lead_sugestoes_ia`, `lead_pagamentos`, `contato_status` |
| Colunas | `tasks` (4), `notifications` (4), `products` (1), `automation_connections` (2, mais o gatilho "situacao") |
| Acesso | RLS em todas as tabelas novas |

São **9 tabelas novas** (o documento previa 8).

## Onde me afastei do documento

1. **Status em tabela própria (`lead_estado`), não em colunas de `leads`.** A situação da conversa muda a cada mensagem. Gravar em `leads` dispararia os 18 gatilhos dela e faria o quadro de todos recarregar. A tabela 1:1 não toca em `leads`. Os nomes das colunas são os do documento. **Precisa da sua aprovação.**
2. **Tela só lê os registros do lead.** Quem grava são as funções da entrega 2 e o servidor. Vendedor restrito vê apenas os leads dele.
3. **"Não-lead" fica na etapa Desqualificado**, como diz o planejamento. A parte do método o coloca em Venda perdida; precisa alinhar com o Daniel.
4. **Códigos canônicos travados no banco.** O cliente muda nome e tempos, não cria código novo.
5. **Cadência "vai pesquisar":** o documento diz 3 a 5 dias; ficou 3.

## Como não afeta quem não usa o método

- Só acrescenta. Nenhum dado é convertido (temperatura e status de tarefa ficam para depois).
- `leads` não é alterada. As tabelas novas apenas apontam para ela.
- Colunas novas aceitam vazio ou têm padrão neutro. As gravações atuais continuam iguais.
- A única mudança em algo existente é a lista de gatilhos aceitos em `automation_connections`, que ganha "situacao".
- O novo gatilho em `crm_funis` só age em funil que já tenha etapas com tipo.

## O que foi conferido e o que não foi

- **Conferido no banco (só leitura):** nomes e tipos das tabelas tocadas, políticas de acesso, gatilhos de funil, exclusão de empresa (pega as tabelas novas sozinha, por terem `tenant_id`) e backup (idem).
- **Conferido no código:** a tela de funis mantém o tipo ao salvar; a lista de colunas de tarefas ignora as novas.
- **Reconhecimento de etapas:** as mesmas regras, testadas em consulta, reconhecem 6 de 6 etapas nos funis da Casa São Paulo Sports e da Luminar. Funis do Kommo e funis longos ficam com etapas sem tipo, para escolha manual.
- **Não executado:** o SQL ainda não rodou em nenhum banco (não há Postgres nesta máquina).

## Como aplicar

1. **Ensaio:** rodar a migração e o funil de teste numa transação que termina em `rollback`. Mostra erro sem deixar nada.
2. Fazer o backup do banco e aplicar a migração como uma transação, em horário de pouco uso. Ela espera no máximo 5 s por bloqueio e desiste se não conseguir.
3. Rodar o funil de teste. Esperado: 6 etapas com tipo, 21 situações, 12 motivos, 0 funis com método ligado.
4. Se algo der errado, rodar o script de desfazer.

## Problemas para as próximas entregas

| Entrega | Ponto |
|---|---|
| 2 | Mapear os 18 gatilhos de `leads` antes das funções que movem etapa |
| 2 e 4 | Já existe o alerta `sla-primeiro-contato` a cada 15 min: substituir, para não alertar em dobro |
| 3 | Mesclar cartões apaga o lead repetido e, com ele, o histórico: mover os registros antes |
| 4 | Mensagens ligam a `chat_contacts` (telefone), não ao lead. É preciso uma única regra de telefone (55, nono dígito) |
| 5 | O aviso do gateway não identifica o lead: definir como casar |
| 5 e 6 | Só há um lead por telefone em cada empresa (com exceção no Negócio Fora da Curva): ver a proposta de reabertura |

## Decisões para você

- [ ] Aprovar `lead_estado` no lugar das colunas em `leads`
- [ ] Onde fica "Não-lead": Desqualificado (como está) ou Venda perdida
- [ ] Autorizar o ensaio e, depois, a aplicação
- [ ] Autorizar a proteção da tabela de backup
