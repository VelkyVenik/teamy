export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useOidcAuth()
  if (!loggedIn.value && to.path !== '/login') {
    return navigateTo('/login')
  }
})
