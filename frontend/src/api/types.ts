/** Shared API response types matching backend schemas. */

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
}

export interface TestConnectionResult {
  ok: boolean
  message?: string | null
  detail?: unknown
}

export interface DataSource {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DataSourceCreate {
  name: string
  type: string
  config: Record<string, unknown>
}

export interface DataSourceUpdate {
  name?: string
  type?: string
  config?: Record<string, unknown>
}

export interface Channel {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ChannelCreate {
  name: string
  type: string
  config: Record<string, unknown>
}

export interface ChannelUpdate {
  name?: string
  type?: string
  config?: Record<string, unknown>
}

export interface PushJob {
  id: string
  name: string
  enabled: boolean
  skip_if_empty: boolean
  data_source_id: string
  query_sql: string
  render_spec: Record<string, unknown> | unknown[]
  channel_ids: string[]
  schedule_cron: string | null
  schedule_enabled: boolean
  created_at: string
  updated_at: string
  last_run_id?: string | null
  last_run_status?: string | null
  last_run_at?: string | null
}

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

export interface PushJobDraftCreate {
  name: string
  data_source_id: string
  enabled?: boolean
}

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

export interface JobRunLog {
  id: string
  job_run_id: string
  step: string
  level: string
  message: string
  created_at: string
}

export interface JobRunDetail extends JobRun {
  deliveries: Delivery[]
  logs: JobRunLog[]
}

export interface JobRunListParams {
  status?: string
  push_job_id?: string
  trigger_type?: string
  limit?: number
  offset?: number
}

export interface ApiToken {
  id: string
  name: string
  created_at: string
  revoked_at?: string | null
}

export interface ApiTokenCreated {
  id: string
  name: string
  token: string
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

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
  /** Color percentage-like cells (legacy report style). */
  color_ratios?: boolean
  kpi_columns?: string[]
}

export interface SqlParamDef {
  name: string
  label?: string
  /** auto | static | runtime */
  source?: 'auto' | 'static' | 'runtime' | string
  /** when source=auto: yesterday | today | now | … */
  auto?: string
  value?: string
  default?: string
  format?: string
}

export interface QueryPreviewRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  param_defs?: SqlParamDef[] | null
  max_rows?: number
}

export interface QueryPreviewResponse {
  columns: string[]
  rows: unknown[][]
  row_count: number
  resolved_params?: Record<string, string>
  rendered_sql?: string | null
}

export interface MessagePreviewRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  design?: DesignSpec | Record<string, unknown>
  max_rows?: number
}

export interface MessagePartPreview {
  kind: string
  content_preview: string
}

export interface MessagePreviewResponse {
  parts: MessagePartPreview[]
  markdown_text: string
}

export interface ImagePreviewRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  design?: DesignSpec | Record<string, unknown>
  max_rows?: number
}

export interface ImagePreviewResponse {
  image_base64: string
  path?: string | null
  content_type?: string
}

export interface TestPushRequest {
  data_source_id: string
  sql: string
  params?: Record<string, unknown> | null
  design?: DesignSpec | Record<string, unknown>
  channel_ids: string[]
  max_rows?: number
  push_job_id?: string | null
}

export interface ChannelSendResult {
  channel_id: string
  success: boolean
  provider_msg_id?: string | null
  error?: string | null
}

export interface TestPushResponse {
  row_count: number
  markdown_text: string
  deliveries: ChannelSendResult[]
  job_run_id?: string | null
  success: boolean
}

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
// Studio artboard
// ---------------------------------------------------------------------------

export type StudioComponentType =
  | 'Container'
  | 'Text'
  | 'Kpi'
  | 'Table'
  | 'Chart'
  | 'Alert'
  | 'Divider'

export interface StudioNode {
  id: string
  type: StudioComponentType | string
  props?: Record<string, unknown>
  binding?: Record<string, unknown>
  visible?: boolean
  children?: StudioNode[]
}

export interface StudioDataset {
  id: string
  name?: string
  data_source_id?: string | null
  sql?: string
  /** SQL parameter definitions (auto date etc.) */
  params?: SqlParamDef[]
  /** Optional static overrides for preview */
  param_values?: Record<string, string>
}

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
  tree?: StudioNode
  compose?: { mode?: string; markdown_caption?: boolean }
}

export interface StudioMeta {
  theme_packs: { id: string; label: string; color: string }[]
  table_styles: { id: string; label: string }[]
  chart_types: { id: string; label: string }[]
  components: { type: string; label: string }[]
}

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

export interface StudioTemplateCreate {
  name: string
  description?: string | null
  scene_id?: string | null
  artboard: ArtboardDoc
}

export interface StudioCompileRequest {
  artboard: ArtboardDoc
  data_source_id?: string | null
  sql?: string | null
  max_rows?: number
  want_image?: boolean
}

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
}

export interface StudioSaveJobRequest {
  id?: string | null
  name: string
  data_source_id: string
  query_sql: string
  artboard: ArtboardDoc
  channel_ids: string[]
  skip_if_empty?: boolean
  enabled?: boolean
  schedule_cron?: string | null
  schedule_enabled?: boolean
}

export interface StudioTestPushRequest {
  artboard: ArtboardDoc
  data_source_id: string
  sql: string
  channel_ids: string[]
  push_job_id?: string | null
  max_rows?: number
}
