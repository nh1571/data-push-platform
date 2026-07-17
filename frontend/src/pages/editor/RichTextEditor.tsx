import { useMemo } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  /** Compact toolbar for push-shell (still full formatting). */
  compact?: boolean
  className?: string
}

const MODULES_FULL = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link'],
    ['clean'],
  ],
}

/** DingTalk-oriented: headers, bold/italic/strike, color, lists, link */
const MODULES_PUSH = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
}

const FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'list',
  'bullet',
  'align',
  'link',
]

/** Free-form rich text (HTML stored). Used by 文案组件 and 组装推送 shell. */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 180,
  compact = false,
  className,
}: Props) {
  const modules = compact ? MODULES_PUSH : MODULES_FULL
  const rootClass = className || (compact ? 'studio-rich-editor push-shell' : 'studio-rich-editor')
  const style = useMemo(
    () => ({
      background: '#fff',
    }),
    [],
  )

  return (
    <div className={rootClass} style={style}>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={(html) => onChange(html)}
        modules={modules}
        formats={FORMATS}
        placeholder={
          placeholder ||
          (compact
            ? '编写推送文案：标题/加粗/颜色/列表… 可用 {{字段名}} 插入数据'
            : '自由编写文案，可用工具栏设置标题/颜色/列表…')
        }
        style={{ minHeight }}
      />
      <style>{`
        .studio-rich-editor .ql-container,
        .push-shell .ql-container {
          min-height: ${minHeight}px;
          font-size: 14px;
        }
        .studio-rich-editor .ql-editor,
        .push-shell .ql-editor {
          min-height: ${minHeight}px;
        }
        .studio-rich-editor .ql-toolbar,
        .push-shell .ql-toolbar {
          border-radius: 6px 6px 0 0;
          background: #fafafa;
        }
        .studio-rich-editor .ql-container,
        .push-shell .ql-container {
          border-radius: 0 0 6px 6px;
        }
        .push-shell {
          border-radius: 6px;
        }
      `}</style>
    </div>
  )
}

/** True when Quill empty shell or blank string. */
export function isEmptyRichHtml(html: string | undefined | null): boolean {
  if (!html || !String(html).trim()) return true
  const plain = String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
  return !plain
}

/** Append ``{{col}}`` into rich HTML (end of last paragraph when possible). */
export function appendFieldToken(html: string, col: string): string {
  const token = `{{${col}}}`
  const cur = html || ''
  if (isEmptyRichHtml(cur)) return `<p>${token}</p>`
  if (/<\/p>\s*$/i.test(cur)) {
    return cur.replace(/<\/p>\s*$/i, `${token}</p>`)
  }
  return `${cur}<p>${token}</p>`
}

/** Detect HTML-ish content for preview rendering. */
export function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text || '')
}
