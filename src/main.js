import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Login from './components/Login.vue'
import Register from './components/Register.vue'
import Home from './components/Home.vue'
import { createAuthStore } from './store/auth'
import "./main.css"

// 路由配置
const routes = [
  { path: '/login', component: Login, meta: { requiresAuth: false } },
  { path: '/register', component: Register, meta: { requiresAuth: false } },
  { path: '/home', component: Home, meta: { requiresAuth: true } },
  { path: '/', redirect: '/home' },
  { path: '/:pathMatch(.*)*', redirect: '/home' }
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes
})

// 创建认证状态管理
const authStore = createAuthStore()

// 全局路由守卫
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const isAuthenticated = authStore.isAuthenticated

  if (requiresAuth && !isAuthenticated.value) {
    next('/login')
  } else if (to.path === '/login' && isAuthenticated.value) {
    next('/home')
  } else {
    next()
  }
})

// 创建应用实例并使用App作为根组件
const app = createApp(App)
app.use(router)

// 提供认证状态给所有组件
app.provide('authStore', authStore)

app.mount('#app')