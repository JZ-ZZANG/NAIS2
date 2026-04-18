import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

export const hasSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!hasSupabaseConfigured) {
    console.warn(
        '[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — ' +
        'marketplace features will be unavailable. See .env.example.'
    )
}

// Always create a client so the rest of the app can import `supabase` safely.
// With placeholder values the client stays inert — marketplace calls will fail
// at request time, but the app won't crash on startup.
export const supabase = createClient(
    supabaseUrl || 'https://missing.supabase.invalid',
    supabaseAnonKey || 'missing',
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    }
)

// --- Types ---

export interface Profile {
    id: string
    username: string
    avatar_url: string | null
    created_at: string
    username_changed_at: string | null
}

export type MarketPresetType = 'scene' | 'fragment'

export interface MarketPreset {
    id: string
    user_id: string
    title: string
    description: string | null
    type: MarketPresetType
    scene_data: any       // For scene: ScenePreset JSON, for fragment: { files: FragmentFile[] }
    scene_count: number   // For scene: number of scenes, for fragment: number of files
    tags: string[]
    likes_count: number
    downloads_count: number
    reports_count: number
    is_hidden: boolean
    created_at: string
    updated_at: string
    // Joined fields
    profiles?: Profile
    liked_by_me?: boolean
}

export type ReportReason = 'nsfw_minor' | 'real_person' | 'spam' | 'other'

/**
 * Convert Supabase / PostgREST errors into human-readable messages.
 */
export function readableError(e: any): string {
    if (!e) return '알 수 없는 오류'
    const code = e.code
    const msg = e.message || String(e)

    // PostgREST / PostgreSQL codes
    if (code === '23505') return '이미 존재합니다 (중복)'
    if (code === '23503') return '참조 오류 (FK)'
    if (code === '42501') return '권한이 없습니다'
    if (code === 'PGRST301') return '인증이 필요합니다'
    if (code === 'PGRST116') return '데이터를 찾을 수 없습니다'

    // Network / Auth
    if (msg.includes('Failed to fetch')) return '네트워크 연결을 확인해주세요'
    if (msg.includes('JWT expired')) return '세션이 만료되었습니다. 다시 로그인해주세요'
    if (msg.includes('Row level security')) return '권한이 없습니다'

    return msg
}
