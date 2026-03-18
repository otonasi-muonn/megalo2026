import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, supabaseConfigErrorMessage } from './supabaseClient'

export interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  errorMessage: string | null
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '不明なエラーが発生しました。'

export const useAuth = (): AuthState => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (supabaseConfigErrorMessage) {
      setErrorMessage(supabaseConfigErrorMessage)
      setIsLoading(false)
      return () => undefined
    }

    const supabase = getSupabaseClient()
    let isMounted = true

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!isMounted) {
          return
        }
        if (error) {
          throw new Error(error.message)
        }
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setErrorMessage(null)
      } catch (error) {
        if (!isMounted) {
          return
        }
        setSession(null)
        setUser(null)
        setErrorMessage(
          `認証状態の取得に失敗しました。${getErrorMessage(error)}`,
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_, newSession) => {
      if (!isMounted) {
        return
      }
      setSession(newSession)
      setUser(newSession?.user ?? null)
      setIsLoading(false)
      setErrorMessage(null)
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { user, session, isLoading, errorMessage }
}
