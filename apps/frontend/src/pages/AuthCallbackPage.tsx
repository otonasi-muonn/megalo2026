import { useEffect } from 'react'
import { supabase } from '../features/auth/supabaseClient'
import { navigate } from '../utils/navigation'

export const AuthCallbackPage = () => {
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    })
  }, [])

  return (
    <section className="page-card">
      <p className="status-text">ログイン処理中...</p>
    </section>
  )
}
