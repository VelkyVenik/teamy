import type { PendingImage, SendMessagePayload } from '~/types/graph'

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

export async function buildMessagePayload(
  content: string,
  images: PendingImage[] = [],
): Promise<SendMessagePayload> {
  content = replaceEmoticons(content)

  let html = ''
  if (content.trim()) {
    html += `<p>${escapeHtml(content)}</p>`
  }

  if (images.length === 0) {
    return { body: { contentType: 'html', content: html } }
  }

  const hostedContents = await Promise.all(
    images.map(async (img) => {
      html += `<div><img src="../hostedContents/${img.id}/$value" alt="image" style="max-width:600px"></div>`
      const contentBytes = await fileToBase64(img.file)
      return {
        '@microsoft.graph.temporaryId': img.id,
        contentBytes,
        contentType: img.mimeType,
      }
    }),
  )

  return {
    body: { contentType: 'html', content: html },
    hostedContents,
  }
}
