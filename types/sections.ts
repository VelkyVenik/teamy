export interface SectionItem {
  type: 'chat' | 'channel'
  id: string
  teamId?: string
}

export interface Section {
  id: string
  label: string
  order: number
  isDefault: boolean
  items: SectionItem[]
}

export interface SectionsStoreData {
  sections: Section[]
  hiddenItemKeys: string[]
}
