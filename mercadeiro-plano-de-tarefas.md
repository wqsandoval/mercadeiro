# Mercadeiro — Plano de Desenvolvimento

**Stack:** Vue 3 + Composition API + Pinia + Vue Router + Tailwind (frontend) · Node.js + Fastify + Prisma + PostgreSQL (backend, local em dev / outro BD compatível em prod) · Geocoding via Nominatim/OpenStreetMap (gratuito, trocável no futuro) · Scanner via `BarcodeDetector` API + fallback `@zxing/browser` · Geolocalização via `navigator.geolocation`.

Baseado no wireframe `Lista de Compras - Wireframes.dc.html` (7 telas reais: 3a, 2a, 2b, 2c, 4a, 3b, 3c).

---

## Fase 0 — Fundação

- [x] 1. Estrutura do monorepo (`/frontend`, `/backend`)
- [x] 2. Setup Vue 3 + Vite + Tailwind + Pinia + Vue Router
- [x] 3. Setup Fastify + Prisma + PostgreSQL (docker local), config de ambiente (.env)
- [x] 4. Schema do banco: `Produto`, `Categoria`, `Supermercado`, `ItemDespensa`, `Compra`, `ItemCompra`, `PrecoHistorico`
- [x] 4a. Seed de categorias pré-definidas (Frutas, Laticínios, Carnes, Padaria, Higiene, Outros, etc.)
- [x] 5. Design tokens Vue (cores, fontes Caveat/Space Mono, sombras "sketchy") em CSS/Tailwind config
- [x] 6. Componentes base: `AppShell` (layout responsivo — substituiu `StatusBar`/`PhoneShell`, ver decisão 2026-07-03), `Checkbox`, `QtyStepper`, `CategoryHeader`, `Chip`, `Card`, `ProgressBar`, `TabToggle`

## Fase 1 — Backend: API core

- [x] 7. Endpoints CRUD de Produtos e Categorias
- [x] 8. Endpoints de Despensa (listar/adicionar/remover/atualizar qtd)
- [x] 9. Endpoints de Sessão de Compra (criar, adicionar item, marcar comprado, finalizar)
- [x] 10. Endpoints de Supermercados (CRUD + histórico de preço por loja)
- [x] 11. Endpoints de Analítico (agregações: gasto por categoria, por período, alertas de variação)
- [x] 11a. Camada de abstração para geocoding (interface trocável Nominatim ↔ Google Places no futuro)

## Fase 2 — Home (3a)

- [x] 12. Componente Home: header + saudação
- [x] 13. Cards de acesso (Despensa, Analítico) com contadores vindos da API
- [x] 14. CTA "Iniciar Compra" → cria sessão de compra

## Fase 3 — Despensa (2a)

- [x] 15. Input rápido de item + integração com API
- [x] 16. Lista agrupada por categoria, com qtd (+/−) e remoção
- [x] 17. CTA "Ir para o Carrinho"

## Fase 4 — Carrinho (2b)

- [x] 18. Toggle Despensa/Carrinho + geolocalização real (captura GPS ao abrir)
- [x] 19. Reverse geocoding do GPS → nome/endereço do supermercado (via Nominatim)
- [x] 20. Input de item extra + botão de scan
- [x] 21. Barra de progresso dinâmica
- [x] 22. Lista de itens com check, badge planejado/extra, preço, qtd
- [x] 23. Scanner de código de barras real (câmera) → busca produto por código na API
- [x] 24. Fallback "digitar preço" manual
- [x] 25. Barra inferior fixa: total parcial + finalizar

## Fase 5 — Finalizar Compra (2c)

- [ ] 26. Tela de confirmação com data/hora real + geoloc capturada
- [ ] 27. Resumo financeiro (total, X/Y itens)
- [ ] 28. Três blocos (comprados / extras / pendentes) vindos da sessão
- [ ] 29. Persistência: grava `Compra` + `PrecoHistorico` no backend
- [ ] 30. CTAs: Ver Despensa / Nova Compra

## Fase 6 — Analítico (4a)

- [ ] 31. Filtro de período (mês/3m/6m) consultando API
- [ ] 32. Cards de resumo financeiro
- [ ] 33. Alertas de variação de preço (lógica de comparação no backend)
- [ ] 34. Gráfico de gasto por categoria (barras clicáveis)
- [ ] 35. Navegação para 3b/3c

## Fase 7 — Histórico por produto (3b)

- [ ] 36. Header do produto + preço atual/menor/média
- [ ] 37. Gráfico de variação mensal (dados reais do backend)
- [ ] 38. Ranking de preço por supermercado

## Fase 8 — Comparativo de supermercados (3c)

- [ ] 39. Cards-resumo por mercado
- [ ] 40. Tabela comparativa por produto com melhor preço destacado

## Fase 9 — Integração e polish

- [ ] 41. Roteamento completo entre as 7 telas
- [ ] 42. Tratamento de erros (permissão de câmera negada, GPS indisponível, offline)
- [ ] 43. Revisão pixel-a-pixel comparada ao wireframe
- [ ] 44. Testes básicos dos endpoints principais

---

## Decisões registradas

