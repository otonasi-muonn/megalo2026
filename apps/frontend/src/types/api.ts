import type { StageData } from './stage'

export interface ApiEnvelope<TData> {
  data: TData
  message?: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface StageFilters {
  q: string | null
  author_id: string | null
  is_published: boolean | null
}

export interface ProfileDto {
  id: string
  display_name: string
  created_at: string
  updated_at?: string
}

export interface StageDto {
  id: string
  author_id: string
  title: string
  stage_data: StageData
  is_published: boolean
  play_count: number
  clear_count: number
  like_count: number
  created_at: string
  updated_at: string
}

export type StageListItemDto = Omit<StageDto, 'stage_data'>

export interface StageListResponse extends ApiEnvelope<StageListItemDto[]> {
  pagination: Pagination
  filters: StageFilters
}

export interface StageResponse extends ApiEnvelope<StageDto> {}

export interface ProfileResponse extends ApiEnvelope<ProfileDto> {}

export interface ProfileLikesResponse extends ApiEnvelope<StageListItemDto[]> {
  total: number
}

export interface PlayLogDto {
  id: string
  stage_id: string
  player_id: string | null
  is_cleared: boolean
  retry_count: number
  created_at: string
}

export interface PlayLogResponse extends ApiEnvelope<PlayLogDto> {
  aggregates: {
    play_count: number
    clear_count: number
  }
}

export interface LikeToggleDto {
  stage_id: string
  user_id: string
  liked: boolean
  like_count: number
  updated_at: string
}

export interface LikeToggleResponse extends ApiEnvelope<LikeToggleDto> {}
