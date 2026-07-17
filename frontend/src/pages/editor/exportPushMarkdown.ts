/**
 * 导出「可临时用其他工具试推」的钉钉 Markdown 文本。
 *
 * 开发环境连不上正式推送通道时：复制本 MD + 自备图片文件，到任意钉钉机器人/推送工具验证版式。
 * 图片不内嵌 base64（体积大且多数机器人不认），默认用相对文件名占位。
 */
import { htmlToDingTalkMd, isEmptyRich } from './dingtalkMd'

export type ExportMarkdownInput = {
  /** 钉钉 markdown.title / 通知标题 */
  title?: string
  /** 图前 HTML 或已是 MD */
  textBefore?: string
  /** 图后 HTML 或已是 MD */
  textAfter?: string
  /** 是否包含图片占位（image_primary 等） */
  includeImage?: boolean
  /** Markdown 中的图片文件名/路径，用户可改到推送环境路径 */
  imageRef?: string
  /** 可选：图片 alt */
  imageAlt?: string
  /** 是否附加使用说明注释 */
  withGuide?: boolean
}

/** 将 HTML/MD 模板规范成钉钉出站 MD 正文 */
export function toDingTalkBody(raw?: string | null): string {
  if (!raw || isEmptyRich(raw)) return ''
  const s = String(raw).trim()
  if (!s) return ''
  // 已是偏 MD 的纯文本：仍走转换可清理残留标签
  return htmlToDingTalkMd(s) || s
}

/**
 * 组装一条钉钉机器人常用的 markdown 正文：
 * 图前 → ![图](path) → 图后
 */
export function buildExportMarkdown(input: ExportMarkdownInput): string {
  const title = String(input.title || '数据推送').trim() || '数据推送'
  const before = toDingTalkBody(input.textBefore)
  const after = toDingTalkBody(input.textAfter)
  const includeImage = input.includeImage !== false
  const imageRef = String(input.imageRef || 'push-image.png').trim() || 'push-image.png'
  const imageAlt = String(input.imageAlt || '推送图').trim() || '推送图'

  const blocks: string[] = []

  if (input.withGuide !== false) {
    blocks.push(
      [
        '<!--',
        '  临时试推用 Markdown（本机导出）',
        `  标题(title)：${title}`,
        `  图片：请将编译出的 PNG 放到推送环境，路径与下方一致（当前：${imageRef}）`,
        '  钉钉机器人：msgtype=markdown，title 用上面标题，text 用全文（可去掉本注释）',
        '-->',
        '',
      ].join('\n'),
    )
  }

  // 正文里再写一级标题，方便在支持 MD 的客户端里扫一眼（钉钉会渲染 #）
  blocks.push(`# ${title}`)
  blocks.push('')

  if (before) {
    blocks.push(before)
    blocks.push('')
  }

  if (includeImage) {
    blocks.push(`![${imageAlt}](${imageRef})`)
    blocks.push('')
  }

  if (after) {
    blocks.push(after)
    blocks.push('')
  }

  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** 触发浏览器下载文本文件 */
export function downloadTextFile(filename: string, content: string, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** dataURL / base64 → 下载 PNG */
export function downloadImageBase64(filename: string, dataUrlOrB64: string) {
  let href = dataUrlOrB64
  if (!href.startsWith('data:')) {
    href = `data:image/png;base64,${href}`
  }
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

/** 复制到剪贴板（失败时抛错） */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (!ok) throw new Error('复制失败')
}
