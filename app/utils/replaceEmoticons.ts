const emoticons: Record<string, string> = {
  'O:)': '😇',
  '>:(': '😠',
  ":'(": '😢',
  ':-)': '😊',
  ':-(': '😞',
  ':-D': '😃',
  ';-)': '😉',
  ':-P': '😛',
  ':-O': '😮',
  ':-/': '😕',
  ':-|': '😐',
  ':-*': '😘',
  '</3': '💔',
  '<3': '❤️',
  ':)': '😊',
  ':(': '😞',
  ':D': '😃',
  ';)': '😉',
  ':P': '😛',
  ':O': '😮',
  ':/': '😕',
  ':|': '😐',
  ':*': '😘',
  'XD': '😆',
  'B)': '😎',
}

const escaped = Object.keys(emoticons)
  .sort((a, b) => b.length - a.length)
  .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const regex = new RegExp(`(^|\\s)(${escaped})(?=\\s|$)`, 'g')

export function replaceEmoticons(text: string): string {
  return text.replace(regex, (_, prefix: string, emoticon: string) => {
    return prefix + (emoticons[emoticon] ?? emoticon)
  })
}