- Geocoding: Nominatim/OSM por ora, camada abstraída para trocar por Google Places depois sem refatorar
- Banco de dados: PostgreSQL local (docker) em dev; outro BD compatível em produção (a definir)
- Scanner e geolocalização: integração real desde o início (câmera + GPS), não mockado
- Regras de negócio completas em `mercadeiro-regras-de-negocio.md` (casos de uso UC-01 a UC-08); pendências da seção 5 resolvidas em 2026-07-01:
  - Compra pode iniciar com Despensa vazia; "Iniciar Compra" retoma sessão em andamento se já existir uma
  - Stepper de quantidade remove o item ao decrementar de 1
  - Item extra desmarcado some silenciosamente ao finalizar (sem aviso)
  - Limiares de alerta do Analítico (% alta de preço, semanas de ausência) são parâmetros ajustáveis no backend, calibrados depois com dados reais — não hardcoded, não fixos na v1
  - Dados históricos insuficientes (produto/mercado) são exibidos com badge de aviso, não ocultados
  - Empates no comparativo de supermercados destacam ambos os mercados
  - Categorias: lista pré-definida seedada no banco + "Outros" como fallback
- Auth da API: bearer token único (app single-user), configurado em `API_BEARER_TOKEN` no `.env` do backend (decisão 2026-07-02). No frontend, o token **não** é embutido no build (evita expor em bundle público) — é colado manualmente numa tela de login e guardado em `localStorage` (`frontend/src/stores/auth.ts`); todas as rotas exigem sessão exceto `/login`
- Layout do frontend (decisão 2026-07-03): removida a simulação de celular do wireframe (`StatusBar` com relógio/sinal/bateria falsos + `PhoneShell` com dimensões fixas de iPhone). Substituído por `AppShell`, um container genuinamente responsivo (Tailwind breakpoints) — full-bleed no mobile, painel centralizado no desktop, sem simular hardware
  - Single-user por enquanto (sem conta compartilhada/família)
- Wireframe oficial localizado em `wireframes/app-web-de-lista-de-compras/project/Lista de Compras - Wireframes.dc.html` (adicionado ao repo em 2026-07-03, antes só era citado por nome)
- Carrinho (Fase 4, decisão 2026-07-03), conferido contra o wireframe real (tela `#2b`):
  - "Bloquear e oferecer método" (RN-03.1) é implementado como dois botões inline sempre visíveis ("📷 Escanear código" / "💲 digitar preço") abaixo de qualquer item não comprado — sem modal intermediário de "escolher método". Checkbox vazio abre o mesmo editor de preço inline
  - Item com preço já salvo (desmarcado antes) remarca comprado=true direto ao reclicar o checkbox, sem reabrir o editor — preço existente já satisfaz RN-03.1
  - Estado da Compra (itens, supermercado, subtotal, progresso) vive no Pinia store (`stores/compra.ts`), não local na view — a Fase 5 (tela 2c) precisa ler a mesma Compra em outra rota
  - `compraStore.carregarCompraAtual()` passou a ser chamado no mount de Despensa e Carrinho (antes só era populado após clicar em algum CTA), corrigindo o toggle Despensa/Carrinho ficando incorretamente desabilitado em reload/deep-link
  - Reverse geocoding é feito via `GET /geocoding/reverse` do próprio backend, nunca direto do browser ao Nominatim
  - Scanner de código de barras: `BarcodeDetector` nativo e `@zxing/browser` (import dinâmico) rodam em paralelo — quem detectar primeiro vence — em vez de um-ou-outro, porque `window.BarcodeDetector` pode existir em Chrome desktop sem o backend de detecção funcionar de fato (falha silenciosa, observado em Windows). Zxing configurado com hints restritos aos 5 formatos 1D relevantes (EAN-13/EAN-8/UPC-A/UPC-E/CODE-128) + `TRY_HARDER`. Além da detecção contínua, `ScannerModal` tem um botão "📸 Capturar" (fallback temporário) que congela o frame atual e tenta decodificar uma única vez, sem a pressão de tempo do loop contínuo — implementado como caminho adicional, não substitui a detecção em tempo real, para poder retomar/ajustar cada um independentemente depois. Campo de código digitado manualmente continua como último fallback e como seam determinística dos testes E2E (decodificação real de imagem não é simulável em Playwright headless)
  - **Pendência de validação pós-deploy**: testado exaustivamente em webcam de notebook (detecção contínua e captura estática) com múltiplos produtos físicos reais — todos falharam. Investigação descartou bug de formato/código (os códigos testados são EAN-13 válidos, checksum confere, mesmo formato de uma imagem de tela que funcionou) e confirmou visualmente, a partir de fotos, que a causa é qualidade de captura da webcam (desfoque de foco/movimento, reflexo de luz sobre o código, curvatura de embalagem cilíndrica) — não uma limitação do decodificador nem da implementação. Nenhum ajuste de software adicional é esperado para resolver isso nesse hardware específico. **Validação decisiva pendente: testar no smartphone real (autofoco de verdade) após o deploy.** Uso funcional no meio-tempo garantido pelo campo de código manual
  - Adiado para a Fase 7 (tela 3b ainda não existe): navegação "📈 ›" ao histórico do produto e a barra de legenda "toque no produto → histórico"
  - Tela Finalizar Compra (2c) ainda não implementada (Fase 5) — criado stub `FinalizarCompraView.vue` + rota `/carrinho/finalizar`, mesmo padrão usado por `CarrinhoView.vue` como stub nas Fases 2-3, para o botão "Finalizar Compra" ter destino real e testável
