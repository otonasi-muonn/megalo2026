import {
  DEFAULT_AUTH_REDIRECT_PATH,
  buildAuthCallbackUrl,
} from './redirect'
import { getSupabaseClient } from './supabaseClient'

export const signInWithGoogle = async (
  redirectPath = DEFAULT_AUTH_REDIRECT_PATH,
): Promise<void> => {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: buildAuthCallbackUrl(redirectPath),
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

export const signOut = async (): Promise<void> => {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }
}

export const getAccessToken = async (): Promise<string | null> => {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error(`認証トークンの取得に失敗しました。${error.message}`)
  }
  return data.session?.access_token ?? null
}
