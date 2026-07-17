/**
 * 富文本编辑器封装（ReactQuill / Quill snow 主题）。
 *
 * 用途：
 * - 文案组件内容
 * - 步骤 4「组装推送」图外 text_before / text_after 外壳
 *
 * 存储格式为 HTML；推送时由后端转钉钉 Markdown。
 * 支持 `{{字段名}}` 占位，预览时用数据集第一行替换。
 *
 * 附带工具：
 * - isEmptyRichHtml：判断是否空壳
 * - appendFieldToken：在 HTML 末尾插入 {{col}}
 * - looksLikeHtml：预览时是否按 HTML 渲染
 */
import { useMemo } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  /** 精简工具栏（推送外壳仍保留常用格式） */
  compact?: boolean
  className?: string
}

/** 完整工具栏：标题、加粗、颜色背景、列表、对齐、链接 */
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

/** 钉钉向精简工具栏：去掉背景色与对齐，降低 Markdown 转换损失 */
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

/** Quill formats 白名单（与 toolbar 对应） */
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

/**
 * 自由富文本编辑器（HTML 存储）。
 * compact=true 时用于推送外壳，工具栏更贴合钉钉能力。
 */
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
      {/* 局部样式：保证编辑区最小高度与圆角 */}
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

/** 判断 Quill 空壳或纯空白（去标签后无可见字符） */
export function isEmptyRichHtml(html: string | undefined | null): boolean {
  if (!html || !String(html).trim()) return true
  const plain = String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
  return !plain
}

/**
 * 在富文本 HTML 末尾插入 `{{col}}`。
 * 若以 `</p>` 结尾则塞进最后一段，否则追加新段落。
 */
export function appendFieldToken(html: string, col: string): string {
  const token = `{{${col}}}`
  const cur = html || ''
  if (isEmptyRichHtml(cur)) return `<p>${token}</p>`
  if (/<\/p>\s*$/i.test(cur)) {
    return cur.replace(/<\/p>\s*$/i, `${token}</p>`)
  }
  return `${cur}<p>${token}</p>`
}

/** 粗略判断内容是否像 HTML（预览分支选择） */
export function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text || '')
}
