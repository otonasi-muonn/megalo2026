import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, apiPost } from '../utils/api'
import '../styles/CcssPocPage.css'

type ManifestState = {
  name: string
  stateId: string
  kind: 'boolean' | 'enum'
  initialValue: boolean | string
  enumValues?: string[]
}

type CcssManifest = {
  component: {
    name: string
    slug: string
  }
  domRoots: {
    uiRootId: string
    gameRootId: string
  }
  states: ManifestState[]
}

type StylePatchResponse = {
  requestId: string
  patchId: string
  stateId: string
  ttlMs: number
  recipeIds: string[]
  classList: Array<{
    targetClass: string
    add: string[]
  }>
  rulesetVersion: string
}

type StylePatchStateCapabilitiesResponse = {
  data: Array<{
    view: string
    stateId: string
    recipeCount: number
  }>
}

type TranspileValidateResponse = {
  ok: boolean
  sourcePath: string
  component?: {
    name: string
    stateCount: number
    stateNames: string[]
  }
  errors: Array<{
    message: string
    line: number
    column: number
  }>
  warnings: Array<{
    message: string
    line: number
    column: number
  }>
}

type StateEventResponse = {
  recorded: boolean
  eventId?: string
  reason?: string
}

const EXPECTED_UI_ROOT_ID = 'ccss-ui-root'
const EXPECTED_GAME_ROOT_ID = 'ccss-game-root'
const DEFAULT_VALIDATE_SOURCE = `import { useState } from 'react'

export function InlinePanel() {
  const [open, setOpen] = useState(false)
  return (
    <main>
      <button onClick={() => setOpen(!open)}>toggle</button>
      <div data-ccss-state="ccss:inline:inline-panel:open">panel</div>
    </main>
  )
}`

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

