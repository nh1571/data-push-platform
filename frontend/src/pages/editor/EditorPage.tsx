import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Col,
  ColorPicker,
  Input,
  message,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Color } from 'antd/es/color-picker'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPushJob,
  imagePreview,
  listChannels,
  listDataSources,
  messagePreview,
  queryPreview,
  saveJob,
  testPush,
} from '../../api'
import { getErrorMessage } from '../../api/client'
import type { Channel, DataSource, DesignSpec, PushJob } from '../../api/types'

const DEFAULT_DESIGN: DesignSpec = {
  output_mode: 'image',
  template_id: 'report_v1',
  theme_color: '#1677ff',
  header_text: '',
  footer_text: '',
  title: '',
  include_markdown_table: true,
  show_table: true,
  extra_parts: [],
  kpi_columns: [],
}

const TEMPLATE_OPTIONS = [
  { value: 'report_v1', label: '报告模板 (report_v1)' },
  { value: 'alert_v1', label: '告警模板 (alert_v1)' },
  { value: 'kpi_v1', label: 'KPI 模板 (kpi_v1)' },
]

function extractDesign(renderSpec: PushJob['render_spec']): DesignSpec {
  if (renderSpec && typeof renderSpec === 'object' && !Array.isArray(renderSpec)) {
    const design = (renderSpec as Record<string, unknown>).design
    if (design && typeof design === 'object' && !Array.isArray(design)) {
      const d = design as Record<string, unknown>
      const mode =
        typeof d.output_mode === 'string'
          ? d.output_mode
          : d.template_id
            ? 'image'
            : 'markdown'
      return {
        header_text: typeof d.header_text === 'string' ? d.header_text : '',
        footer_text: typeof d.footer_text === 'string' ? d.footer_text : '',
        include_markdown_table:
          typeof d.include_markdown_table === 'boolean' ? d.include_markdown_table : true,
        show_table: typeof d.show_table === 'boolean' ? d.show_table : true,
        extra_parts: Array.isArray(d.extra_parts)
          ? d.extra_parts.filter((x): x is string => typeof x === 'string')
          : [],
        title: typeof d.title === 'string' ? d.title : '',
        output_mode: mode,
        template_id: typeof d.template_id === 'string' ? d.template_id : 'report_v1',
        theme_color: typeof d.theme_color === 'string' ? d.theme_color : '#1677ff',
        kpi_columns: Array.isArray(d.kpi_columns)
          ? d.kpi_columns.filter((x): x is string => typeof x === 'string')
          : [],
      }
    }
  }
  return { ...DEFAULT_DESIGN }
}

function colorToHex(color: Color | string): string {
  if (typeof color === 'string') return color
  return color.toHexString()
}

