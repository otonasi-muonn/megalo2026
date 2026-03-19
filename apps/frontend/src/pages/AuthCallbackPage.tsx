import { useEffect, useState } from 'react'
import { buildLoginPath } from '../features/auth/redirect'
import {
  getSupabaseClient,
  supabaseConfigErrorMessage,
} from '../features/auth/supabaseClient'
import { navigate } from '../utils/navigation'

interface AuthCallbackPageProps {
  redirectPath: string
}

const SESSION_POLL_INTERVAL_MS = 400
const SESSION_POLL_MAX_ATTEMPTS = 20
const SESSION_HARD_TIMEOUT_MS = 12000

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const AuthCallbackPage = ({ redirectPath }: AuthCallbackPageProps) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (supabaseConfigErrorMessage) {
      setErrorMessage(supabaseConfigErrorMessage)
      return () => undefined
    }

    const supabase = getSupabaseClient()
    let isMounted = true
    let isSettled = false
    let isPolling = false
    let pollAttempts = 0
    let pollTimerId: number | undefined
    let timeoutId: number | undefined
    let unsubscribe: (() => void) | undefined

    const cleanupWatchers = () => {
      if (pollTimerId !== undefined) {
        window.clearInterval(pollTimerId)
        pollTimerId = undefined
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
        timeoutId = undefined
      }
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = undefined
      }
    }

    const settleWithSession = (isAuthenticated: boolean) => {
      if (!isMounted || isSettled) {
        return
      }
      isSettled = true
      cleanupWatchers()
      if (isAuthenticated) {
        navigate(redirectPath, { replace: true })
        return
      }
      navigate(buildLoginPath(redirectPath), { replace: true })
    }

    const settleWithError = (message: string) => {
      if (!isMounted || isSettled) {
        return
      }
      isSettled = true
      cleanupWatchers()
      setErrorMessage(message)
    }

    const checkSessionOnce = async (): Promise<boolean | null> => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          throw new Error(error.message)
        }
        return Boolean(data.session)
      } catch (error) {
        settleWithError(`ログイン状態の確認に失敗しました。${getErrorMessage(error)}`)
        return null
      }
    }

    const pollSession = async () => {
      if (!isMounted || isSettled || isPolling) {
        return
      }
      isPolling = true
      pollAttempts += 1
      const hasSession = await checkSessionOnce()
      isPolling = false
      if (!isMounted || isSettled || hasSession === null) {
        return
      }
      if (hasSession) {
        settleWithSession(true)
        return
      }
      if (pollAttempts >= SESSION_POLL_MAX_ATTEMPTS) {
        settleWithSession(false)
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted || isSettled) {
        return
      }
      if (newSession) {
        settleWithSession(true)
        return
      }
      if (event === 'SIGNED_OUT') {
        settleWithSession(false)
      }
    })
    unsubscribe = () => listener.subscription.unsubscribe()

    pollTimerId = window.setInterval(() => {
      void pollSession()
    }, SESSION_POLL_INTERVAL_MS)
    timeoutId = window.setTimeout(() => {
      settleWithError('ログイン状態の確認に時間がかかっています。もう一度お試しください。')
    }, SESSION_HARD_TIMEOUT_MS)
    void pollSession()

    return () => {
      isMounted = false
      cleanupWatchers()
    }
  }, [redirectPath])

  if (errorMessage) {
    return (
      <section className="page-card">
        <p className="error-text" role="alert">
          {errorMessage}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => navigate(buildLoginPath(redirectPath), { replace: true })}
        >
          ログイン画面へ戻る
        </button>
      </section>
    )
  }

  return (
    <section className="page-card">
      <p className="status-text">ログイン処理中...</p>
    </section>
  )
}
