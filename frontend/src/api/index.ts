/**
 * 业务 API 封装层。
 *
 * 每个函数对应后端 `/v1/...` 端点，统一返回解包后的 `data`。
 * 认证 Token 由 `./client` 拦截器注入；错误请用 `getErrorMessage` 展示。
 *
 * 分区：Auth / 数据源 / 通道 / 推送任务 / 执行记录 / API Token / 旧编辑器 / Studio。
 */
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
  Identity,
  IdentityCreate,
  IdentityUpdate,
  JobRun,
  JobRunDetail,
  JobRunListParams,
  ImagePreviewRequest,
  ImagePreviewResponse,
  MessagePreviewRequest,
  MessagePreviewResponse,
  PushJob,
  PushJobCreate,
  PushJobDraftCreate,
  PushJobUpdate,
  RecipientGroup,
  RecipientGroupCreate,
  RecipientGroupUpdate,
  QueryPreviewRequest,
  QueryPreviewResponse,
  SaveJobRequest,
  StudioCompileRequest,
  StudioCompileResponse,
  StudioMeta,
  StudioSaveJobRequest,
  StudioTemplate,
  StudioTemplateCreate,
  StudioTestPushRequest,
  TestConnectionResult,
  TestPushRequest,
  TestPushResponse,
  TokenResponse,
} from './types'

// ---------------------------------------------------------------------------
// 认证
// ---------------------------------------------------------------------------

/** 用户名密码登录，返回 access_token */
export async function login(username: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/v1/auth/login', { username, password })
  return data
}

// ---------------------------------------------------------------------------
// 数据源
// ---------------------------------------------------------------------------

/** 列出全部数据源 */
export async function listDataSources(): Promise<DataSource[]> {
  const { data } = await api.get<DataSource[]>('/v1/data-sources')
  return data
}

/** 按 id 获取数据源 */
export async function getDataSource(id: string): Promise<DataSource> {
  const { data } = await api.get<DataSource>(`/v1/data-sources/${id}`)
  return data
}

/** 新建数据源 */
export async function createDataSource(body: DataSourceCreate): Promise<DataSource> {
  const { data } = await api.post<DataSource>('/v1/data-sources', body)
  return data
}

/** 更新数据源 */
export async function updateDataSource(id: string, body: DataSourceUpdate): Promise<DataSource> {
  const { data } = await api.put<DataSource>(`/v1/data-sources/${id}`, body)
  return data
}

/** 删除数据源 */
export async function deleteDataSource(id: string): Promise<void> {
  await api.delete(`/v1/data-sources/${id}`)
}

/** 测试数据源连通性 */
export async function testDataSource(id: string): Promise<TestConnectionResult> {
  const { data } = await api.post<TestConnectionResult>(`/v1/data-sources/${id}/test`)
  return data
}

// ---------------------------------------------------------------------------
// 通道
// ---------------------------------------------------------------------------

/** 列出全部投递通道 */
export async function listChannels(): Promise<Channel[]> {
  const { data } = await api.get<Channel[]>('/v1/channels')
  return data
}

/** 按 id 获取通道 */
export async function getChannel(id: string): Promise<Channel> {
  const { data } = await api.get<Channel>(`/v1/channels/${id}`)
  return data
}

/** 新建通道 */
export async function createChannel(body: ChannelCreate): Promise<Channel> {
  const { data } = await api.post<Channel>('/v1/channels', body)
  return data
}

/** 更新通道 */
export async function updateChannel(id: string, body: ChannelUpdate): Promise<Channel> {
  const { data } = await api.put<Channel>(`/v1/channels/${id}`, body)
  return data
}

/** 删除通道 */
export async function deleteChannel(id: string): Promise<void> {
  await api.delete(`/v1/channels/${id}`)
}

/** 测试通道配置是否可用 */
export async function testChannel(id: string): Promise<TestConnectionResult> {
  const { data } = await api.post<TestConnectionResult>(`/v1/channels/${id}/test`)
  return data
}

// ---------------------------------------------------------------------------
// 推送目标（PushTarget = 通道能力 + 目的身份的组合实体）
// ---------------------------------------------------------------------------

/** 列出全部推送目标（含内嵌身份详情） */
export async function listPushTargets(): Promise<import('./types').PushTarget[]> {
  const { data } = await api.get<import('./types').PushTarget[]>('/v1/push-targets')
  return data
}

export async function getPushTarget(id: string): Promise<import('./types').PushTarget> {
  const { data } = await api.get<import('./types').PushTarget>(`/v1/push-targets/${id}`)
  return data
}

export async function createPushTarget(
  body: import('./types').PushTargetCreate,
): Promise<import('./types').PushTarget> {
  const { data } = await api.post<import('./types').PushTarget>('/v1/push-targets', body)
  return data
}

