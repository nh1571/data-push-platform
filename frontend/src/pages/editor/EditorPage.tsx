import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Col,
  Input,
  message,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getPushJob,
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
  header_text: '',
  footer_text: '',
  include_markdown_table: true,
  extra_parts: [],
}

function extractDesign(renderSpec: PushJob['render_spec']): DesignSpec {
  if (renderSpec && typeof renderSpec === 'object' && !Array.isArray(renderSpec)) {
    const design = (renderSpec as Record<string, unknown>).design
    if (design && typeof design === 'object' && !Array.isArray(design)) {
      const d = design as Record<string, unknown>
      return {
        header_text: typeof d.header_text === 'string' ? d.header_text : '',
        footer_text: typeof d.footer_text === 'string' ? d.footer_text : '',
        include_markdown_table:
          typeof d.include_markdown_table === 'boolean' ? d.include_markdown_table : true,
        extra_parts: Array.isArray(d.extra_parts)
          ? d.extra_parts.filter((x): x is string => typeof x === 'string')
          : [],
        title: typeof d.title === 'string' ? d.title : undefined,
      }
    }
  }
  return { ...DEFAULT_DESIGN }
}

export function EditorPage() {
  const { jobId } = useParams<{ jobId?: string }>()
  const isNew = !jobId
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<DataSource[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const [name, setName] = useState('')
  const [dataSourceId, setDataSourceId] = useState<string | undefined>()
  const [sql, setSql] = useState('SELECT 1 AS n')
  const [headerText, setHeaderText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [includeMarkdownTable, setIncludeMarkdownTable] = useState(true)
  const [extraImageTable, setExtraImageTable] = useState(false)
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [skipIfEmpty, setSkipIfEmpty] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobId ?? null)

  const [previewColumns, setPreviewColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<unknown[][]>([])
  const [previewRowCount, setPreviewRowCount] = useState(0)
  const [markdownText, setMarkdownText] = useState('')

  const [querying, setQuerying] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)

  const design = useMemo<DesignSpec>(
    () => ({
      header_text: headerText || null,
      footer_text: footerText || null,
      include_markdown_table: includeMarkdownTable,
      extra_parts: extraImageTable ? ['image_table'] : [],
    }),
    [headerText, footerText, includeMarkdownTable, extraImageTable],
  )

  const loadMeta = useCallback(async () => {
    const [ds, ch] = await Promise.all([listDataSources(), listChannels()])
    setSources(ds)
    setChannels(ch)
  }, [])

  useEffect(() => {
    setLoading(true)
    loadMeta()
      .then(async () => {
        if (isNew) {
          setName('')
          setSql('SELECT 1 AS n')
          setHeaderText('')
          setFooterText('')
          setIncludeMarkdownTable(true)
          setExtraImageTable(false)
          setChannelIds([])
          setSkipIfEmpty(false)
          setEnabled(true)
          setCurrentJobId(null)
          setMarkdownText('')
          setPreviewColumns([])
          setPreviewRows([])
          setPreviewRowCount(0)
          return
        }
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
        setIncludeMarkdownTable(d.include_markdown_table ?? true)
        setExtraImageTable((d.extra_parts ?? []).includes('image_table'))
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [isNew, jobId, loadMeta])

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

  const onMessagePreview = async () => {
    if (!requireBasics()) return
    setPreviewing(true)
    try {
      const res = await messagePreview({
        data_source_id: dataSourceId!,
        sql,
        design,
        max_rows: 200,
      })
      setMarkdownText(res.markdown_text)
      message.success('消息预览已生成')
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
    if (!channelIds.length) {
      message.error('请至少选择一个通道')
      return
    }
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
      if (isNew || jobId !== saved.id) {
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
          if (v === null || v === undefined) return <Typography.Text type="secondary">null</Typography.Text>
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
              返回
            </Button>
            <Input
              style={{ width: 280 }}
              placeholder="任务名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
            <Typography.Text type="secondary">
              {isNew && !currentJobId ? '新建推送' : `编辑 ${currentJobId?.slice(0, 8) ?? ''}…`}
            </Typography.Text>
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

        <Input.TextArea
          rows={6}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          disabled={loading}
          placeholder="SELECT ..."
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', marginBottom: 16 }}
        />

        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              数据预览
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
              scroll={{ x: true, y: 360 }}
              pagination={{ pageSize: 50, size: 'small', showSizeChanger: false }}
              locale={{ emptyText: '点击「运行取数」预览结果' }}
            />
          </Col>
          <Col xs={24} lg={12}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              消息设计
            </Typography.Title>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                header_text（可用 {'{{列名}}'} 取首行）
              </Typography.Text>
              <Input.TextArea
                rows={3}
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                disabled={loading}
                placeholder="说明 {{col_name}}"
              />
            </div>
            <Space style={{ marginBottom: 12 }} wrap>
              <span>
                <Typography.Text style={{ marginRight: 8 }}>Markdown 表格</Typography.Text>
                <Switch
                  checked={includeMarkdownTable}
                  onChange={setIncludeMarkdownTable}
                  disabled={loading}
                />
              </span>
              <Checkbox
                checked={extraImageTable}
                onChange={(e) => setExtraImageTable(e.target.checked)}
                disabled={loading}
              >
                附加 image_table
              </Checkbox>
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
            <Button
              style={{ marginBottom: 12 }}
              loading={previewing}
              disabled={loading}
              onClick={() => void onMessagePreview()}
            >
              预览消息
            </Button>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              markdown_text
            </Typography.Text>
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                minHeight: 160,
                maxHeight: 320,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 13,
              }}
            >
              {markdownText || '点击「预览消息」生成'}
            </pre>
          </Col>
        </Row>

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              投递通道
            </Typography.Text>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              placeholder="选择一个或多个通道"
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
  )
}
