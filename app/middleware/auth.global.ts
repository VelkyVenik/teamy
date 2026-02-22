export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useAuth()
  if (!loggedIn.value && to.path !== '/login') {
    return navigateTo('/login')
  }
})
