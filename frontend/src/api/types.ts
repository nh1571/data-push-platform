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
}

export interface PushJobCreate {
  name: string
  enabled?: boolean
  skip_if_empty?: boolean
  data_source_id: string
  query_sql: string
  render_spec: Record<string, unknown> | unknown[]
  channel_ids: string[]
  schedule_cron?: string | null
  schedule_enabled?: boolean
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
