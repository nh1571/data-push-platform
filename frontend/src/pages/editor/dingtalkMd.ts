/**
 * 钉钉消息 Markdown 子集 — 预览与出站文本。
 *
 * 钉钉并非完整 CommonMark。本模块：
 * 1. 将工作台 Quill HTML 转为钉钉可用 MD（加粗/标题/列表/链接/font 色）
 * 2. 将钉钉 MD（或 HTML）转为手机预览用安全 HTML
 *
 * 参考钉钉开放平台：支持 # 标题、**加粗**、[链](url)、列表、
 * &lt;font color=#rrggbb&gt;文字&lt;/font&gt; 等；复杂 HTML 会被降级。
 */

/** 是否空富文本 */
export function isEmptyRich(html?: string | null): boolean {
  if (!html || !String(html).trim()) return true
  const plain = String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
  return !plain
}

/** Quill HTML → 钉钉 Markdown（出站） */
export function htmlToDingTalkMd(html: string): string {
  let s = String(html || '')
  if (!s.trim() || isEmptyRich(s)) return ''

  // 若已是纯文本 MD
  if (!/<[a-z][\s\S]*>/i.test(s)) return s.trim()

  s = s.replace(/\r\n/g, '\n')
  // br
  s = s.replace(/<br\s*\/?>/gi, '\n')
  // headers
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${stripTags(c).trim()}\n`)
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${stripTags(c).trim()}\n`)
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${stripTags(c).trim()}\n`)
  // bold / italic / strike
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) => `**${stripInline(c)}**`)
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) => `*${stripInline(c)}*`)
  s = s.replace(/<(s|strike|del)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) => `~~${stripInline(c)}~~`)
  // links
  s = s.replace(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, c) => `[${stripTags(c).trim() || href}](${href})`,
  )
  // font / span color → dingtalk font
  s = s.replace(
    /<(span|font)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_, _tag, attrs, c) => {
      const color = pickColor(String(attrs || ''))
      const inner = stripInline(c)
      if (color) return `<font color=${color}>${inner}</font>`
      return inner
    },
  )
  // lists
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `- ${stripTags(c).trim()}\n`)
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
  // paragraphs / divs
  s = s.replace(/<\/p>/gi, '\n')
  s = s.replace(/<p[^>]*>/gi, '')
  s = s.replace(/<\/div>/gi, '\n')
  s = s.replace(/<div[^>]*>/gi, '')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  return s
}

/**
 * 钉钉 MD / 简单 HTML → 预览用 HTML（手机气泡内展示）。
 * 仅输出有限标签，避免 XSS。
 */
export function dingTalkToPreviewHtml(input: string): string {
  let s = String(input || '').trim()
  if (!s) return ''
  // 若是 HTML 富文本，先转 MD 再渲染，保证与出站一致
  if (/<[a-z][\s\S]*>/i.test(s) && !s.includes('<font')) {
    s = htmlToDingTalkMd(s)
  }
  // escape first then re-enable limited markup
  let h = escapeHtml(s)
  // font color (already escaped — restore font tags carefully)
  h = h.replace(
    /&lt;font color=(#?[a-zA-Z0-9]+)&gt;([\s\S]*?)&lt;\/font&gt;/gi,
    (_, color, c) => `<span style="color:${sanitizeColor(color)}">${c}</span>`,
  )
  // bold italic strike
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  // headers
  h = h.replace(/^### (.+)$/gm, '<div style="font-size:15px;font-weight:600;margin:6px 0">$1</div>')
  h = h.replace(/^## (.+)$/gm, '<div style="font-size:16px;font-weight:700;margin:8px 0">$1</div>')
  h = h.replace(/^# (.+)$/gm, '<div style="font-size:17px;font-weight:700;margin:8px 0">$1</div>')
  // links
  h = h.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" style="color:#0089ff" target="_blank" rel="noreferrer">$1</a>',
  )
  // lists
  h = h.replace(/^- (.+)$/gm, '<div style="padding-left:8px">• $1</div>')
  h = h.replace(/^\d+\. (.+)$/gm, '<div style="padding-left:8px">$1</div>')
  // newlines
  h = h.replace(/\n/g, '<br/>')
  return h
}

function stripTags(s: string): string {
  return decodeEntities(String(s).replace(/<[^>]+>/g, ''))
}

function stripInline(s: string): string {
  // keep nested conversion simple
  let x = String(s)
  x = x.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
  x = x.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
  return stripTags(x)
}

function pickColor(attrs: string): string | null {
  const m1 = attrs.match(/color\s*=\s*["']?([^"'\s>]+)/i)
  if (m1) return normalizeColor(m1[1]!)
  const m2 = attrs.match(/color\s*:\s*([^;"']+)/i)
  if (m2) return normalizeColor(m2[1]!.trim())
  return null
}

function normalizeColor(c: string): string {
  const s = c.trim()
  const rgb = s.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i)
  if (rgb) {
    const r = Number(rgb[1]),
      g = Number(rgb[2]),
      b = Number(rgb[3])
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }
  if (s.startsWith('#')) return s
  return s
}

function sanitizeColor(c: string): string {
  const s = String(c || '').trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s
  if (/^[a-zA-Z]+$/.test(s)) return s
  return '#333'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
