import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
    },
    {
      path: "/",
      name: "home",
      component: () => import("../views/HomeView.vue"),
    },
    {
      path: "/despensa",
      name: "despensa",
      component: () => import("../views/DespensaView.vue"),
    },
    {
      path: "/carrinho",
      name: "carrinho",
      component: () => import("../views/CarrinhoView.vue"),
    },
    {
      path: "/carrinho/finalizar",
      name: "finalizar-compra",
      component: () => import("../views/FinalizarCompraView.vue"),
    },
    {
      path: "/dev/showcase",
      name: "showcase",
      component: () => import("../views/DevShowcaseView.vue"),
    },
  ],
});

// Todas as rotas exigem token salvo (ver stores/auth.ts), exceto o login.
router.beforeEach((to) => {
  const auth = useAuthStore();

  if (to.name !== "login" && !auth.estaAutenticado) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.name === "login" && auth.estaAutenticado) {
    return { name: "home" };
  }
});

export default router;
