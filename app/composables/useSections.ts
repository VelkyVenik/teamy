import type { Section, SectionItem, SectionsStoreData } from '~~/types/sections'

const STORE_KEY = 'sections'
const LS_KEY = 'teamy-sections'

function createDefaultSections(): Section[] {
  return [
    { id: 'favorites', label: 'Favorites', order: 0, isDefault: true, items: [] },
    { id: 'other', label: 'Other chats', order: 999, isDefault: true, items: [] },
  ]
}

function itemKey(item: SectionItem): string {
  return item.type === 'channel' ? `${item.teamId}:${item.id}` : item.id
}

// Module-level shared state — init with defaults so sections render immediately
const sections = ref<Section[]>(createDefaultSections())
const hiddenItemKeys = ref<Set<string>>(new Set())
const loaded = ref(false)

let storeInstance: any = null

async function getStore() {
  if (storeInstance) return storeInstance
  const { LazyStore } = await import('@tauri-apps/plugin-store')
  storeInstance = new LazyStore('sections.json')
  return storeInstance
}

function readLocalStorage(): SectionsStoreData | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SectionsStoreData
  }
  catch {
    return null
  }
}

function buildStoreData(): SectionsStoreData {
  return {
    sections: sections.value,
    hiddenItemKeys: [...hiddenItemKeys.value],
  }
}

function writeLocalStorage() {
  localStorage.setItem(LS_KEY, JSON.stringify(buildStoreData()))
}

export function useSections() {
  const { isTauri } = useTauri()

  async function persist() {
    if (isTauri.value) {
      try {
        const store = await getStore()
        await store.set(STORE_KEY, buildStoreData())
        await store.save()
      }
      catch (err) {
        console.warn('[useSections] Failed to persist to store:', err)
      }
    }
    else {
      writeLocalStorage()
    }
  }

  async function load() {
    if (loaded.value) return

    let data: SectionsStoreData | null = null

    if (isTauri.value) {
      try {
        const store = await getStore()
        data = (await store.get(STORE_KEY)) as SectionsStoreData | undefined ?? null
      }
      catch (err) {
        console.warn('[useSections] Failed to load from store:', err)
      }
    }
    else {
      data = readLocalStorage()
    }

    sections.value = data?.sections?.length ? data.sections : createDefaultSections()
    hiddenItemKeys.value = new Set(data?.hiddenItemKeys ?? [])
    loaded.value = true
  }

  const sortedSections = computed(() =>
    [...sections.value].sort((a, b) => a.order - b.order),
  )

  function createSection(label: string) {
    const maxOrder = Math.max(...sections.value.filter(s => s.id !== 'other').map(s => s.order), 0)
    sections.value = [...sections.value, {
      id: crypto.randomUUID(),
      label,
      order: maxOrder + 1,
      isDefault: false,
      items: [],
    }]
    persist()
  }

  function renameSection(id: string, label: string) {
    const exists = sections.value.find(s => s.id === id && !s.isDefault)
    if (!exists) return
    sections.value = sections.value.map(s =>
      s.id === id ? { ...s, label } : s,
    )
    persist()
  }

  function deleteSection(id: string) {
    const removed = sections.value.find(s => s.id === id && !s.isDefault)
    if (!removed) return
    sections.value = sections.value
      .filter(s => s.id !== id)
      .map((s) => {
        if (s.id === 'other' && removed.items.length > 0) {
          return { ...s, items: [...s.items, ...removed.items] }
        }
        return s
      })
    persist()
  }

  function moveItem(item: SectionItem, targetSectionId: string) {
    // Unhide if it was hidden
    const key = itemKey(item)
    if (hiddenItemKeys.value.has(key)) {
      hiddenItemKeys.value = new Set([...hiddenItemKeys.value].filter(k => k !== key))
    }

    sections.value = sections.value.map((section) => {
      const filtered = section.items.filter(
        i => !(i.type === item.type && i.id === item.id),
      )
      if (section.id === targetSectionId && targetSectionId !== 'other') {
        return { ...section, items: [...filtered, item] }
      }
      return filtered.length !== section.items.length ? { ...section, items: filtered } : section
    })
    persist()
  }

  function hideItem(item: SectionItem) {
    const key = itemKey(item)
    hiddenItemKeys.value = new Set([...hiddenItemKeys.value, key])
    // Also remove from any explicit section
    sections.value = sections.value.map((section) => {
      const filtered = section.items.filter(
        i => !(i.type === item.type && i.id === item.id),
      )
      return filtered.length !== section.items.length ? { ...section, items: filtered } : section
    })
    persist()
  }

  function unhideItem(item: SectionItem) {
    const key = itemKey(item)
    hiddenItemKeys.value = new Set([...hiddenItemKeys.value].filter(k => k !== key))
    persist()
  }

  function isHidden(item: SectionItem): boolean {
    return hiddenItemKeys.value.has(itemKey(item))
  }

  function getAssignedItemIds(): Set<string> {
    const ids = new Set<string>()
    for (const section of sections.value) {
      if (section.id === 'other') continue
      for (const item of section.items) {
        ids.add(itemKey(item))
      }
    }
    return ids
  }

  /** Channels explicitly placed in sidebar sections (Favorites + custom groups). */
  const watchedChannelItems = computed(() => {
    const result: Array<{ teamId: string; channelId: string }> = []
    for (const section of sections.value) {
      if (section.id === 'other') continue
      for (const item of section.items) {
        if (item.type === 'channel' && item.teamId) {
          result.push({ teamId: item.teamId, channelId: item.id })
        }
      }
    }
    return result
  })

  return {
    sections,
    hiddenItemKeys,
    loaded,
    sortedSections,
    watchedChannelItems,
    load,
    createSection,
    renameSection,
    deleteSection,
    moveItem,
    hideItem,
    unhideItem,
    isHidden,
    getAssignedItemIds,
  }
}
