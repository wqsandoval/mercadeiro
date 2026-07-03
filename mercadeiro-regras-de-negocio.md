# Mercadeiro — Regras de Negócio e Casos de Uso

Documento de referência funcional, derivado do wireframe `Lista de Compras - Wireframes.dc.html` (telas 3a, 2a, 2b, 2c, 4a, 3b, 3c). Serve como especificação para o desenvolvimento do frontend (Vue) e backend (Fastify/Prisma).

---

## 1. Visão geral do produto

O Mercadeiro é um app de lista de compras domiciliar com três funções centrais:

1. **Despensa** — o que a família precisa comprar (lista viva, sem data).
2. **Carrinho** — a execução de uma compra em tempo real, dentro de um supermercado.
3. **Analítico** — inteligência sobre gastos, variação de preços e comparação entre supermercados, construída a partir do histórico de compras.

O fluxo central do produto é: **Despensa → Carrinho → Finalizar Compra**, gerando dados que alimentam o **Analítico**.

---

## 2. Entidades e glossário

| Entidade | Descrição |
|---|---|
| **Produto** | Item genérico e reutilizável (ex: "Peito de Frango"). Pode ter código de barras associado. Pertence a uma Categoria. |
| **Categoria** | Agrupador de produtos (ex: Frutas, Laticínios, Carnes, Padaria, Higiene). Usada para organizar a Despensa, o Carrinho e o gráfico de gastos. |
| **Supermercado** | Local de compra. Identificado por nome + endereço. Pode ser detectado automaticamente por geolocalização ou selecionado manualmente. |
| **ItemDespensa** | Vínculo entre um Produto e a lista de "o que falta comprar". Tem quantidade desejada. Não tem preço (a Despensa não é uma compra). |
| **Compra** (sessão de compra) | Representa uma ida ao mercado, do início ("Iniciar Compra") até "Finalizar Compra". Associada a um Supermercado, uma data/hora, e um conjunto de ItemCompra. |
| **ItemCompra** | Um produto dentro de uma Compra específica. Tem: quantidade, preço unitário, status (comprado/não comprado), origem (**planejado** — veio da Despensa — ou **extra** — adicionado durante a compra sem estar na Despensa). |
| **PrecoHistorico** | Registro de preço de um Produto, em um Supermercado, numa data — criado a partir de cada ItemCompra marcado como comprado ao finalizar a Compra. É a base de todo o módulo Analítico. |

**Badges de origem usados na UI:**
- 🏠 **planejado** — item que já estava na Despensa antes da compra começar.
- ⚡ **extra** — item adicionado ad-hoc durante a compra, sem estar na Despensa.

---

## 3. Casos de uso

### UC-01 — Visualizar Home
**Tela:** 3a
**Ator:** Usuário
**Objetivo:** Ponto de entrada do app, visão geral rápida.

**Fluxo principal:**
1. Sistema exibe saudação personalizada (ex: "Boa tarde, família Silva").
2. Sistema exibe card **Despensa** com contagem total de itens pendentes e breakdown por categoria (top categorias).
3. Sistema exibe card **Analítico** com total gasto no mês atual e um insight em destaque (ex: alerta de maior variação de preço).
4. Sistema exibe CTA **Iniciar Compra**, com contagem de itens da Despensa prontos para virar Carrinho.

**Regras de negócio:**
- RN-01.1: O contador do card Despensa reflete a soma de `ItemDespensa` ativos (não removidos).
- RN-01.2: O card Analítico sempre reflete o período "mês atual" por padrão, independente do filtro salvo em outra tela.
- RN-01.3: O CTA "Iniciar Compra" está sempre habilitado, mesmo com a Despensa vazia — uma Compra pode ser iniciada só com itens extra, adicionados dentro do Carrinho.

---

### UC-02 — Gerenciar Despensa
**Tela:** 2a
**Ator:** Usuário
**Objetivo:** Manter a lista do que precisa ser comprado.

