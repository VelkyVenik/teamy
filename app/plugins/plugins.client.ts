export default defineNuxtPlugin(async () => {
  const { loadBundledPlugins } = usePlugins()
  await loadBundledPlugins()
})
