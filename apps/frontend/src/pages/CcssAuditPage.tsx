import { useCallback, useMemo, useState } from 'react'
import { apiGet } from '../utils/api'
import '../styles/CcssAuditPage.css'

type StylePatchAuditRecord = {
  id: string
  request_id: string
  view: string
  state_id: string
  applied_recipe_ids: string[]
  rejection_code: string | null
  created_at: string
}

type TranspileAuditRecord = {
  id: string
  requested_by: string
  source_path: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  warnings: Array<Record<string, unknown>>
  errors: Array<Record<string, unknown>>
  created_at: string
}

type AuditListResponse<TRecord> = {
  data: TRecord[]
}

const STATUS_FILTERS = ['all', 'queued', 'running', 'succeeded', 'failed'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '監査ログ取得で不明なエラーが発生しました。'

export const CcssAuditPage = () => {
  const [bearerToken, setBearerToken] = useState('')
  const [limitInput, setLimitInput] = useState('20')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)
  const [stylePatches, setStylePatches] = useState<StylePatchAuditRecord[]>([])
  const [transpileJobs, setTranspileJobs] = useState<TranspileAuditRecord[]>([])

  const authHeaders = useMemo(() => {
    const trimmed = bearerToken.trim()
    return trimmed.length > 0
      ? { Authorization: `Bearer ${trimmed}` }
      : null
  }, [bearerToken])

  const loadAuditLogs = useCallback(async () => {
    if (!authHeaders) {
      setErrorMessage('監査APIの取得には管理者Bearer tokenが必要です。')
      return
    }

    const parsedLimit = Number(limitInput)
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
      setErrorMessage('取得件数は 1 以上 200 以下の整数で指定してください。')
      return
    }

    try {
      setIsLoading(true)
      setErrorMessage(null)

      const [stylePatchResponse, transpileResponse] = await Promise.all([
        apiGet<AuditListResponse<StylePatchAuditRecord>>('/api/ccss/audit/style-patches', {
          query: { limit: parsedLimit },
          headers: authHeaders,
        }),
        apiGet<AuditListResponse<TranspileAuditRecord>>('/api/ccss/audit/transpile-jobs', {
          query: {
            limit: parsedLimit,
            status: statusFilter === 'all' ? undefined : statusFilter,
          },
          headers: authHeaders,
        }),
      ])

      setStylePatches(stylePatchResponse.data)
      setTranspileJobs(transpileResponse.data)
      setLastLoadedAt(new Date().toLocaleString('ja-JP'))
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [authHeaders, limitInput, statusFilter])

  return (
    <section className="page-card ccss-audit-card">
      <h1 className="page-heading">CCSS 監査ログビュー</h1>
      <p className="status-text">
        管理者API（<code>/api/ccss/audit/*</code>）から
        style-patch / transpile の監査ログを確認します。
      </p>

      <div className="ccss-audit-controls">
        <input
          className="ccss-audit-token"
          placeholder="Bearer token（管理者）"
          value={bearerToken}
          onChange={(event) => setBearerToken(event.target.value)}
        />
        <input
          className="ccss-audit-limit"
          inputMode="numeric"
          value={limitInput}
          onChange={(event) => setLimitInput(event.target.value)}
          aria-label="取得件数"
        />
        <select
          className="ccss-audit-status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              status: {status}
            </option>
          ))}
        </select>
        <button type="button" className="button secondary" onClick={loadAuditLogs} disabled={isLoading}>
          {isLoading ? '取得中...' : '監査ログを取得'}
        </button>
      </div>

      {errorMessage && (
        <p className="error-text" role="alert">
          {errorMessage}
        </p>
      )}

      {lastLoadedAt && (
        <p className="status-text">最終取得: {lastLoadedAt}</p>
      )}

      <section className="ccss-audit-section">
        <h2 className="sub-heading">style-patch 監査 ({stylePatches.length})</h2>
        <ul className="ccss-audit-list">
          {stylePatches.map((record) => (
            <li key={record.id}>
              <strong>{record.created_at}</strong> / view: {record.view} / state: {record.state_id}
              {' '} / recipes: {record.applied_recipe_ids.length}
              {' '} / rejection: {record.rejection_code ?? '-'}
            </li>
          ))}
        </ul>
      </section>

      <section className="ccss-audit-section">
        <h2 className="sub-heading">transpile 監査 ({transpileJobs.length})</h2>
        <ul className="ccss-audit-list">
          {transpileJobs.map((record) => (
            <li key={record.id}>
              <strong>{record.created_at}</strong> / status: {record.status} / source: {record.source_path}
              {' '} / errors: {record.errors.length} / warnings: {record.warnings.length}
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