**Fluxo principal — adicionar item:**
1. Usuário digita o nome do item no campo "o que está faltando?".
2. Usuário confirma (botão "Add").
3. Sistema busca/cria o Produto correspondente e associa a uma Categoria (por correspondência de nome conhecido, ou categoria "Outros" se novo).
4. Sistema cria um `ItemDespensa` com quantidade padrão = 1.
5. Item aparece na lista, agrupado sob o header da sua categoria.

**Fluxo — ajustar quantidade:**
1. Usuário toca em "+" ou "−" no seletor de quantidade do item.
2. Sistema atualiza a quantidade do `ItemDespensa` imediatamente (sem confirmação).

**Fluxo — remover item:**
1. Usuário toca no ✕ ao lado do item.
2. Sistema remove o `ItemDespensa` da lista.

**Fluxo — ir para o Carrinho:**
1. Usuário toca em "Ir para o Carrinho →".
2. Sistema cria uma nova `Compra` (status: em andamento).
3. Sistema copia todos os `ItemDespensa` ativos para `ItemCompra`, marcados como **planejado** (🏠) e **não comprado**.
4. Sistema navega para a tela Carrinho (2b).

**Regras de negócio:**
- RN-02.1: Quantidade mínima de um `ItemDespensa` é 1. Tocar em "−" com quantidade = 1 remove o item da lista diretamente (sem confirmação extra).
- RN-02.2: Itens são agrupados e exibidos por ordem de Categoria; dentro da categoria, por ordem de inserção.
- RN-02.3: Ir para o Carrinho **não remove** os itens da Despensa — a remoção só ocorre ao Finalizar a Compra (UC-05), e apenas para itens efetivamente comprados.
- RN-02.4: Só pode existir uma `Compra` "em andamento" por vez. Se o usuário já tiver uma compra iniciada e tentar iniciar outra (via CTA "Iniciar Compra" ou navegação direta), o sistema **retoma** a `Compra` existente e navega direto para o Carrinho (2b), sem criar uma nova sessão.

---

### UC-03 — Executar Compra (Carrinho)
**Tela:** 2b
**Ator:** Usuário (dentro do supermercado)
**Objetivo:** Marcar itens como comprados, registrar preços, em tempo real durante a compra.

**Fluxo principal — abertura do carrinho:**
1. Sistema solicita permissão de geolocalização (se ainda não concedida).
2. Sistema captura coordenadas GPS e faz reverse geocoding para identificar o supermercado mais próximo/provável.
3. Sistema exibe o supermercado detectado como badge (ex: "📍 Supermercado Extra — Rua das Flores"), com opção de trocar manualmente (▼).
4. Sistema exibe a lista de `ItemCompra` da compra em andamento, agrupada por categoria.
5. Sistema exibe barra de progresso: (itens comprados / total de itens) e percentual.

**Fluxo — marcar item como comprado:**
1. Usuário toca no checkbox do item.
2. Se o item **não tem preço definido**, sistema bloqueia a marcação e exibe opções: "📷 Escanear código" ou "💲 digitar preço".
   - 2a. Escanear código: abre câmera, decodifica código de barras, busca `Produto` correspondente (e sugere último preço conhecido daquele produto, editável).
   - 2b. Digitar preço: usuário insere valor manualmente.
3. Após preço definido, item é marcado como comprado (✓), label ganha estilo "riscado", subtotal é recalculado.
4. Barra de progresso é atualizada.

**Fluxo — desmarcar item:**
1. Usuário toca novamente no checkbox de um item já comprado.
2. Sistema desmarca o item (preço permanece salvo, mas item volta a "não comprado").

**Fluxo — adicionar item extra durante a compra:**
1. Usuário digita no campo "+ adicionar item extra..." (ou usa scan direto).
2. Sistema cria um novo `ItemCompra` com origem = **extra** (⚡), não comprado, sem preço.
3. Segue o mesmo fluxo de marcar como comprado (preço obrigatório via scan ou manual).

**Fluxo — ver histórico de preço de um item:**
1. Usuário toca no nome do produto (ícone 📈 ›).
2. Sistema navega para UC-06 (Histórico por produto).

**Fluxo — ajustar quantidade:**
1. Mesmo padrão do UC-02 (stepper +/−), aplicado ao `ItemCompra`.

