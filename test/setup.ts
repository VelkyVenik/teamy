// Provide Vue auto-imports as globals (mimicking Nuxt's auto-import behavior)
import { ref, reactive, computed, watch, readonly } from 'vue'

Object.assign(globalThis, { ref, reactive, computed, watch, readonly })

// Provide a working localStorage mock if the environment doesn't have one
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as Storage
}
