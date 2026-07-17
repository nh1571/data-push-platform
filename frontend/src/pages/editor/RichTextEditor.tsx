import { useMemo } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

const MODULES = {
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

/** Free-form rich text for 文案 components (HTML stored). */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 180 }: Props) {
  const style = useMemo(
    () => ({
      background: '#fff',
    }),
    [],
  )

  return (
    <div className="studio-rich-editor" style={style}>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={(html) => onChange(html)}
        modules={MODULES}
        formats={FORMATS}
        placeholder={placeholder || '自由编写文案，可用工具栏设置标题/颜色/列表…'}
        style={{ minHeight }}
      />
      <style>{`
        .studio-rich-editor .ql-container {
          min-height: ${minHeight}px;
          font-size: 14px;
        }
        .studio-rich-editor .ql-editor {
          min-height: ${minHeight}px;
        }
        .studio-rich-editor .ql-toolbar {
          border-radius: 6px 6px 0 0;
        }
        .studio-rich-editor .ql-container {
          border-radius: 0 0 6px 6px;
        }
      `}</style>
    </div>
  )
}