**Fluxo — finalizar:**
1. Usuário toca em "✅ Finalizar Compra" na barra inferior fixa.
2. Sistema navega para UC-05 (Finalizar Compra).

**Regras de negócio:**
- RN-03.1: Um item **não pode** ser marcado como comprado sem preço definido — preço é obrigatório no momento do check.
- RN-03.2: O subtotal exibido na barra inferior soma apenas os itens **marcados como comprados**.
- RN-03.3: A barra de progresso considera **todos** os itens da compra (planejados + extras), comprados ou não.
- RN-03.4: Itens sem código de barras escaneado exibem "sem código escaneado" / "cod: XXXXXXXXXX" quando disponível.
- RN-03.5: O supermercado da compra pode ser trocado manualmente a qualquer momento antes de finalizar; a troca não afeta itens já marcados.
- RN-03.6: Se a geolocalização não estiver disponível ou for negada, o sistema deve permitir seleção manual do supermercado (fallback obrigatório, não pode travar o fluxo).
- RN-03.7: Preço sugerido ao escanear = último `PrecoHistorico` daquele Produto naquele Supermercado (se existir); caso contrário, último preço conhecido em qualquer mercado; caso não exista nenhum, campo em branco.

---

### UC-04 — Alternar entre Despensa e Carrinho
**Telas:** 2a / 2b (toggle no header)
**Ator:** Usuário

**Regras de negócio:**
- RN-04.1: O toggle só fica disponível/habilitado quando existe uma `Compra` em andamento; caso contrário, o modo Carrinho não é acessível a partir da Despensa (o caminho correto é via "Ir para o Carrinho").
- RN-04.2: Alternar entre os modos não altera o estado de nenhum item — é navegação pura entre visões.

---

### UC-05 — Finalizar Compra
**Tela:** 2c
**Ator:** Usuário
**Objetivo:** Encerrar a sessão de compra, consolidar resultados, atualizar Despensa e histórico.

**Fluxo principal:**
1. Sistema registra data/hora de finalização e o supermercado da compra.
2. Sistema calcula e exibe:
   - Total gasto (soma dos `ItemCompra` comprados).
   - Contagem "X/Y itens comprados".
3. Sistema classifica os itens em três blocos:
   - **✅ Comprados — saem da despensa**: `ItemCompra` com origem=planejado e comprado=true.
   - **⚡ Não planejados — comprados na hora**: `ItemCompra` com origem=extra e comprado=true.
   - **⏳ Não comprados — ficam na lista**: `ItemCompra` com comprado=false (independente da origem).
4. Sistema executa, na finalização:
   - Para cada item do bloco "Comprados — saem da despensa": remove o `ItemDespensa` correspondente e grava um `PrecoHistorico`.
   - Para cada item do bloco "Não planejados — comprados na hora": grava um `PrecoHistorico`, **não** cria `ItemDespensa` (já foi consumido).
   - Para cada item do bloco "Não comprados": **mantém** (ou recria, se tiver sido removido antes) o `ItemDespensa` na Despensa, sem registrar preço.
5. Marca a `Compra` como concluída (status: finalizada).
6. Exibe CTAs: "Ver Despensa" (volta para 2a) ou "Nova Compra" (reinicia o fluxo a partir de 2a/Home).

**Regras de negócio:**
- RN-05.1: Um item **extra e não comprado** (raro, mas possível se adicionado e depois desmarcado) **não** gera `ItemDespensa` — ele é descartado silenciosamente ao finalizar (não fazia parte da Despensa e não foi comprado), sem aviso ao usuário.
- RN-05.2: `PrecoHistorico` só é criado para itens efetivamente comprados (com preço definido).
- RN-05.3: A finalização é uma operação atômica — se falhar a gravação de qualquer parte (baixa de despensa, histórico de preço), a compra inteira deve poder ser reprocessada sem duplicar dados.
- RN-05.4: Depois de finalizada, uma `Compra` é somente leitura (não pode ser reaberta para edição).
- RN-05.5: "Nova Compra" só é permitido se não houver outra `Compra` em andamento no momento.

---

