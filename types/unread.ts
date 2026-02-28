export interface ReadTimestamp {
  timestamp: string
  source: 'server' | 'local'
}

export interface UnreadStoreData {
  version: 1
  readTimestamps: Record<string, ReadTimestamp>
  lastKnownPreviewIds: Record<string, string>
  channelLastMessageTimes: Record<string, string>
}
