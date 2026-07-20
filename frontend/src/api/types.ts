/**
 * 前后端共享的 API 类型定义。
 *
 * 字段命名与后端 Pydantic / JSON schema 对齐（snake_case）。
 * 分区：
 * - 认证 / 通用结果
 * - 数据源、通道、推送任务、执行记录、API Token
 * - 旧版编辑器（DesignSpec + message/image preview）
 * - Studio 画板（ArtboardDoc / StudioNode / compile）
 *
 * 仅类型，无运行时逻辑。
 */

// ---------------------------------------------------------------------------
// 认证与通用
// ---------------------------------------------------------------------------

/** 登录成功返回的 Bearer Token */
export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
}

/** 数据源/通道「测试连接」统一结果 */
export interface TestConnectionResult {
  ok: boolean
  message?: string | null
  detail?: unknown
}

// ---------------------------------------------------------------------------
// 数据源
// ---------------------------------------------------------------------------

/** 数据源实体（MySQL / Doris / SQLite / SQL Server 等） */
export interface DataSource {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** 创建数据源请求体 */
export interface DataSourceCreate {
  name: string
  type: string
  config: Record<string, unknown>
}

/** 更新数据源请求体（全可选） */
export interface DataSourceUpdate {
  name?: string
  type?: string
  config?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 通道（钉钉等投递目标）
// ---------------------------------------------------------------------------

/** 通道实体；type 如 dingtalk.webhook_robot / openapi_group_robot */
export interface Channel {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** 创建通道请求体 */
export interface ChannelCreate {
  name: string
  type: string
  config: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 通讯录（各通道上的用户/群标识）
// ---------------------------------------------------------------------------

/** 通讯录身份实体；kind 为 person / group / webhook */
export interface Identity {
  id: string
  name: string
  kind: 'person' | 'group' | 'webhook'
  channel_type: string
  external_id: string
  external_extra?: string | null
  external_name?: string | null
  created_at: string
  updated_at: string
}

/** 创建身份请求体 */
export interface IdentityCreate {
  name: string
  kind: 'person' | 'group' | 'webhook'
  channel_type: string
  external_id: string
  external_extra?: string | null
  external_name?: string | null
}

/** 更新身份请求体（全可选） */
export interface IdentityUpdate {
  name?: string
  kind?: 'person' | 'group' | 'webhook'
  channel_type?: string
  external_id?: string
  external_extra?: string | null
  external_name?: string | null
}

/** 收件人组实体 */
export interface RecipientGroup {
  id: string
  name: string
  channel_type: string
  member_ids: string[]
  member_count: number
  created_at: string
  updated_at: string
}

/** 创建收件人组请求体 */
export interface RecipientGroupCreate {
  name: string
  channel_type: string
  member_ids: string[]
}

/** 更新收件人组请求体 */
export interface RecipientGroupUpdate {
  name?: string
  member_ids?: string[]
}

/** 更新通道请求体（全可选） */
export interface ChannelUpdate {
  name?: string
  type?: string
  config?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 推送任务
// ---------------------------------------------------------------------------

/**
 * 推送任务：绑定数据源 + SQL + 渲染规格（含 Studio artboard）+ 通道列表。
 * 调度字段控制 cron 是否生效。
 */
export interface PushJob {
  id: string
  name: string
  enabled: boolean
  skip_if_empty: boolean
  data_source_id: string
  query_sql: string
  /** 旧 DesignSpec 或 Studio ArtboardDoc 等 */
  render_spec: Record<string, unknown> | unknown[]
  channel_ids: string[]
  push_target_ids: string[]
  schedule_cron: string | null
  schedule_enabled: boolean
  created_at: string
  updated_at: string
  last_run_id?: string | null
  last_run_status?: string | null
  last_run_at?: string | null
}

/** 完整创建推送任务 */
export interface PushJobCreate {
  name: string
  enabled?: boolean
  skip_if_empty?: boolean
  data_source_id: string
  query_sql: string
  render_spec: Record<string, unknown> | unknown[]
  channel_ids?: string[]
  schedule_cron?: string | null
  schedule_enabled?: boolean
}

/** 草稿任务（仅名称+数据源，随后进内容工作台完善） */
export interface PushJobDraftCreate {
  name: string
  data_source_id: string
  enabled?: boolean
}

/** 更新推送任务（全可选） */
export interface PushJobUpdate {
  name?: string
  enabled?: boolean
  skip_if_empty?: boolean
  data_source_id?: string
  query_sql?: string
  render_spec?: Record<string, unknown> | unknown[]
  channel_ids?: string[]
  schedule_cron?: string | null
  schedule_enabled?: boolean
}

// ---------------------------------------------------------------------------
// 执行记录（JobRun）
// ---------------------------------------------------------------------------

/** 单次任务运行摘要 */
export interface JobRun {
  id: string
  push_job_id: string
  status: string
  trigger_type: string
  trigger_meta?: Record<string, unknown> | null
  params?: Record<string, unknown> | null
  config_snapshot?: Record<string, unknown> | null
  parent_run_id?: string | null
  started_at: string
  finished_at?: string | null
  error_message?: string | null
  created_at: string
}

/** 单次通道投递结果 */
export interface Delivery {
  id: string
  job_run_id: string
  channel_id?: string | null
  status: string
  error_message?: string | null
  provider_msg_id?: string | null
  started_at: string
  finished_at?: string | null
}

/** 运行步骤日志 */
export interface JobRunLog {
  id: string
  job_run_id: string
  step: string
  level: string
  message: string
  created_at: string
}

/** 运行详情 = 摘要 + 投递列表 + 日志 */
export interface JobRunDetail extends JobRun {
  deliveries: Delivery[]
  logs: JobRunLog[]
}

/** 列表筛选查询参数 */
export interface JobRunListParams {
  status?: string
  push_job_id?: string
  trigger_type?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// API Token（机器调用）
// ---------------------------------------------------------------------------

/** Token 列表项（不含明文 token） */
export interface ApiToken {
  id: string
  name: string
  created_at: string
  revoked_at?: string | null
}

/** 创建 Token 时一次性返回完整 token 明文 */
export interface ApiTokenCreated {
  id: string
  name: string
  token: string
}

// ---------------------------------------------------------------------------
// 旧版编辑器：DesignSpec + 预览/试推
// ---------------------------------------------------------------------------

/** 传统设计规格（非 Studio 画板时使用） */
export interface DesignSpec {
  header_text?: string | null
  footer_text?: string | null
  include_markdown_table?: boolean
  extra_parts?: string[]
  title?: string | null
  output_mode?: 'markdown' | 'image' | string | null
  template_id?: 'report_v1' | 'alert_v1' | 'kpi_v1' | string | null
  theme_color?: string | null
  show_table?: boolean
  /** 是否对百分比类单元格着色（旧日报风格） */
  color_ratios?: boolean
  kpi_columns?: string[]
}

/**
 * SQL 参数定义。
 * source=auto 时由服务端按 auto 种类（yesterday/today/now…）解析；
 * static 用 value；runtime 运行时注入。
 */
export interface SqlParamDef {
  name: string
  label?: string
  /** auto | static | runtime */
  source?: 'auto' | 'static' | 'runtime' | string
  /** source=auto 时：yesterday | today | now | … */
  auto?: string
  value?: string
  default?: string
  format?: string
}

/** 查询预览请求 */
export interface QueryPreviewRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  param_defs?: SqlParamDef[] | null
  max_rows?: number
}

/** 查询预览响应：列 + 行矩阵 */
export interface QueryPreviewResponse {
  columns: string[]
  rows: unknown[][]
  row_count: number
  resolved_params?: Record<string, string>
  rendered_sql?: string | null
}

/** 消息（Markdown）预览请求 */
export interface MessagePreviewRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  design?: DesignSpec | Record<string, unknown>
  max_rows?: number
}

/** 消息分段预览 */
export interface MessagePartPreview {
  kind: string
  content_preview: string
}

/** 消息预览响应 */
export interface MessagePreviewResponse {
  parts: MessagePartPreview[]
  markdown_text: string
}

/** 图片预览请求 */
export interface ImagePreviewRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  design?: DesignSpec | Record<string, unknown>
  max_rows?: number
}

/** 图片预览：base64 与可选路径 */
export interface ImagePreviewResponse {
  image_base64: string
  path?: string | null
  content_type?: string
}

/** 试推请求 */
export interface TestPushRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  design?: DesignSpec | Record<string, unknown>
  channel_ids: string[]
  push_target_ids?: string[]
  max_rows?: number
  push_job_id?: string | null
}

/** 单通道发送结果 */
export interface ChannelSendResult {
  channel_id: string
  success: boolean
  provider_msg_id?: string | null
  error?: string | null
}

/** 试推汇总结果 */
export interface TestPushResponse {
  row_count: number
  markdown_text: string
  deliveries: ChannelSendResult[]
  job_run_id?: string | null
  success: boolean
}

/** 旧版保存任务请求 */
export interface SaveJobRequest {
  id?: string | null
  name: string
  data_source_id: string
  query_sql: string
  design?: DesignSpec | Record<string, unknown>
  channel_ids: string[]
  skip_if_empty?: boolean
  schedule_cron?: string | null
  schedule_enabled?: boolean
  enabled?: boolean
}

// ---------------------------------------------------------------------------
// Studio 画板（内容工作台）
// ---------------------------------------------------------------------------

/** 画板组件类型枚举 */
export type StudioComponentType =
  | 'Container'
  | 'Text'
  | 'Kpi'
  | 'Table'
  | 'Chart'
  | 'Alert'
  | 'Divider'

/**
 * 画板节点树节点。
 * props 存展示/布局属性；binding 存数据集与列绑定；children 形成树。
 */
export interface StudioNode {
  id: string
  type: StudioComponentType | string
  props?: Record<string, unknown>
  binding?: Record<string, unknown>
  visible?: boolean
  children?: StudioNode[]
}

/** 画板内一个可独立 SQL 取数的数据集 */
export interface StudioDataset {
  id: string
  name?: string
  data_source_id?: string | null
  sql?: string
  /** SQL 参数定义（自动日期等） */
  params?: SqlParamDef[]
  /** 预览时可选的静态参数覆盖 */
  param_values?: Record<string, string>
}

/** 单个推送画布（可有多个；组装推送可组合） */
export interface StudioCanvasBoard {
  id: string
  name: string
  width?: number
  show_chrome?: boolean
  chrome_title?: string
  theme?: { pack?: string; color?: string; table_style?: string }
  /** 该画布的组件树（root Container + 清单子节点） */
  tree: StudioNode
}

/**
 * 推送消息段落：文案 或 某一画布成图。
 * 顺序即钉钉消息 parts 顺序。
 */
export type StudioComposeSegment =
  | { id: string; type: 'text'; html?: string }
  | { id: string; type: 'canvas'; canvas_id: string }

/**
 * 完整画板文档，序列化进 PushJob.render_spec。
 * 含主题/画布尺寸、多数据集、多画布、组件树，以及推送外壳 compose。
 */
export interface ArtboardDoc {
  version?: number
  kind?: string
  scene_id?: string
  artboard?: {
    width?: number
    height?: number | null
    theme?: { pack?: string; color?: string; table_style?: string }
    layout_default?: string
    show_chrome?: boolean
    chrome_title?: string
  }
  datasets?: StudioDataset[]
  /**
   * 组件库（做组件步骤产出的库存）。
   * 组装画布从中挑选放到画布，不自动全部铺上。
   */
  library?: StudioNode[]
  /** @deprecated 请用 canvases；保留以兼容旧任务 */
  tree?: StudioNode
  /** 多画布列表（推荐） */
  canvases?: StudioCanvasBoard[]
  /**
   * 推送消息外壳：多画布图 + 交错富文本。
   * 正式推送时 HTML 文案会转成钉钉 Markdown 子集。
   */
  compose?: {
    mode?: 'image_primary' | 'markdown_primary' | 'mixed' | 'image_only' | string
    /** @deprecated 请用 include_component_md / text_before|after */
    markdown_caption?: boolean
    /** 是否自动追加组件树投影出的 Markdown */
    include_component_md?: boolean
    /** 钉钉 markdown 标题（纯文本） */
    title?: string
    /**
     * @deprecated 优先用 segments；兼容单画布时的图前文案
     */
    text_before?: string
    /**
     * @deprecated 优先用 segments；兼容单画布时的图后文案
     */
    text_after?: string
    /** text 的内容格式；使用富文本编辑器时默认为 html */
    text_format?: 'html' | 'markdown' | string
    /** 消息段落顺序（文案 / 画布交错） */
    segments?: StudioComposeSegment[]
  }
}

/** PushTarget 内嵌身份摘要 */
export interface PushTargetIdentity {
  id: string
  name: string
  kind: string
  external_id: string
}

/** 推送目标 = 通道能力 + 目的身份的组合实体 */
export interface PushTarget {
  id: string
  name: string
  channel_id: string
  kind: string
  channel_type: string
  identities: PushTargetIdentity[]
  created_at: string
  updated_at: string
}

/** 创建 PushTarget 请求 */
export interface PushTargetCreate {
  channel_id: string
  identity_ids: string[]
}

/** 更新 PushTarget 请求 */
export interface PushTargetUpdate {
  channel_id?: string | null
  identity_ids?: string[] | null
}

/** Studio 元数据：主题包、表样式、图表类型、组件清单 */
export interface StudioMeta {
  theme_packs: { id: string; label: string; color: string }[]
  table_styles: { id: string; label: string }[]
  chart_types: { id: string; label: string }[]
  components: { type: string; label: string }[]
}

/** 用户/系统保存的画板模板 */
export interface StudioTemplate {
  id: string
  name: string
  artboard: ArtboardDoc
  description?: string | null
  scene_id?: string | null
  is_system?: boolean
  enabled?: boolean
  created_at?: string | null
  updated_at?: string | null
}

/** 创建 Studio 模板请求体 */
export interface StudioTemplateCreate {
  name: string
  description?: string | null
  scene_id?: string | null
  artboard: ArtboardDoc
}

/** Studio 编译请求：取数 + 渲染 HTML/图/Markdown */
export interface StudioCompileRequest {
  artboard: ArtboardDoc
  data_source_id?: string | null
  sql?: string | null
  max_rows?: number
  want_image?: boolean
}

/** Studio 编译响应：预览素材 + 解析后的参数 */
export interface StudioCompileResponse {
  html: string
  markdown_text: string
  image_base64?: string | null
  image_path?: string | null
  row_count: number
  parts: MessagePartPreview[]
  artboard: ArtboardDoc
  image_error?: string | null
  ok?: boolean
  /** 本次编译使用的参数（如 yesterday → 2026-07-16） */
  resolved_params?: Record<string, string>
  resolved_params_by_dataset?: Record<string, Record<string, string>>
}

/** Studio 保存任务请求 */
export interface StudioSaveJobRequest {
  id?: string | null
  name: string
  data_source_id: string
  query_sql: string
  artboard: ArtboardDoc
  channel_ids: string[]
  push_target_ids?: string[]
  skip_if_empty?: boolean
  enabled?: boolean
  schedule_cron?: string | null
  schedule_enabled?: boolean
}

/** Studio 试推请求 */
export interface StudioTestPushRequest {
  artboard: ArtboardDoc
  data_source_id: string
  sql: string
  channel_ids: string[]
  push_target_ids?: string[]
  push_job_id?: string | null
  max_rows?: number
}
