import type { StageData } from './stage.js'

export interface Database {
  public: {
    Tables: {
      likes: {
        Row: {
          created_at: string
          stage_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stage_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          stage_id?: string
          user_id?: string
        }
        Relationships: []
      }
      play_logs: {
        Row: {
          created_at: string
          id: string
          is_cleared: boolean
          player_id: string | null
          retry_count: number
          stage_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_cleared: boolean
          player_id?: string | null
          retry_count?: number
          stage_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_cleared?: boolean
          player_id?: string | null
          retry_count?: number
          stage_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          author_id: string
          clear_count: number
          created_at: string
          id: string
          is_published: boolean
          like_count: number
          play_count: number
          stage_data: StageData
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          clear_count?: number
          created_at?: string
          id?: string
          is_published?: boolean
          like_count?: number
          play_count?: number
          stage_data: StageData
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          clear_count?: number
          created_at?: string
          id?: string
          is_published?: boolean
          like_count?: number
          play_count?: number
          stage_data?: StageData
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
