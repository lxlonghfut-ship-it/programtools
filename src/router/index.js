import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Translate from '../pages/Translate.vue'
import Checker from '../pages/Checker.vue'
import Solution from '../pages/Solution.vue'
import SolveData from '../pages/SolveData.vue'
// Use Chat.vue (Chat2 was a temporary replacement)
import Chat from '../pages/Chat.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/translate', component: Translate },
  { path: '/check', component: Checker },
  { path: '/solution', component: Solution },
  { path: '/solve', component: SolveData },
  { path: '/chat', component: Chat }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
