import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { navigate } from '../../utils/navigation'

export interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
}

export const useAuth = (): AuthState => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
      setIsLoading(false)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (newSession) {
          navigate('/dashboard')
        }
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  return { user, session, isLoading }
}
