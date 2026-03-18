import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
const hasValidSupabaseConfig =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 0

export const supabaseConfigErrorMessage =
  !hasValidSupabaseConfig
    ? 'VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を apps/frontend/.env に設定してください。'
    : null

let supabaseClient: SupabaseClient | null = null

if (
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 0
) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
}

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    throw new Error(
      supabaseConfigErrorMessage ?? 'Supabaseクライアントの初期化に失敗しました。',
    )
  }
  return supabaseClient
}
