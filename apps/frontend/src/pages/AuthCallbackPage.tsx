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
    const timeoutId = window.setTimeout(() => {
      if (!isMounted) {
        return
      }
      setErrorMessage('ログイン状態の確認に時間がかかっています。もう一度お試しください。')
    }, 10000)

    const resolveSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!isMounted) {
          return
        }
        if (error) {
          throw new Error(error.message)
        }
        if (data.session) {
          navigate(redirectPath, { replace: true })
          return
        }
        navigate(buildLoginPath(redirectPath), { replace: true })
      } catch (error) {
        if (!isMounted) {
          return
        }
        setErrorMessage(`ログイン状態の確認に失敗しました。${getErrorMessage(error)}`)
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    void resolveSession()

    return () => {
      isMounted = false
      window.clearTimeout(timeoutId)
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
