import { api } from './client'
import type {
  ApiToken,
  ApiTokenCreated,
  Channel,
  ChannelCreate,
  ChannelUpdate,
  DataSource,
  DataSourceCreate,
  DataSourceUpdate,
  JobRun,
  JobRunDetail,
  JobRunListParams,
  MessagePreviewRequest,
  MessagePreviewResponse,
  PushJob,
  PushJobCreate,
  PushJobUpdate,
  QueryPreviewRequest,
  QueryPreviewResponse,
  SaveJobRequest,
  TestConnectionResult,
  TestPushRequest,
  TestPushResponse,
  TokenResponse,
} from './types'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(username: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/v1/auth/login', { username, password })
  return data
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

export async function listDataSources(): Promise<DataSource[]> {
  const { data } = await api.get<DataSource[]>('/v1/data-sources')
  return data
}

export async function getDataSource(id: string): Promise<DataSource> {
  const { data } = await api.get<DataSource>(`/v1/data-sources/${id}`)
  return data
}

export async function createDataSource(body: DataSourceCreate): Promise<DataSource> {
  const { data } = await api.post<DataSource>('/v1/data-sources', body)
  return data
}

export async function updateDataSource(id: string, body: DataSourceUpdate): Promise<DataSource> {
  const { data } = await api.put<DataSource>(`/v1/data-sources/${id}`, body)
  return data
}

export async function deleteDataSource(id: string): Promise<void> {
  await api.delete(`/v1/data-sources/${id}`)
}

export async function testDataSource(id: string): Promise<TestConnectionResult> {
  const { data } = await api.post<TestConnectionResult>(`/v1/data-sources/${id}/test`)
  return data
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export async function listChannels(): Promise<Channel[]> {
  const { data } = await api.get<Channel[]>('/v1/channels')
  return data
}

export async function getChannel(id: string): Promise<Channel> {
  const { data } = await api.get<Channel>(`/v1/channels/${id}`)
  return data
}

export async function createChannel(body: ChannelCreate): Promise<Channel> {
  const { data } = await api.post<Channel>('/v1/channels', body)
  return data
}

export async function updateChannel(id: string, body: ChannelUpdate): Promise<Channel> {
  const { data } = await api.put<Channel>(`/v1/channels/${id}`, body)
  return data
}

export async function deleteChannel(id: string): Promise<void> {
  await api.delete(`/v1/channels/${id}`)
}

export async function testChannel(id: string): Promise<TestConnectionResult> {
  const { data } = await api.post<TestConnectionResult>(`/v1/channels/${id}/test`)
  return data
}

// ---------------------------------------------------------------------------
// Push jobs
// ---------------------------------------------------------------------------

export async function listPushJobs(): Promise<PushJob[]> {
  const { data } = await api.get<PushJob[]>('/v1/push-jobs')
  return data
}

export async function getPushJob(id: string): Promise<PushJob> {
  const { data } = await api.get<PushJob>(`/v1/push-jobs/${id}`)
  return data
}

export async function createPushJob(body: PushJobCreate): Promise<PushJob> {
  const { data } = await api.post<PushJob>('/v1/push-jobs', body)
  return data
}

export async function updatePushJob(id: string, body: PushJobUpdate): Promise<PushJob> {
  const { data } = await api.put<PushJob>(`/v1/push-jobs/${id}`, body)
  return data
}

export async function deletePushJob(id: string): Promise<void> {
  await api.delete(`/v1/push-jobs/${id}`)
}

export async function runPushJob(
  id: string,
  body?: { params?: Record<string, unknown>; trigger_type?: string },
): Promise<JobRun> {
  const { data } = await api.post<JobRun>(`/v1/push-jobs/${id}/run`, body ?? {})
  return data
}

// ---------------------------------------------------------------------------
// Job runs
// ---------------------------------------------------------------------------

export async function listJobRuns(params?: JobRunListParams): Promise<JobRun[]> {
  const { data } = await api.get<JobRun[]>('/v1/job-runs', { params })
  return data
}

export async function getJobRun(id: string): Promise<JobRunDetail> {
  const { data } = await api.get<JobRunDetail>(`/v1/job-runs/${id}`)
  return data
}

export async function rerunJobRun(id: string): Promise<JobRun> {
  const { data } = await api.post<JobRun>(`/v1/job-runs/${id}/rerun`)
  return data
}

// ---------------------------------------------------------------------------
// API tokens
// ---------------------------------------------------------------------------

export async function listApiTokens(): Promise<ApiToken[]> {
  const { data } = await api.get<ApiToken[]>('/v1/api-tokens')
  return data
}

export async function createApiToken(name: string): Promise<ApiTokenCreated> {
  const { data } = await api.post<ApiTokenCreated>('/v1/api-tokens', { name })
  return data
}

export async function revokeApiToken(id: string): Promise<void> {
  await api.delete(`/v1/api-tokens/${id}`)
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export async function queryPreview(body: QueryPreviewRequest): Promise<QueryPreviewResponse> {
  const { data } = await api.post<QueryPreviewResponse>('/v1/editor/query-preview', body)
  return data
}

export async function messagePreview(
  body: MessagePreviewRequest,
): Promise<MessagePreviewResponse> {
  const { data } = await api.post<MessagePreviewResponse>('/v1/editor/message-preview', body)
  return data
}

export async function testPush(body: TestPushRequest): Promise<TestPushResponse> {
  const { data } = await api.post<TestPushResponse>('/v1/editor/test-push', body)
  return data
}

export async function saveJob(body: SaveJobRequest): Promise<PushJob> {
  const { data } = await api.post<PushJob>('/v1/editor/save-job', body)
  return data
}