### UC-06 — Consultar Analítico (dashboard)
**Tela:** 4a
**Ator:** Usuário
**Objetivo:** Entender padrões de gasto e variação de preços.

**Fluxo principal:**
1. Usuário seleciona período: **Este mês** (padrão) / **3 meses** / **6 meses**.
2. Sistema recalcula e exibe:
   - Total gasto no período.
   - Variação percentual vs. o período anterior equivalente.
   - Número de compras (sessões finalizadas) no período.
   - Alertas (ver RN-06.2 e RN-06.3).
   - Gasto por categoria, em barras proporcionais ao maior valor, com valor em R$.
3. Usuário pode tocar em uma barra de categoria → navega para uma listagem filtrada de produtos daquela categoria (tela não detalhada no wireframe atual — pendência de design).
4. Usuário pode navegar para "Histórico por produto" (UC-07) ou "Comparativo de supermercados" (UC-08) via links de atalho.

**Regras de negócio:**
- RN-06.1: "Variação vs. período anterior" compara o total do período selecionado com o total do período imediatamente anterior de mesma duração (ex: mês atual vs. mês anterior; últimos 3 meses vs. os 3 meses antes desses).
- RN-06.2: **Alerta de alta de preço** é disparado quando o preço médio recente de um produto (janela curta, ex: últimas N compras) excede a média histórica do mesmo produto em um limiar configurável. Os valores do wireframe (18% de alta, 6 semanas de ausência — RN-06.3) são apenas **exemplos ilustrativos**, não definitivos: os limiares reais devem ser calibrados posteriormente a partir de dados de uso real (não hardcoded no frontend, e não fixados como constante definitiva no backend — tratar como parâmetro a ajustar). Exibe: nome do produto, % de alta, média histórica → preço atual.
- RN-06.3: **Alerta de ausência** é disparado quando um produto que historicamente é comprado com regularidade não aparece em nenhuma `Compra` finalizada há mais de N semanas. Mesma ressalva da RN-06.2: valor inicial é um placeholder sujeito a calibração futura com dados reais de uso.
- RN-06.4: "Gasto por categoria" soma apenas `ItemCompra` de compras **finalizadas** dentro do período selecionado (comprados=true).
- RN-06.5: Compras com status "em andamento" nunca entram em nenhum cálculo do Analítico.

---

### UC-07 — Consultar Histórico de Preço por Produto
**Tela:** 3b
**Ator:** Usuário
**Objetivo:** Entender a evolução de preço de um produto específico.

**Fluxo principal:**
1. Sistema recebe um Produto (via navegação a partir do Carrinho, Analítico ou Comparativo).
2. Sistema exibe, para os últimos 6 meses (fixo, ou parametrizável — a confirmar):
   - Último preço registrado.
   - Menor preço registrado no período.
   - Preço médio no período.
   - Gráfico de barras mensal do preço médio por mês.
   - Ranking de preço por supermercado (do menor para o maior), com 🏆 no supermercado mais barato.

**Regras de negócio:**
- RN-07.1: "Último preço" = preço do `PrecoHistorico` mais recente daquele produto, em qualquer supermercado.
- RN-07.2: O gráfico mensal usa o preço **médio** de todas as ocorrências daquele produto naquele mês (não o último, nem o menor).
- RN-07.3: O ranking por supermercado usa a **média histórica** de preço daquele produto naquele mercado (não o último preço pontual).
- RN-07.4: Se um produto tiver menos de 2 registros de `PrecoHistorico`, o gráfico e o ranking exibem os dados parciais disponíveis mesmo assim (ex: 1 ponto no gráfico), acompanhados de um badge/ícone de aviso indicando amostra pequena, em vez de ocultar a informação.

---

### UC-08 — Consultar Comparativo de Supermercados
**Tela:** 3c
**Ator:** Usuário
**Objetivo:** Comparar preços médios entre supermercados, produto a produto.