export async function updatePushTarget(
  id: string,
  body: import('./types').PushTargetUpdate,
): Promise<import('./types').PushTarget> {
  const { data } = await api.put<import('./types').PushTarget>(`/v1/push-targets/${id}`, body)
  return data
}

export async function deletePushTarget(id: string): Promise<void> {
  await api.delete(`/v1/push-targets/${id}`)
}

// ---------------------------------------------------------------------------
// 通讯录（各通道上的用户/群标识）
// ---------------------------------------------------------------------------

/** 列出全部身份（可选 ?kind=person&channel_type=dingtalk 筛选） */
export async function listIdentities(params?: {
  kind?: string
  channel_type?: string
}): Promise<Identity[]> {
  const { data } = await api.get<Identity[]>('/v1/identities', { params })
  return data
}

/** 按 id 获取身份 */
export async function getIdentity(id: string): Promise<Identity> {
  const { data } = await api.get<Identity>(`/v1/identities/${id}`)
  return data
}

/** 新建身份 */
export async function createIdentity(body: IdentityCreate): Promise<Identity> {
  const { data } = await api.post<Identity>('/v1/identities', body)
  return data
}

/** 更新身份 */
export async function updateIdentity(id: string, body: IdentityUpdate): Promise<Identity> {
  const { data } = await api.put<Identity>(`/v1/identities/${id}`, body)
  return data
}

/** 删除身份 */
export async function deleteIdentity(id: string): Promise<void> {
  await api.delete(`/v1/identities/${id}`)
}

// ---------------------------------------------------------------------------
// 收件人组
// ---------------------------------------------------------------------------

/** 列出全部收件人组 */
export async function listRecipientGroups(params?: {
  channel_type?: string
}): Promise<RecipientGroup[]> {
  const { data } = await api.get<RecipientGroup[]>('/v1/recipient-groups', { params })
  return data
}

/** 按 id 获取收件人组 */
export async function getRecipientGroup(id: string): Promise<RecipientGroup> {
  const { data } = await api.get<RecipientGroup>(`/v1/recipient-groups/${id}`)
  return data
}

/** 新建收件人组 */
export async function createRecipientGroup(body: RecipientGroupCreate): Promise<RecipientGroup> {
  const { data } = await api.post<RecipientGroup>('/v1/recipient-groups', body)
  return data
}

/** 更新收件人组 */
export async function updateRecipientGroup(
  id: string,
  body: RecipientGroupUpdate,
): Promise<RecipientGroup> {
  const { data } = await api.put<RecipientGroup>(`/v1/recipient-groups/${id}`, body)
  return data
}

/** 删除收件人组 */
export async function deleteRecipientGroup(id: string): Promise<void> {
  await api.delete(`/v1/recipient-groups/${id}`)
}

// ---------------------------------------------------------------------------
// 推送任务
// ---------------------------------------------------------------------------

/** 列出全部推送任务 */
export async function listPushJobs(): Promise<PushJob[]> {
  const { data } = await api.get<PushJob[]>('/v1/push-jobs')
  return data
}

/** 按 id 获取推送任务 */
export async function getPushJob(id: string): Promise<PushJob> {
  const { data } = await api.get<PushJob>(`/v1/push-jobs/${id}`)
  return data
}

/** 完整创建推送任务 */
export async function createPushJob(body: PushJobCreate): Promise<PushJob> {
  const { data } = await api.post<PushJob>('/v1/push-jobs', body)
  return data
}

/** 创建草稿任务（仅名称+数据源，随后进编辑器完善） */
export async function createDraftPushJob(body: PushJobDraftCreate): Promise<PushJob> {
  const { data } = await api.post<PushJob>('/v1/push-jobs/draft', body)
  return data
}

/** 更新推送任务 */
export async function updatePushJob(id: string, body: PushJobUpdate): Promise<PushJob> {
  const { data } = await api.put<PushJob>(`/v1/push-jobs/${id}`, body)
  return data
}

/** 删除推送任务 */
export async function deletePushJob(id: string): Promise<void> {
  await api.delete(`/v1/push-jobs/${id}`)
}

/**
 * 立即触发任务运行。
 * @param body.params 可选运行时参数；trigger_type 覆盖触发类型
 */
export async function runPushJob(
  id: string,
  body?: { params?: Record<string, unknown>; trigger_type?: string },
): Promise<JobRun> {
  const { data } = await api.post<JobRun>(`/v1/push-jobs/${id}/run`, body ?? {})
  return data
}

// ---------------------------------------------------------------------------
// 执行记录
// ---------------------------------------------------------------------------

/** 分页/筛选列出 JobRun */
export async function listJobRuns(params?: JobRunListParams): Promise<JobRun[]> {
  const { data } = await api.get<JobRun[]>('/v1/job-runs', { params })
  return data
}

