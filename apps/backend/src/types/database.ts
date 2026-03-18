import type { StageData } from './stage.js'

export interface Database {
  public: {
    Tables: {
      ccss_style_patches: {
        Row: {
          applied_recipe_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          rejection_code: string | null
          request_id: string
          requested_payload: Record<string, unknown>
          resolved_class_list: Array<{
            targetClass: string
            add: string[]
          }>
          ruleset_version: string
          state_id: string
          ttl_ms: number
          view: string
        }
        Insert: {
          applied_recipe_ids?: string[]
          created_at?: string
          created_by?: string | null
          id: string
          rejection_code?: string | null
          request_id: string
          requested_payload?: Record<string, unknown>
          resolved_class_list?: Array<{
            targetClass: string
            add: string[]
          }>
          ruleset_version: string
          state_id: string
          ttl_ms: number
          view: string
        }
        Update: {
          applied_recipe_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          rejection_code?: string | null
          request_id?: string
          requested_payload?: Record<string, unknown>
          resolved_class_list?: Array<{
            targetClass: string
            add: string[]
          }>
          ruleset_version?: string
          state_id?: string
          ttl_ms?: number
          view?: string
        }
        Relationships: []
      }
      ccss_transpile_jobs: {
        Row: {
          created_at: string
          errors: Array<Record<string, unknown>>
          finished_at: string | null
          id: string
          requested_by: string
          source_path: string
          status: 'queued' | 'running' | 'succeeded' | 'failed'
          warnings: Array<Record<string, unknown>>
        }
        Insert: {
          created_at?: string
          errors?: Array<Record<string, unknown>>
          finished_at?: string | null
          id?: string
          requested_by: string
          source_path: string
          status: 'queued' | 'running' | 'succeeded' | 'failed'
          warnings?: Array<Record<string, unknown>>
        }
        Update: {
          created_at?: string
          errors?: Array<Record<string, unknown>>
          finished_at?: string | null
          id?: string
          requested_by?: string
          source_path?: string
          status?: 'queued' | 'running' | 'succeeded' | 'failed'
          warnings?: Array<Record<string, unknown>>
        }
        Relationships: []
      }
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
    Functions: {
      increment_stage_counters: {
        Args: {
          p_stage_id: string
          p_clear_increment?: number
        }
        Returns: {
          play_count: number
          clear_count: number
        }[]
      }
      recalc_stage_like_count: {
        Args: {
          stage_id: string
        }
        Returns: {
          like_count: number
          updated_at: string
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