**Fluxo principal:**
1. Sistema exibe aviso de que os dados são baseados no histórico de compras registradas (não é preço em tempo real).
2. Sistema exibe cards-resumo por supermercado: "média menor em N itens" — contagem de produtos em que aquele mercado tem o menor preço médio.
3. Sistema exibe tabela: linhas = produtos, colunas = supermercados, célula = preço médio histórico daquele produto naquele mercado; célula com menor valor da linha é destacada com 🏆.

**Regras de negócio:**
- RN-08.1: Produtos com histórico em apenas 1 supermercado ainda aparecem na tabela (não há o que comparar), marcados com um badge/ícone de aviso indicando amostra insuficiente para comparação; a comparação com 🏆 só é aplicada a linhas com 2+ supermercados.
- RN-08.2: "Média menor em N itens" é recalculada a cada vez que a tela é aberta, com base no estado atual do histórico — não é um valor fixo/cacheado sem invalidação.
- RN-08.3: Empates (dois supermercados com a mesma média para um produto) destacam **ambos** com 🏆.

---

## 4. Regras de negócio consolidadas por domínio

### 4.1 Despensa
- Lista viva, sem conceito de "sessão" — persiste indefinidamente até os itens serem removidos ou comprados.
- Um mesmo Produto não pode ter dois `ItemDespensa` simultâneos (deduplicação: se o usuário adicionar algo já existente, soma a quantidade em vez de duplicar a linha).

### 4.2 Carrinho / Compra
- Uma compra tem exatamente um Supermercado associado.
- Preço é sempre obrigatório para marcar um item como comprado.
- Origem do item (planejado/extra) é definida na criação e **não muda** durante a compra.

### 4.3 Finalização
- É o único momento em que a Despensa é atualizada a partir de uma compra.
- É o único momento em que `PrecoHistorico` é criado.
- Operação deve ser transacional (tudo ou nada).

### 4.4 Precificação e Histórico
- Todo preço é sempre associado a: Produto + Supermercado + Data (via a Compra que o originou).
- Preço "atual"/"último" de um produto ignora o supermercado; preço "por mercado" sempre agrega/agrupa por supermercado.

### 4.5 Analítico
- Todos os cálculos são derivados exclusivamente de compras **finalizadas**.
- Períodos de comparação (mês/3m/6m) devem usar o fuso horário do usuário para definir os limites de data.
- Limiares de alerta (% de alta de preço, semanas de ausência) devem ser configuráveis no backend, não hardcoded no frontend.

---

## 5. Decisões (antes pontos em aberto, resolvidas em 2026-07-01)

1. **RN-01.3 / RN-02.4** — Compra pode ser iniciada com Despensa vazia (só itens extra). Se já há uma Compra em andamento, "Iniciar Compra" retoma a existente em vez de criar outra.
2. **RN-02.1** — Tocar "−" em quantidade = 1 remove o item diretamente da lista.
3. **RN-05.1** — Item extra adicionado e depois desmarcado antes de finalizar é descartado silenciosamente (sem aviso ao usuário).
4. **RN-06.2 / RN-06.3** — Os valores do wireframe (18% de alta, 6 semanas de ausência) são apenas exemplos ilustrativos. Os limiares reais de alerta devem ser calibrados a partir de dados de uso real, tratados como parâmetro ajustável no backend — não uma constante definitiva a hardcodar já na primeira versão.
5. **RN-07.4 / RN-08.1** — Produtos com histórico insuficiente (menos de 2 registros de preço, ou presentes em só 1 supermercado) ainda são exibidos, com um badge/ícone de aviso indicando amostra pequena — não são ocultados.
6. **RN-08.3** — Empates no comparativo de supermercados destacam ambos os mercados com 🏆.
7. **Categoria "Outros"** — Lista de categorias pré-definida, seedada no banco (Frutas, Laticínios, Carnes, Padaria, Higiene, etc.), com "Outros" como fallback para produtos novos não reconhecidos. Reclassificação manual pelo usuário fica disponível, mas criação livre de categorias não é escopo desta fase.
8. **Multiusuário** — Single-user por enquanto. "Família Silva" é apenas texto de saudação; uma conta = um usuário = uma Despensa/Carrinho. Sem modelagem de conta compartilhada, convites ou sincronização multi-dispositivo em tempo real nesta fase.
