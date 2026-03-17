import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../styles/CcssPocPage.css'

type ManifestState = {
  name: string
  stateId: string
  kind: 'boolean' | 'enum'
  initialValue: boolean | string
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

type MockStylePatch = {
  recipeIds: string[]
  classList: Array<{
    targetClass: string
    add: string[]
  }>
}

const EXPECTED_UI_ROOT_ID = 'ccss-ui-root'
const EXPECTED_GAME_ROOT_ID = 'ccss-game-root'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

const escapeSelectorId = (value: string): string => value.replace(/([:\\.[\]#(), ])/g, '\\$1')

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

const getMockStylePatch = (): MockStylePatch => ({
  recipeIds: ['rcpDashboardStageCardMenuOpenV1', 'rcpSharedToastVisibleV1'],
  classList: [
    {
      targetClass: 'ccss-dashboard-stage-card',
      add: ['is-menu-open'],
    },
    {
      targetClass: 'ccss-toast',
      add: ['is-visible'],
    },
  ],
})

export const CcssPocPage = () => {
  const uiRootRef = useRef<HTMLDivElement>(null)
  const gameCanvasRef = useRef<HTMLCanvasElement>(null)
  const styleElementRef = useRef<HTMLStyleElement | null>(null)

  const [manifest, setManifest] = useState<CcssManifest | null>(null)
  const [generatedCss, setGeneratedCss] = useState('')
  const [generatedHtml, setGeneratedHtml] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [appliedRecipes, setAppliedRecipes] = useState<string[]>([])

  const firstState = useMemo(() => manifest?.states[0] ?? null, [manifest])

  const loadGeneratedAssets = useCallback(async () => {
    try {
      setIsLoading(true)
      setErrorMessage(null)
      setAppliedRecipes([])

      const [manifestResponse, cssResponse, cResponse] = await Promise.all([
        fetch('/ccss/ccss.manifest.json', { cache: 'no-store' }),
        fetch('/ccss/ui.generated.css', { cache: 'no-store' }),
        fetch('/ccss/ui.generated.c', { cache: 'no-store' }),
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

      setManifest(nextManifest)
      setGeneratedCss(nextCss)
      setGeneratedHtml(nextHtml)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const toggleFirstState = useCallback(() => {
    if (!firstState || !uiRootRef.current) {
      return
    }

    const selector = `#${escapeSelectorId(firstState.stateId)}`
    const input = uiRootRef.current.querySelector<HTMLInputElement>(selector)
    if (!input) {
      setErrorMessage(`state input が見つかりません: ${firstState.stateId}`)
      return
    }
    input.checked = !input.checked
  }, [firstState])

  const applyMockPatch = useCallback(() => {
    const root = uiRootRef.current
    if (!root) {
      return
    }

    const patch = getMockStylePatch()
    for (const rule of patch.classList) {
      const targets = root.getElementsByClassName(rule.targetClass)
      for (const target of targets) {
        for (const className of rule.add) {
          target.classList.add(className)
        }
      }
    }

    setAppliedRecipes(patch.recipeIds)
  }, [])

  useEffect(() => {
    const root = uiRootRef.current
    if (!root) {
      return
    }
    root.innerHTML = generatedHtml
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
        <button type="button" className="button" onClick={loadGeneratedAssets} disabled={isLoading}>
          {isLoading ? '読み込み中...' : '生成物を読み込む'}
        </button>
        <button type="button" className="button secondary" onClick={toggleFirstState} disabled={!firstState}>
          先頭stateを切り替え
        </button>
        <button type="button" className="button secondary" onClick={applyMockPatch} disabled={!manifest}>
          擬似style-patch適用
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
            states: {manifest.states.map((state) => state.stateId).join(', ')}
          </p>
          {appliedRecipes.length > 0 && (
            <p className="success-text">applied recipes: {appliedRecipes.join(', ')}</p>
          )}
        </div>
      )}

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