const escapeSelectorId = (value: string): string => value.replace(/([:\\.[\]#(), ])/g, '\\$1')

const parseHtmlFragment = (html: string): Node[] => {
  if (html.trim().length === 0) {
    return []
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')
  const hasScript = parsed.body.querySelector('script')
  if (hasScript) {
    throw new Error('生成UIに <script> が含まれています。')
  }

  return Array.from(parsed.body.childNodes).map((node) => node.cloneNode(true))
}

const extractHtmlFromGeneratedC = (cSource: string): string => {
  const match = cSource.match(/return\s+"([\s\S]*?)";/)
  if (!match) {
    throw new Error('ui.generated.c からHTML文字列を抽出できませんでした。')
  }

  const raw = match[1]
  const html = raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

  if (/<canvas\b/i.test(html)) {
    throw new Error('生成UIに <canvas> が含まれています。DOM分離ルール違反です。')
  }
  if (/\bid\s*=\s*["']ccss-game-root["']/i.test(html)) {
    throw new Error('生成UIに #ccss-game-root が含まれています。DOM分離ルール違反です。')
  }

  return html
}

export const CcssPocPage = () => {
  const uiRootRef = useRef<HTMLDivElement>(null)
  const gameCanvasRef = useRef<HTMLCanvasElement>(null)
  const styleElementRef = useRef<HTMLStyleElement | null>(null)

  const [manifest, setManifest] = useState<CcssManifest | null>(null)
  const [generatedCss, setGeneratedCss] = useState('')
  const [generatedHtml, setGeneratedHtml] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isApplyingPatch, setIsApplyingPatch] = useState(false)
  const [isValidatingSource, setIsValidatingSource] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [appliedRecipes, setAppliedRecipes] = useState<string[]>([])
  const [patchableStateIds, setPatchableStateIds] = useState<string[]>([])
  const [patchableStateStatus, setPatchableStateStatus] = useState<string | null>(null)
  const [stateEventStatus, setStateEventStatus] = useState<string | null>(null)
  const [selectedStateId, setSelectedStateId] = useState('')
  const [sourceInput, setSourceInput] = useState(DEFAULT_VALIDATE_SOURCE)
  const [validateBearerToken, setValidateBearerToken] = useState('')
  const [validateResult, setValidateResult] = useState<TranspileValidateResponse | null>(null)
  const sessionKey = useMemo(() => `ccss-poc-${crypto.randomUUID()}`, [])

  const selectedState = useMemo(() => {
    if (!manifest || manifest.states.length === 0) {
      return null
    }
    return manifest.states.find((state) => state.stateId === selectedStateId) ?? manifest.states[0]
  }, [manifest, selectedStateId])
  const patchableStateIdSet = useMemo(() => new Set(patchableStateIds), [patchableStateIds])
  const isSelectedStatePatchable = selectedState
    ? patchableStateIdSet.has(selectedState.stateId)
    : false

  const loadGeneratedAssets = useCallback(async () => {
    try {
      setIsLoading(true)
      setErrorMessage(null)
      setAppliedRecipes([])
      setPatchableStateIds([])
      setPatchableStateStatus(null)
      setStateEventStatus(null)

      const [manifestResponse, cssResponse, cResponse, patchStateResponse] = await Promise.all([
        fetch('/ccss/ccss.manifest.json', { cache: 'no-store' }),
        fetch('/ccss/ui.generated.css', { cache: 'no-store' }),
        fetch('/ccss/ui.generated.c', { cache: 'no-store' }),
        apiGet<StylePatchStateCapabilitiesResponse>('/api/ccss/style-patch/states', {
          query: {
            view: 'sample',
          },
        }).catch(() => null),
      ])

      if (!manifestResponse.ok || !cssResponse.ok || !cResponse.ok) {
        throw new Error('CCSS生成物の取得に失敗しました。`pnpm ccss:poc:prepare` を実行してください。')
      }

      const nextManifest = (await manifestResponse.json()) as CcssManifest
      if (
        nextManifest.domRoots.uiRootId !== EXPECTED_UI_ROOT_ID ||
        nextManifest.domRoots.gameRootId !== EXPECTED_GAME_ROOT_ID
      ) {
        throw new Error('manifestのDOM root定義が想定と一致しません。')
      }

      const nextCss = await cssResponse.text()
      const cSource = await cResponse.text()
      const nextHtml = extractHtmlFromGeneratedC(cSource)
      const nextPatchableStateIds = patchStateResponse
        ? Array.from(new Set(patchStateResponse.data.map((record) => record.stateId)))
        : []
      const patchableStateSet = new Set(nextPatchableStateIds)
      const initialStateId = nextManifest.states.find((state) => patchableStateSet.has(state.stateId))?.stateId
        ?? nextManifest.states[0]?.stateId
        ?? ''

      setManifest(nextManifest)
      setSelectedStateId(initialStateId)
      setPatchableStateIds(nextPatchableStateIds)
      setPatchableStateStatus(
        patchStateResponse
          ? `style-patch対象state: ${nextPatchableStateIds.length}件`
          : 'style-patch対象stateの取得に失敗しました。',
      )
      setGeneratedCss(nextCss)
      setGeneratedHtml(nextHtml)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const recordStateEvent = useCallback(async (
    stateId: string,
    eventName: string,
    payload: Record<string, unknown>,
    requestId?: string,
    patchId?: string,
  ) => {
    try {
      const response = await apiPost<StateEventResponse>('/api/ccss/state-events', {
        sessionKey,
        stateId,
        eventName,
        requestId,
        patchId,
        payload,
      })

      if (response.recorded) {
        setStateEventStatus(`recorded: ${eventName}`)
      } else {
        setStateEventStatus(`skipped: ${response.reason ?? 'disabled'}`)
      }
    } catch (error) {
      setStateEventStatus(`failed: ${getErrorMessage(error)}`)
    }
  }, [sessionKey])

  const toggleSelectedState = useCallback(async () => {
    if (!selectedState || !uiRootRef.current) {
      return
    }

    const selector = `#${escapeSelectorId(selectedState.stateId)}`
    const input = uiRootRef.current.querySelector<HTMLInputElement>(selector)
    if (!input) {
      setErrorMessage(`state input が見つかりません: ${selectedState.stateId}`)
      return
    }
    input.checked = !input.checked
    await recordStateEvent(
      selectedState.stateId,
      'ui:state:set',
      {
        checked: input.checked,
        source: 'ccss-poc',
      },
    )
  }, [recordStateEvent, selectedState])

  const applyPatchFromApi = useCallback(async () => {
    const root = uiRootRef.current
    const stateId = selectedState?.stateId
    if (!root || !stateId) {
      return
    }
    if (!isSelectedStatePatchable) {
      setErrorMessage('選択中のstateは style-patch 対象外です。対象stateを選択してください。')
      return
    }

    try {
      setIsApplyingPatch(true)
      setErrorMessage(null)

      const patch = await apiPost<StylePatchResponse>('/api/ccss/style-patch', {
        view: 'sample',
        stateId,
        payload: {
          stageId: 'sample',
        },
      })

      for (const rule of patch.classList) {
        const targets = root.getElementsByClassName(rule.targetClass)
        for (const target of targets) {
          for (const className of rule.add) {
            target.classList.add(className)
          }
        }
      }

      setAppliedRecipes(patch.recipeIds)
      await recordStateEvent(
        stateId,
        'style:patch:applied',
        {
          source: 'ccss-poc',
          recipeIds: patch.recipeIds,
        },
        patch.requestId,
        patch.patchId,
      )
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsApplyingPatch(false)
    }
  }, [isSelectedStatePatchable, recordStateEvent, selectedState])

  const validateSourceWithApi = useCallback(async () => {
    try {
      setIsValidatingSource(true)
      setErrorMessage(null)
      const trimmedToken = validateBearerToken.trim()

      const response = await apiPost<TranspileValidateResponse>(
        '/api/ccss/transpile/validate',
        {
          source: sourceInput,
          sourcePath: 'inline.tsx',
        },
        trimmedToken.length > 0
          ? {
              headers: {
                Authorization: `Bearer ${trimmedToken}`,
              },
            }
          : undefined,
      )
      setValidateResult(response)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsValidatingSource(false)
    }
  }, [sourceInput, validateBearerToken])

  useEffect(() => {
    const root = uiRootRef.current
    if (!root) {
      return
    }
    try {
      const nodes = parseHtmlFragment(generatedHtml)
      root.replaceChildren(...nodes)
    } catch (error) {
      root.replaceChildren()
      setErrorMessage(getErrorMessage(error))
    }
  }, [generatedHtml])

  useEffect(() => {
    if (!generatedCss) {
      return
    }

    let styleElement = styleElementRef.current
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = 'ccss-generated-style'
      document.head.appendChild(styleElement)
      styleElementRef.current = styleElement
    }
    styleElement.textContent = generatedCss

    return () => {
      if (!styleElementRef.current) {
        return
      }
      styleElementRef.current.remove()
      styleElementRef.current = null
    }
  }, [generatedCss])

  useEffect(() => {
    const canvas = gameCanvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    let frame = 0
    let rafId = 0

    const tick = () => {
      frame += 1
      const width = canvas.width
      const height = canvas.height

      context.fillStyle = '#0f172a'
      context.fillRect(0, 0, width, height)

      const x = (Math.sin(frame * 0.05) * 0.4 + 0.5) * width
      const y = (Math.cos(frame * 0.04) * 0.25 + 0.5) * height

      context.fillStyle = '#22d3ee'
      context.beginPath()
      context.arc(x, y, 14, 0, Math.PI * 2)
      context.fill()

      context.fillStyle = '#e2e8f0'
      context.font = '14px sans-serif'
      context.fillText('game-root: canvas running', 12, 24)

      rafId = window.requestAnimationFrame(tick)
    }

    tick()
    return () => window.cancelAnimationFrame(rafId)
  }, [])

  return (
    <section className="page-card ccss-poc-card">
      <h1 className="page-heading">CCSS ランタイム統合 PoC</h1>
      <p className="status-text">
        生成物（C/CSS/manifest）を読み込み、<code>#ccss-ui-root</code> と
        <code> #ccss-game-root</code> の物理分離を確認するページです。
      </p>

      <div className="inline-actions">
        {manifest && (
          <label className="ccss-state-select">
            <span>対象state</span>
            <select
              value={selectedState?.stateId ?? ''}
              onChange={(event) => setSelectedStateId(event.target.value)}
            >
              {manifest.states.map((state) => (
                <option key={state.stateId} value={state.stateId}>
                  {state.stateId}
                  {state.kind === 'enum' && state.enumValues && state.enumValues.length > 0
                    ? ` (${state.enumValues.join('|')})`
                    : ''}
                  {!patchableStateIdSet.has(state.stateId) ? ' [patch対象外]' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="button" onClick={loadGeneratedAssets} disabled={isLoading}>
          {isLoading ? '読み込み中...' : '生成物を読み込む'}
        </button>
        <button type="button" className="button secondary" onClick={toggleSelectedState} disabled={!selectedState}>
          選択stateを切り替え
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={applyPatchFromApi}
          disabled={!manifest || !selectedState || isApplyingPatch || !isSelectedStatePatchable}
        >
          {isApplyingPatch ? '適用中...' : 'style-patch API適用'}
        </button>
      </div>

      {errorMessage && (
        <p className="error-text" role="alert">
          {errorMessage}
        </p>
      )}

      {manifest && (
        <div className="ccss-poc-meta">
          <p className="status-text">
            component: <strong>{manifest.component.name}</strong>
          </p>
          <p className="status-text">
            states: {manifest.states.map((state) => (
              state.kind === 'enum'
                ? `${state.stateId}(${state.enumValues?.join('|') ?? ''})`
                : state.stateId
            )).join(', ')}
          </p>
          <p className="status-text">
            selected: {selectedState?.stateId ?? '-'}
          </p>
          {patchableStateStatus && (
            <p className="status-text">{patchableStateStatus}</p>
          )}
          {appliedRecipes.length > 0 && (
            <p className="success-text">applied recipes: {appliedRecipes.join(', ')}</p>
          )}
          {stateEventStatus && (
            <p className="status-text">state-events: {stateEventStatus}</p>
          )}
        </div>
      )}

      <section className="ccss-validate-section">
        <h2 className="sub-heading">transpile validate API</h2>
        <p className="status-text">
          <code>POST /api/ccss/transpile/validate</code> で、Reactサブセット適合を検証します。
        </p>
          <input
            className="ccss-token-input"
            placeholder="Bearer token（管理者のみ）"
            value={validateBearerToken}
            onChange={(event) => setValidateBearerToken(event.target.value)}
          />
        <textarea
          className="ccss-source-input"
          value={sourceInput}
          onChange={(event) => setSourceInput(event.target.value)}
          spellCheck={false}
        />
        <div className="inline-actions">
          <button
            type="button"
            className="button secondary"
            onClick={validateSourceWithApi}
            disabled={isValidatingSource}
          >
            {isValidatingSource ? '検証中...' : 'ソース検証を実行'}
          </button>
        </div>

        {validateResult && (
          <div className="ccss-validate-result">
            {validateResult.ok ? (
              <p className="success-text">
                OK: {validateResult.component?.name}（states: {validateResult.component?.stateCount ?? 0}）
              </p>
            ) : (
              <>
                <p className="error-text">NG: サブセット外構文があります。</p>
                <ul className="ccss-validate-errors">
                  {validateResult.errors.map((error) => (
                    <li key={`${error.line}-${error.column}-${error.message}`}>
                      L{error.line}:C{error.column} {error.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <div className="ccss-runtime-grid">
        <div>
          <h2 className="sub-heading">UI root (WASM管轄)</h2>
          <div id={EXPECTED_UI_ROOT_ID} ref={uiRootRef} className="ccss-ui-root" />
        </div>

        <div>
          <h2 className="sub-heading">Game root (KAPLAY管轄)</h2>
          <div id={EXPECTED_GAME_ROOT_ID} className="ccss-game-root">
            <canvas ref={gameCanvasRef} className="ccss-game-canvas" width={560} height={260} />
          </div>
        </div>
      </div>
    </section>
  )
}
