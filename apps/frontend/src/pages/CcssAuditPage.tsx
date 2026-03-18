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

type StateEventAuditRecord = {
  id: string
  session_key: string
  state_id: string
  event_name: string
  request_id: string | null
  patch_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

type SessionTraceItem = {
  eventId: string
  createdAt: string
  sessionKey: string
  stateId: string
  eventName: string
  requestId: string | null
  patchId: string | null
  payload: Record<string, unknown>
  correlation: 'patch_id' | 'request_id' | null
  patch: {
    patchId: string
    requestId: string
    view: string
    stateId: string
    appliedRecipeIds: string[]
    rejectionCode: string | null
    createdAt: string
  } | null
}

type SessionTraceResponse = {
  sessionKey: string
  data: SessionTraceItem[]
  stats: {
    eventCount: number
    correlatedPatchCount: number
    uncorrelatedEventCount: number
  }
}

type AuditListResponse<TRecord> = {
  data: TRecord[]
}

const STATUS_FILTERS = ['all', 'queued', 'running', 'succeeded', 'failed'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '監査ログ取得で不明なエラーが発生しました。'

const toQueryString = (value: string): string | undefined => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const summarizePayload = (payload: Record<string, unknown>): string => {
  const keys = Object.keys(payload)
  if (keys.length === 0) {
    return '-'
  }
  const preview = keys.slice(0, 3).join(', ')
  return keys.length > 3 ? `${preview} ... (${keys.length} keys)` : preview
}

export const CcssAuditPage = () => {
  const [bearerToken, setBearerToken] = useState('')
  const [limitInput, setLimitInput] = useState('20')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [styleViewFilter, setStyleViewFilter] = useState('')
  const [styleStateFilter, setStyleStateFilter] = useState('')
  const [styleRejectionFilter, setStyleRejectionFilter] = useState('')
  const [styleRequestFilter, setStyleRequestFilter] = useState('')
  const [stylePatchFilter, setStylePatchFilter] = useState('')
  const [eventSessionFilter, setEventSessionFilter] = useState('')
  const [eventStateFilter, setEventStateFilter] = useState('')
  const [eventNameFilter, setEventNameFilter] = useState('')
  const [eventRequestFilter, setEventRequestFilter] = useState('')
  const [eventPatchFilter, setEventPatchFilter] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)
  const [stylePatches, setStylePatches] = useState<StylePatchAuditRecord[]>([])
  const [transpileJobs, setTranspileJobs] = useState<TranspileAuditRecord[]>([])
  const [stateEvents, setStateEvents] = useState<StateEventAuditRecord[]>([])
  const [sessionTrace, setSessionTrace] = useState<SessionTraceItem[]>([])
  const [sessionTraceSessionKey, setSessionTraceSessionKey] = useState<string | null>(null)
  const [sessionTraceStats, setSessionTraceStats] = useState<SessionTraceResponse['stats'] | null>(null)

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

      const sessionTraceTarget = toQueryString(eventSessionFilter)
      const [stylePatchResponse, transpileResponse, stateEventResponse, sessionTraceResponse] = await Promise.all([
        apiGet<AuditListResponse<StylePatchAuditRecord>>('/api/ccss/audit/style-patches', {
          query: {
            limit: parsedLimit,
            view: toQueryString(styleViewFilter),
            stateId: toQueryString(styleStateFilter),
            rejectionCode: toQueryString(styleRejectionFilter),
            requestId: toQueryString(styleRequestFilter),
            patchId: toQueryString(stylePatchFilter),
          },
          headers: authHeaders,
        }),
        apiGet<AuditListResponse<TranspileAuditRecord>>('/api/ccss/audit/transpile-jobs', {
          query: {
            limit: parsedLimit,
            status: statusFilter === 'all' ? undefined : statusFilter,
          },
          headers: authHeaders,
        }),
        apiGet<AuditListResponse<StateEventAuditRecord>>('/api/ccss/audit/state-events', {
          query: {
            limit: parsedLimit,
            sessionKey: toQueryString(eventSessionFilter),
            stateId: toQueryString(eventStateFilter),
            eventName: toQueryString(eventNameFilter),
            requestId: toQueryString(eventRequestFilter),
            patchId: toQueryString(eventPatchFilter),
          },
          headers: authHeaders,
        }),
        sessionTraceTarget
          ? apiGet<SessionTraceResponse>('/api/ccss/audit/session-trace', {
              query: {
                limit: parsedLimit,
                sessionKey: sessionTraceTarget,
              },
              headers: authHeaders,
            })
          : Promise.resolve(null),
      ])

      setStylePatches(stylePatchResponse.data)
      setTranspileJobs(transpileResponse.data)
      setStateEvents(stateEventResponse.data)
      if (sessionTraceResponse) {
        setSessionTraceSessionKey(sessionTraceResponse.sessionKey)
        setSessionTrace(sessionTraceResponse.data)
        setSessionTraceStats(sessionTraceResponse.stats)
      } else {
        setSessionTraceSessionKey(null)
        setSessionTrace([])
        setSessionTraceStats(null)
      }
      setLastLoadedAt(new Date().toLocaleString('ja-JP'))
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [
    authHeaders,
    eventNameFilter,
    eventPatchFilter,
    eventRequestFilter,
    eventSessionFilter,
    eventStateFilter,
    limitInput,
    statusFilter,
    stylePatchFilter,
    styleRejectionFilter,
    styleRequestFilter,
    styleStateFilter,
    styleViewFilter,
  ])

  return (
    <section className="page-card ccss-audit-card">
      <h1 className="page-heading">CCSS 監査ログビュー</h1>
      <p className="status-text">
        管理者API（<code>/api/ccss/audit/*</code>）から
        style-patch / transpile / state-events / session-trace の監査ログを確認します。
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

      <section className="ccss-audit-filter-box">
        <h2 className="sub-heading">style-patch フィルタ</h2>
        <div className="ccss-audit-filter-grid">
          <input
            className="ccss-audit-filter-input"
            placeholder="view（例: sample）"
            value={styleViewFilter}
            onChange={(event) => setStyleViewFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="stateId（例: ccss:sample:sample-panel:menu-open）"
            value={styleStateFilter}
            onChange={(event) => setStyleStateFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="rejectionCode（例: CCSS_INVALID_STATE）"
            value={styleRejectionFilter}
            onChange={(event) => setStyleRejectionFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="requestId"
            value={styleRequestFilter}
            onChange={(event) => setStyleRequestFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="patchId"
            value={stylePatchFilter}
            onChange={(event) => setStylePatchFilter(event.target.value)}
          />
        </div>
      </section>

      <section className="ccss-audit-filter-box">
        <h2 className="sub-heading">state-events フィルタ</h2>
        <div className="ccss-audit-filter-grid">
          <input
            className="ccss-audit-filter-input"
            placeholder="sessionKey"
            value={eventSessionFilter}
            onChange={(event) => setEventSessionFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="stateId"
            value={eventStateFilter}
            onChange={(event) => setEventStateFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="eventName（例: ui:state:set）"
            value={eventNameFilter}
            onChange={(event) => setEventNameFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="requestId"
            value={eventRequestFilter}
            onChange={(event) => setEventRequestFilter(event.target.value)}
          />
          <input
            className="ccss-audit-filter-input"
            placeholder="patchId"
            value={eventPatchFilter}
            onChange={(event) => setEventPatchFilter(event.target.value)}
          />
        </div>
      </section>

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
          {stylePatches.length === 0 && <li className="ccss-audit-empty">該当データはありません。</li>}
          {stylePatches.map((record) => (
            <li key={record.id}>
              <strong>{record.created_at}</strong> / patch: {record.id} / request: {record.request_id}
              {' '} / view: {record.view} / state: {record.state_id}
              {' '} / recipes: {record.applied_recipe_ids.length}
              {' '} / rejection: {record.rejection_code ?? '-'}
            </li>
          ))}
        </ul>
      </section>

      <section className="ccss-audit-section">
        <h2 className="sub-heading">transpile 監査 ({transpileJobs.length})</h2>
        <ul className="ccss-audit-list">
          {transpileJobs.length === 0 && <li className="ccss-audit-empty">該当データはありません。</li>}
          {transpileJobs.map((record) => (
            <li key={record.id}>
              <strong>{record.created_at}</strong> / status: {record.status} / source: {record.source_path}
              {' '} / errors: {record.errors.length} / warnings: {record.warnings.length}
            </li>
          ))}
        </ul>
      </section>

      <section className="ccss-audit-section">
        <h2 className="sub-heading">state-events 監査 ({stateEvents.length})</h2>
        <ul className="ccss-audit-list">
          {stateEvents.length === 0 && <li className="ccss-audit-empty">該当データはありません。</li>}
          {stateEvents.map((record) => (
            <li key={record.id}>
              <strong>{record.created_at}</strong> / session: {record.session_key}
              {' '} / event: {record.event_name} / state: {record.state_id}
              {' '} / request: {record.request_id ?? '-'} / patch: {record.patch_id ?? '-'}
              {' '} / payload: {summarizePayload(record.payload)}
            </li>
          ))}
        </ul>
      </section>

      <section className="ccss-audit-section">
        <h2 className="sub-heading">session trace（state → patch → recipes）</h2>
        {!sessionTraceSessionKey && (
          <p className="status-text">
            `state-events フィルタ` の <code>sessionKey</code> を入力して取得すると、相関済みトレースを表示します。
          </p>
        )}
        {sessionTraceSessionKey && sessionTraceStats && (
          <p className="status-text">
            session: <strong>{sessionTraceSessionKey}</strong> / events: {sessionTraceStats.eventCount}
            {' '} / correlated: {sessionTraceStats.correlatedPatchCount}
            {' '} / uncorrelated: {sessionTraceStats.uncorrelatedEventCount}
          </p>
        )}
        <ul className="ccss-audit-list">
          {sessionTraceSessionKey && sessionTrace.length === 0 && (
            <li className="ccss-audit-empty">このsessionKeyのトレースデータはありません。</li>
          )}
          {sessionTrace.map((item) => (
            <li key={item.eventId}>
              <strong>{item.createdAt}</strong> / event: {item.eventName} / state: {item.stateId}
              {' '} / request: {item.requestId ?? '-'} / patch: {item.patchId ?? '-'}
              {item.patch
                ? ` / correlation: ${item.correlation ?? '-'} / recipes: ${item.patch.appliedRecipeIds.length}`
                : ' / correlation: - / recipes: 0'}
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
