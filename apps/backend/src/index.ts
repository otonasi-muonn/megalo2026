import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { StageData } from './types/stage.js'

type GimmickKind = StageData['gimmicks'][number]['kind']

interface Profile {
  id: string
  display_name: string
  created_at: string
}

interface StageRecord {
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

type StageListItem = Omit<StageRecord, 'stage_data'>

const app = new Hono()

const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const defaultAuthorId = 'user-0001'
const mockNow = '2026-03-16T00:00:00.000Z'

const mockProfile: Profile = {
  id: defaultAuthorId,
  display_name: 'mock-player',
  created_at: '2026-01-01T00:00:00.000Z',
}

const createMockId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`

const createMockStageData = (seed: number): StageData => {
  const gimmickKindCycle: GimmickKind[] = ['wall', 'fan', 'spring', 'spike', 'wave']
  const gimmickKind = gimmickKindCycle[seed % gimmickKindCycle.length]

  return {
    version: '1.0.0',
    world: {
      width: 1920,
      height: 1080,
      gridSize: 16,
    },
    physics: {
      gravity: { x: 0, y: 9.8 },
      airDrag: 0.02,
      windDecay: 0.9,
      windForceScale: 1 + seed * 0.05,
    },
    spawn: {
      position: { x: 120 + seed * 4, y: 100 },
    },
    goal: {
      position: { x: 1720 - seed * 10, y: 920 },
      size: { width: 100, height: 100 },
    },
    gimmicks: [
      {
        id: `wall-${seed}`,
        kind: 'wall',
        position: { x: 960, y: 1040 },
        size: { width: 1800, height: 40 },
      },
      gimmickKind === 'fan'
        ? {
            id: `fan-${seed}`,
            kind: 'fan',
            position: { x: 480, y: 840 },
            force: 15 + seed,
            range: 320,
            direction: { x: 1, y: 0 },
          }
        : gimmickKind === 'spring'
          ? {
              id: `spring-${seed}`,
              kind: 'spring',
              position: { x: 520, y: 920 },
              size: { width: 80, height: 40 },
              power: 18 + seed,
            }
          : gimmickKind === 'spike'
            ? {
                id: `spike-${seed}`,
                kind: 'spike',
                position: { x: 760, y: 960 },
                size: { width: 120, height: 32 },
                damage: 1,
              }
            : {
                id: `wave-${seed}`,
                kind: 'wave',
                position: { x: 640, y: 760 },
                length: 300,
                amplitude: 24,
                frequency: 0.08,
                speed: 1.2,
              },
    ],
  }
}

const mockStages: StageRecord[] = [
  {
    id: 'stage-0001',
    author_id: defaultAuthorId,
    title: 'はじめての風チュートリアル',
    stage_data: createMockStageData(1),
    is_published: true,
    play_count: 120,
    clear_count: 88,
    like_count: 42,
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-03-10T00:00:00.000Z',
  },
  {
    id: 'stage-0002',
    author_id: defaultAuthorId,
    title: 'ばねコンボ練習場',
    stage_data: createMockStageData(2),
    is_published: false,
    play_count: 15,
    clear_count: 4,
    like_count: 3,
    created_at: '2026-02-20T00:00:00.000Z',
    updated_at: '2026-03-05T00:00:00.000Z',
  },
  {
    id: 'stage-0003',
    author_id: 'user-9999',
    title: '送風機タイムアタック',
    stage_data: createMockStageData(3),
    is_published: true,
    play_count: 300,
    clear_count: 120,
    like_count: 75,
    created_at: '2026-01-21T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
  },
]

const toStageListItem = ({ stage_data: _stageData, ...stage }: StageRecord): StageListItem =>
  stage

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }

  return undefined
}

app.use(
  '/api/*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.get('/', (c) => c.text('Mock API server for Issue #9 is running.'))

app.get('/api/profiles/me', (c) =>
  c.json({
    data: mockProfile,
  }),
)

app.put('/api/profiles/me', async (c) => {
  const body = await c.req.json<{ display_name?: string }>()
  const displayName = body.display_name?.trim() || mockProfile.display_name

  return c.json({
    data: {
      ...mockProfile,
      display_name: displayName,
      updated_at: mockNow,
    },
  })
})

app.get('/api/profiles/me/likes', (c) => {
  const likedStageIds = new Set(['stage-0001', 'stage-0003'])
  const likedStages = mockStages
    .filter((stage) => likedStageIds.has(stage.id))
    .map(toStageListItem)

  return c.json({
    data: likedStages,
    total: likedStages.length,
  })
})

app.get('/api/stages', (c) => {
  const q = c.req.query('q')?.trim().toLowerCase()
  const authorId = c.req.query('author_id')?.trim()
  const isPublished = parseBoolean(c.req.query('is_published'))
  const page = parsePositiveInt(c.req.query('page'), 1)
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 10), 50)
  const offset = (page - 1) * limit

  const filtered = mockStages.filter((stage) => {
    const matchesQuery = q === undefined || stage.title.toLowerCase().includes(q)
    const matchesAuthor = authorId === undefined || stage.author_id === authorId
    const matchesPublished =
      isPublished === undefined || stage.is_published === isPublished

    return matchesQuery && matchesAuthor && matchesPublished
  })

  const paginated = filtered.slice(offset, offset + limit).map(toStageListItem)
  const total = filtered.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

  return c.json({
    data: paginated,
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
    },
    filters: {
      q: q ?? null,
      author_id: authorId ?? null,
      is_published: isPublished ?? null,
    },
  })
})

app.post('/api/stages', async (c) => {
  const body = await c.req.json<{
    title?: string
    stage_data?: StageData
    is_published?: boolean
  }>()

  const stage: StageRecord = {
    id: createMockId('stage'),
    author_id: defaultAuthorId,
    title: body.title?.trim() || 'Untitled Stage',
    stage_data: body.stage_data ?? createMockStageData(4),
    is_published: body.is_published ?? false,
    play_count: 0,
    clear_count: 0,
    like_count: 0,
    created_at: mockNow,
    updated_at: mockNow,
  }

  return c.json({
    data: stage,
    message: 'Mock stage created.',
  })
})

app.get('/api/stages/:id', (c) => {
  const id = c.req.param('id')
  const stage = mockStages.find((item) => item.id === id)

  if (stage) {
    return c.json({ data: stage })
  }

  return c.json({
    data: {
      ...mockStages[0],
      id,
      title: `Mock Stage ${id}`,
      stage_data: createMockStageData(9),
    } satisfies StageRecord,
    message: 'Requested stage was not found in mock list. Returning fallback mock.',
  })
})

app.put('/api/stages/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    title?: string
    stage_data?: StageData
    is_published?: boolean
  }>()
  const base = mockStages.find((stage) => stage.id === id) ?? mockStages[0]

  const updated: StageRecord = {
    ...base,
    id,
    title: body.title?.trim() || base.title,
    stage_data: body.stage_data ?? base.stage_data,
    is_published: body.is_published ?? base.is_published,
    updated_at: mockNow,
  }

  return c.json({
    data: updated,
    message: 'Mock stage updated.',
  })
})

app.delete('/api/stages/:id', (c) => {
  const id = c.req.param('id')

  return c.json({
    data: {
      id,
      deleted: true,
      deleted_at: mockNow,
    },
    message: 'Mock stage deleted.',
  })
})

app.post('/api/stages/:id/play_logs', async (c) => {
  const stageId = c.req.param('id')
  const body = await c.req.json<{
    is_cleared?: boolean
    retry_count?: number
    player_id?: string | null
  }>()

  return c.json({
    data: {
      id: createMockId('playlog'),
      stage_id: stageId,
      player_id: body.player_id ?? null,
      is_cleared: body.is_cleared ?? false,
      retry_count: body.retry_count ?? 0,
      created_at: mockNow,
    },
    aggregates: {
      play_count: 1,
      clear_count: body.is_cleared ? 1 : 0,
    },
  })
})

app.post('/api/stages/:id/likes', (c) => {
  const stageId = c.req.param('id')
  const stage = mockStages.find((item) => item.id === stageId) ?? mockStages[0]
  const liked = (stage.like_count + stageId.length) % 2 === 0

  return c.json({
    data: {
      stage_id: stageId,
      user_id: mockProfile.id,
      liked,
      like_count: liked ? stage.like_count + 1 : Math.max(stage.like_count - 1, 0),
      updated_at: mockNow,
    },
  })
})

export default app