/** 获取运行详情（含 deliveries、logs） */
export async function getJobRun(id: string): Promise<JobRunDetail> {
  const { data } = await api.get<JobRunDetail>(`/v1/job-runs/${id}`)
  return data
}

/** 基于当前运行重跑（复制参数，用最新任务配置） */
export async function rerunJobRun(id: string): Promise<JobRun> {
  const { data } = await api.post<JobRun>(`/v1/job-runs/${id}/rerun`)
  return data
}

// ---------------------------------------------------------------------------
// API Token（机器调用 Bearer）
// ---------------------------------------------------------------------------

/** 列出 API Token（不含明文） */
export async function listApiTokens(): Promise<ApiToken[]> {
  const { data } = await api.get<ApiToken[]>('/v1/api-tokens')
  return data
}

/** 创建 Token；返回体含一次性明文 token */
export async function createApiToken(name: string): Promise<ApiTokenCreated> {
  const { data } = await api.post<ApiTokenCreated>('/v1/api-tokens', { name })
  return data
}

/** 撤销 Token */
export async function revokeApiToken(id: string): Promise<void> {
  await api.delete(`/v1/api-tokens/${id}`)
}

// ---------------------------------------------------------------------------
// 旧版编辑器预览 / 试推 / 保存
// ---------------------------------------------------------------------------

/** SQL 查询预览（返回列与行样本） */
export async function queryPreview(body: QueryPreviewRequest): Promise<QueryPreviewResponse> {
  const { data } = await api.post<QueryPreviewResponse>('/v1/editor/query-preview', body)
  return data
}

/**
 * 解析 SQL 中的参数占位符与内置变量（yesterday 等）。
 * 用于编辑器「参数」面板与取数前预览。
 */
export async function resolveSqlParams(body: {
  sql: string
  param_defs?: import('./types').SqlParamDef[]
  params?: Record<string, unknown>
}): Promise<{
  placeholders: string[]
  resolved: Record<string, string>
  builtins: Record<string, string>
  auto_kinds: { id: string; label: string; example: string }[]
}> {
  const { data } = await api.post('/v1/editor/studio/resolve-params', body)
  return data
}

/** Markdown 消息预览 */
export async function messagePreview(
  body: MessagePreviewRequest,
): Promise<MessagePreviewResponse> {
  const { data } = await api.post<MessagePreviewResponse>('/v1/editor/message-preview', body)
  return data
}

/** 渲染图预览（base64） */
export async function imagePreview(body: ImagePreviewRequest): Promise<ImagePreviewResponse> {
  const { data } = await api.post<ImagePreviewResponse>('/v1/editor/image-preview', body)
  return data
}

/** 试推到选定通道 */
export async function testPush(body: TestPushRequest): Promise<TestPushResponse> {
  const { data } = await api.post<TestPushResponse>('/v1/editor/test-push', body)
  return data
}

/** 旧版保存任务（DesignSpec） */
export async function saveJob(body: SaveJobRequest): Promise<PushJob> {
  const { data } = await api.post<PushJob>('/v1/editor/save-job', body)
  return data
}

// ---------------------------------------------------------------------------
// Studio 内容工作台
// ---------------------------------------------------------------------------

/** 列出 Studio 模板 */
export async function listStudioTemplates(): Promise<StudioTemplate[]> {
  const { data } = await api.get<StudioTemplate[]>('/v1/editor/studio/templates')
  return data
}

/** 创建 Studio 模板 */
export async function createStudioTemplate(body: StudioTemplateCreate): Promise<StudioTemplate> {
  const { data } = await api.post<StudioTemplate>('/v1/editor/studio/templates', body)
  return data
}

/** 删除 Studio 模板 */
export async function deleteStudioTemplate(id: string): Promise<void> {
  await api.delete(`/v1/editor/studio/templates/${id}`)
}

/** 获取 Studio 元数据（主题/组件等） */
export async function getStudioMeta(): Promise<StudioMeta> {
  const { data } = await api.get<StudioMeta>('/v1/editor/studio/meta')
  return data
}

/** 编译画板：取数 + HTML/图/Markdown */
export async function studioCompile(body: StudioCompileRequest): Promise<StudioCompileResponse> {
  const { data } = await api.post<StudioCompileResponse>('/v1/editor/studio/compile', body)
  return data
}

/** 保存 Studio 任务（artboard 写入 render_spec） */
export async function studioSaveJob(body: StudioSaveJobRequest): Promise<PushJob> {
  const { data } = await api.post<PushJob>('/v1/editor/studio/save-job', body)
  return data
}

/** Studio 试推 */
export async function studioTestPush(body: StudioTestPushRequest): Promise<TestPushResponse> {
  const { data } = await api.post<TestPushResponse>('/v1/editor/studio/test-push', body)
  return data
}
