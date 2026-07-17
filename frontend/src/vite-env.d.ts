/**
 * Vite 环境类型声明。
 *
 * 扩展 ImportMetaEnv，使 `import.meta.env.VITE_*` 获得 TypeScript 提示。
 * 仅类型，无运行时代码。
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 基路径，默认 `/api`（见 api/client.ts） */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
