import { create } from 'zustand'
import { supabase, Profile } from '@/lib/supabase'
import { openUrl } from '@tauri-apps/plugin-opener'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { getCurrentWindow } from '@tauri-apps/api/window'

const OAUTH_REDIRECT_URL = 'nais2://oauth-callback'

interface MarketAuthState {
    user: { id: string; email?: string } | null
    profile: Profile | null
    loading: boolean
    signingIn: boolean

    init: () => Promise<void>
    signInWithDiscord: () => Promise<void>
    cancelSignIn: () => void
    signOut: () => Promise<void>
    updateUsername: (username: string) => Promise<void>
}

let cancelResolver: (() => void) | null = null
let deepLinkUnlisten: (() => void) | null = null

async function loadProfile(userId: string): Promise<Profile | null> {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
        return data as Profile | null
    } catch (e) {
        console.error('[Market] Failed to load profile:', e)
        return null
    }
}

async function processCallbackUrl(callbackUrl: string) {
    const urlObj = new URL(callbackUrl)

    const queryParams = urlObj.searchParams
    const errorCode = queryParams.get('error')
    if (errorCode) {
        const errorDesc = queryParams.get('error_description') || errorCode
        throw new Error(`OAuth 실패: ${decodeURIComponent(errorDesc)}`)
    }

    const hash = urlObj.hash.startsWith('#') ? urlObj.hash.slice(1) : urlObj.hash
    const hashParams = new URLSearchParams(hash)

    const hashError = hashParams.get('error')
    if (hashError) {
        const errorDesc = hashParams.get('error_description') || hashError
        throw new Error(`OAuth 실패: ${decodeURIComponent(errorDesc)}`)
    }

    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    if (!accessToken || !refreshToken) {
        throw new Error('인증 토큰이 없습니다. 다시 시도해주세요.')
    }

    const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    })
    if (sessionError) throw sessionError
}

export const useMarketAuthStore = create<MarketAuthState>((set) => ({
    user: null,
    profile: null,
    loading: true,
    signingIn: false,

    init: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            set({ user: { id: session.user.id, email: session.user.email }, loading: false })
            loadProfile(session.user.id).then(profile => set({ profile }))
        } else {
            set({ user: null, profile: null, loading: false })
        }

        // CRITICAL: onAuthStateChange callback must NOT be async — Supabase
        // awaits all subscribers, causing deadlocks with async DB queries.
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                set({ user: { id: session.user.id, email: session.user.email } })
                loadProfile(session.user.id).then(profile => set({ profile }))
            } else {
                set({ user: null, profile: null })
            }
        })
    },

    signInWithDiscord: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                redirectTo: OAUTH_REDIRECT_URL,
                skipBrowserRedirect: true,
            },
        })

        if (error || !data.url) {
            throw new Error(error?.message || 'Failed to get OAuth URL')
        }

        set({ signingIn: true })

        let resolveCallback: (value: string) => void = () => { }
        let rejectCallback: (reason: any) => void = () => { }
        const callbackPromise = new Promise<string>((resolve, reject) => {
            resolveCallback = resolve
            rejectCallback = reject
        })

        // Register deep-link listener BEFORE opening the browser so we don't
        // miss the callback if the user is very fast.
        deepLinkUnlisten = await onOpenUrl((urls) => {
            const callback = urls.find(u => u.startsWith('nais2://oauth-callback'))
            if (callback) resolveCallback(callback)
        })

        const timeout = setTimeout(() => {
            rejectCallback(new Error('OAuth timeout'))
        }, 5 * 60 * 1000)

        cancelResolver = () => rejectCallback(new Error('OAuth cancelled'))

        try {
            await openUrl(data.url)
            const callbackUrl = await callbackPromise

            // Bring app window back to focus after browser callback.
            try {
                const win = getCurrentWindow()
                await win.unminimize()
                await win.setFocus()
            } catch { }

            await processCallbackUrl(callbackUrl)
        } finally {
            clearTimeout(timeout)
            if (deepLinkUnlisten) {
                deepLinkUnlisten()
                deepLinkUnlisten = null
            }
            cancelResolver = null
            set({ signingIn: false })
        }
    },

    cancelSignIn: () => {
        if (cancelResolver) cancelResolver()
    },

    signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, profile: null })
    },

    updateUsername: async (username: string) => {
        const trimmed = username.trim()
        if (trimmed.length < 2 || trimmed.length > 20) {
            throw new Error('닉네임은 2자 이상 20자 이하여야 합니다')
        }
        const { user, profile } = useMarketAuthStore.getState()
        if (!user || !profile) throw new Error('로그인이 필요합니다')
        if (trimmed === profile.username) return

        const { data, error } = await supabase
            .from('profiles')
            .update({ username: trimmed })
            .eq('id', user.id)
            .select()
            .single()

        if (error) {
            if (error.code === 'P0001' && error.message?.includes('username_cooldown')) {
                const e: any = new Error('username_cooldown')
                e.code = 'username_cooldown'
                throw e
            }
            throw error
        }
        set({ profile: data as Profile })
    },
}))

export const USERNAME_COOLDOWN_HOURS = 24

export function getUsernameCooldownEndsAt(profile: Profile | null): Date | null {
    if (!profile?.username_changed_at) return null
    const lastChanged = new Date(profile.username_changed_at)
    const endsAt = new Date(lastChanged.getTime() + USERNAME_COOLDOWN_HOURS * 60 * 60 * 1000)
    if (endsAt.getTime() <= Date.now()) return null
    return endsAt
}