export function EditorPage() {
  const { jobId } = useParams<{ jobId?: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<DataSource[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const [name, setName] = useState('')
  const [dataSourceId, setDataSourceId] = useState<string | undefined>()
  const [sql, setSql] = useState('-- 在编辑器中编写 SQL\nSELECT 1 AS demo')
  const [headerText, setHeaderText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [title, setTitle] = useState('')
  const [outputMode, setOutputMode] = useState<'image' | 'markdown'>('image')
  const [templateId, setTemplateId] = useState('report_v1')
  const [themeColor, setThemeColor] = useState('#1677ff')
  const [includeMarkdownTable, setIncludeMarkdownTable] = useState(true)
  const [showTable, setShowTable] = useState(true)
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [skipIfEmpty, setSkipIfEmpty] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobId ?? null)

  const [previewColumns, setPreviewColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<unknown[][]>([])
  const [previewRowCount, setPreviewRowCount] = useState(0)
  const [markdownText, setMarkdownText] = useState('')
  const [imageBase64, setImageBase64] = useState('')

  const [querying, setQuerying] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)

  const design = useMemo<DesignSpec>(
    () => ({
      output_mode: outputMode,
      template_id: templateId,
      theme_color: themeColor,
      title: title || null,
      header_text: headerText || null,
      footer_text: footerText || null,
      include_markdown_table: includeMarkdownTable,
      show_table: showTable,
      extra_parts: [],
      kpi_columns: [],
    }),
    [
      outputMode,
      templateId,
      themeColor,
      title,
      headerText,
      footerText,
      includeMarkdownTable,
      showTable,
    ],
  )

  const loadMeta = useCallback(async () => {
    const [ds, ch] = await Promise.all([listDataSources(), listChannels()])
    setSources(ds)
    setChannels(ch)
  }, [])

  useEffect(() => {
    if (!jobId) {
      return
    }
    setLoading(true)
    loadMeta()
      .then(async () => {
        const job = await getPushJob(jobId)
        setCurrentJobId(job.id)
        setName(job.name)
        setDataSourceId(job.data_source_id)
        setSql(job.query_sql)
        setChannelIds(job.channel_ids ?? [])
        setSkipIfEmpty(job.skip_if_empty)
        setEnabled(job.enabled)
        const d = extractDesign(job.render_spec)
        setHeaderText(d.header_text ?? '')
        setFooterText(d.footer_text ?? '')
        setTitle(d.title ?? '')
        setIncludeMarkdownTable(d.include_markdown_table ?? true)
        setShowTable(d.show_table ?? true)
        setOutputMode(d.output_mode === 'markdown' ? 'markdown' : 'image')
        setTemplateId(d.template_id || 'report_v1')
        setThemeColor(d.theme_color || '#1677ff')
        setMarkdownText('')
        setImageBase64('')
        setPreviewColumns([])
        setPreviewRows([])
        setPreviewRowCount(0)
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [jobId, loadMeta])

  if (!jobId) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="info"
          showIcon
          message="请从「推送任务」新建任务"
          description="内容编辑需要先有任务实体。请到推送任务列表创建任务后再进入编辑。"
          action={
            <Button type="primary" onClick={() => navigate('/push-jobs')}>
              去任务列表
            </Button>
          }
        />
      </div>
    )
  }

  const requireBasics = (): boolean => {
    if (!dataSourceId) {
      message.error('请选择数据源')
      return false
    }
    if (!sql.trim()) {
      message.error('请输入 SQL')
      return false
    }
    return true
  }

  const onQueryPreview = async () => {
    if (!requireBasics()) return
    setQuerying(true)
    try {
      const res = await queryPreview({
        data_source_id: dataSourceId!,
        sql,
        max_rows: 200,
      })
      setPreviewColumns(res.columns)
      setPreviewRows(res.rows)
      setPreviewRowCount(res.row_count)
      message.success(`取数成功：${res.row_count} 行（预览最多 200）`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setQuerying(false)
    }
  }

  const onPreview = async () => {
    if (!requireBasics()) return
    setPreviewing(true)
    try {
      if (outputMode === 'image') {
        const res = await imagePreview({
          data_source_id: dataSourceId!,
          sql,
          design,
          max_rows: 200,
        })
        setImageBase64(res.image_base64)
        // Also fetch markdown caption for fallback display
        const mdRes = await messagePreview({
          data_source_id: dataSourceId!,
          sql,
          design: { ...design, output_mode: 'markdown' },
          max_rows: 200,
        })
        setMarkdownText(mdRes.markdown_text)
        message.success('图片预览已生成')
      } else {
        const res = await messagePreview({
          data_source_id: dataSourceId!,
          sql,
          design,
          max_rows: 200,
        })
        setMarkdownText(res.markdown_text)
        setImageBase64('')
        message.success('消息预览已生成')
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setPreviewing(false)
    }
  }

  const onSave = async () => {
    if (!name.trim()) {
      message.error('请输入任务名称')
      return
    }
    if (!requireBasics()) return
    setSaving(true)
    try {
      const saved = await saveJob({
        id: currentJobId,
        name: name.trim(),
        data_source_id: dataSourceId!,
        query_sql: sql,
        design,
        channel_ids: channelIds,
        skip_if_empty: skipIfEmpty,
        enabled,
        schedule_cron: null,
        schedule_enabled: false,
      })
      setCurrentJobId(saved.id)
      message.success('保存成功')
      if (jobId !== saved.id) {
        navigate(`/editor/${saved.id}`, { replace: true })
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onTestPush = async () => {
    if (!requireBasics()) return
    if (!channelIds.length) {
      message.error('请至少选择一个通道')
      return
    }
    setPushing(true)
    try {
      const res = await testPush({
        data_source_id: dataSourceId!,
        sql,
        design,
        channel_ids: channelIds,
        push_job_id: currentJobId,
        max_rows: 200,
      })
      if (res.markdown_text) setMarkdownText(res.markdown_text)
      const okCount = res.deliveries.filter((d) => d.success).length
      const failCount = res.deliveries.length - okCount
      if (res.success) {
        message.success(`试推成功（${okCount} 通道，${res.row_count} 行）`)
      } else {
        const errors = res.deliveries
          .filter((d) => !d.success)
          .map((d) => d.error || '失败')
          .join('; ')
        message.error(`试推部分失败（成功 ${okCount} / 失败 ${failCount}）：${errors}`)
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setPushing(false)
    }
  }

  const tableColumns: ColumnsType<Record<string, unknown>> = useMemo(
    () =>
      previewColumns.map((col, colIdx) => ({
        title: col,
        dataIndex: col,
        key: `${col}-${colIdx}`,
        ellipsis: true,
        render: (v: unknown) => {
          if (v === null || v === undefined)
            return <Typography.Text type="secondary">null</Typography.Text>
          if (typeof v === 'object') return JSON.stringify(v)
          return String(v)
        },
      })),
    [previewColumns],
  )

  const tableData = useMemo(
    () =>
      previewRows.map((row, rowIdx) => {
        const record: Record<string, unknown> = { __key: rowIdx }
        previewColumns.forEach((col, colIdx) => {
          record[col] = row[colIdx]
        })
        return record
      }),
    [previewRows, previewColumns],
  )

  return (
    <div style={{ margin: -24 }}>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/push-jobs')}>
              返回任务列表
            </Button>
            <Typography.Title level={5} style={{ margin: 0 }}>
              编辑推送内容 · {name || '…'}
            </Typography.Title>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={loading}
              onClick={() => void onSave()}
            >
              保存
            </Button>
            <Button
              icon={<PlayCircleOutlined />}
              loading={pushing}
              disabled={loading}
              onClick={() => void onTestPush()}
            >
              试推
            </Button>
          </Space>
        </Space>
      </div>

      <div style={{ padding: 16 }}>
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              数据
            </Typography.Title>
            <Space style={{ marginBottom: 12, width: '100%' }} wrap>
              <Select
                style={{ minWidth: 260 }}
                showSearch
                optionFilterProp="label"
                placeholder="选择数据源"
                value={dataSourceId}
                disabled={loading}
                onChange={setDataSourceId}
                options={sources.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.type})`,
                }))}
              />
              <Button
                type="default"
                icon={<SearchOutlined />}
                loading={querying}
                disabled={loading}
                onClick={() => void onQueryPreview()}
              >
                运行取数
              </Button>
              <Space>
                <Typography.Text type="secondary">启用</Typography.Text>
                <Switch checked={enabled} onChange={setEnabled} disabled={loading} />
              </Space>
            </Space>

            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              SQL
            </Typography.Text>
            <Input.TextArea
              rows={8}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              disabled={loading}
              placeholder="SELECT ..."
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                marginBottom: 16,
              }}
            />

            <Typography.Title level={5}>
              数据表格
              {previewRowCount > 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                  {previewRowCount} 行
                </Typography.Text>
              ) : null}
            </Typography.Title>
            <Table
              size="small"
              rowKey="__key"
              columns={tableColumns}
              dataSource={tableData}
              scroll={{ x: true, y: 320 }}
              pagination={{ pageSize: 50, size: 'small', showSizeChanger: false }}
              locale={{ emptyText: '点击「运行取数」预览结果' }}
            />
          </Col>

          <Col xs={24} lg={12}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              输出设计
            </Typography.Title>

            <div style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                输出方式
              </Typography.Text>
              <Radio.Group
                value={outputMode}
                disabled={loading}
                onChange={(e) => setOutputMode(e.target.value)}
                options={[
                  { value: 'image', label: '图片模板' },
                  { value: 'markdown', label: '纯 Markdown' },
                ]}
                optionType="button"
                buttonStyle="solid"
              />
            </div>

            {outputMode === 'image' ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    模板
                  </Typography.Text>
                  <Select
                    style={{ width: '100%' }}
                    value={templateId}
                    disabled={loading}
                    onChange={setTemplateId}
                    options={TEMPLATE_OPTIONS}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    主题色
                  </Typography.Text>
                  <ColorPicker
                    value={themeColor}
                    disabled={loading}
                    onChange={(c) => setThemeColor(colorToHex(c))}
                    showText
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    标题（可用 {'{{列名}}'}）
                  </Typography.Text>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={loading}
                    placeholder="数据报告 {{name}}"
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    副标题 / header_text
                  </Typography.Text>
                  <Input.TextArea
                    rows={2}
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    disabled={loading}
                    placeholder="说明文字"
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    页脚 footer_text
                  </Typography.Text>
                  <Input
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    disabled={loading}
                    placeholder="数据来源 · 推送平台"
                  />
                </div>
                <Space style={{ marginBottom: 12 }}>
                  <Typography.Text>显示表格</Typography.Text>
                  <Switch checked={showTable} onChange={setShowTable} disabled={loading} />
                </Space>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    header_text（可用 {'{{列名}}'}）
                  </Typography.Text>
                  <Input.TextArea
                    rows={3}
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    disabled={loading}
                    placeholder="说明 {{col_name}}"
                  />
                </div>
                <Space style={{ marginBottom: 12 }}>
                  <Typography.Text style={{ marginRight: 8 }}>Markdown 表格</Typography.Text>
                  <Switch
                    checked={includeMarkdownTable}
                    onChange={setIncludeMarkdownTable}
                    disabled={loading}
                  />
                </Space>
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                    footer_text
                  </Typography.Text>
                  <Input.TextArea
                    rows={2}
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    disabled={loading}
                    placeholder="结尾"
                  />
                </div>
              </>
            )}

            <Button
              style={{ marginBottom: 12 }}
              loading={previewing}
              disabled={loading}
              onClick={() => void onPreview()}
            >
              预览
            </Button>

            {outputMode === 'image' ? (
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                  图片预览
                </Typography.Text>
                {imageBase64 ? (
                  <img
                    src={imageBase64}
                    alt="preview"
                    style={{
                      maxWidth: '100%',
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                      background: '#fff',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: 24,
                      background: '#fafafa',
                      border: '1px dashed #d9d9d9',
                      borderRadius: 6,
                      color: '#999',
                      textAlign: 'center',
                    }}
                  >
                    点击「预览」生成图片
                  </div>
                )}
              </div>
            ) : null}

            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Markdown {outputMode === 'image' ? '（说明 / 备用）' : ''}
            </Typography.Text>
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                minHeight: 120,
                maxHeight: 240,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 13,
              }}
            >
              {markdownText || '点击「预览」生成'}
            </pre>
          </Col>
        </Row>

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          {outputMode === 'image' ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="图片推送通道提示"
              description="当前为「图片模板」输出。请选择支持发图的通道：应用机器人·发群 / 单发 (OpenAPI)。Webhook 群机器人通常无法发送真图。"
            />
          ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              投递通道
              <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                发图请选 OpenAPI 机器人或工作通知
              </Typography.Text>
            </Typography.Text>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              placeholder="选择一个或多个通道（可稍后配置）"
              value={channelIds}
              disabled={loading}
              onChange={setChannelIds}
              options={channels.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.type})`,
              }))}
            />
          </div>
          <Space>
            <Typography.Text>结果为空时跳过</Typography.Text>
            <Switch checked={skipIfEmpty} onChange={setSkipIfEmpty} disabled={loading} />
          </Space>
        </div>
        </div>
      </div>
    </div>
  )
}
