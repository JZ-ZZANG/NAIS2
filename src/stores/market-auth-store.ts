import { create } from 'zustand'
import { supabase, Profile } from '@/lib/supabase'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

// We use Supabase's default callback URL as the base,
// and configure Site URL in Supabase dashboard to this unique pattern.
// The embedded browser detects navigation to this URL and extracts tokens.
const OAUTH_CALLBACK_PATTERN = 'nais2-oauth.local/callback'
const OAUTH_REDIRECT_URL = `https://${OAUTH_CALLBACK_PATTERN}`

interface MarketAuthState {
    user: { id: string; email?: string } | null
    profile: Profile | null
    loading: boolean
    signingIn: boolean
    pendingOAuthUrl: string | null

    init: () => Promise<void>
    startDiscordSignIn: () => Promise<string>
    openOAuthBrowser: (url: string, rect: { x: number; y: number; width: number; height: number }) => Promise<void>
    resizeOAuthBrowser: (rect: { x: number; y: number; width: number; height: number }) => Promise<void>
    cancelSignIn: () => Promise<void>
    signOut: () => Promise<void>
}

let cancelResolver: (() => void) | null = null
let callbackUnlisten: UnlistenFn | null = null

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

export const useMarketAuthStore = create<MarketAuthState>((set) => ({
    user: null,
    profile: null,
    loading: true,
    signingIn: false,
    pendingOAuthUrl: null,

    init: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            set({ user: { id: session.user.id, email: session.user.email }, loading: false })
            // Fetch profile async (fire and forget - non-blocking)
            loadProfile(session.user.id).then(profile => set({ profile }))
        } else {
            set({ user: null, profile: null, loading: false })
        }

        // CRITICAL: onAuthStateChange callback must NOT be async because
        // Supabase's setSession/notifyAllSubscribers waits for all callbacks
        // to finish, causing deadlocks if we do async DB queries here.
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                set({ user: { id: session.user.id, email: session.user.email } })
                // Fetch profile separately
                loadProfile(session.user.id).then(profile => set({ profile }))
            } else {
                set({ user: null, profile: null })
            }
        })
    },

    // Step 1: Get OAuth URL from Supabase and set signingIn state.
    // Returns the URL so UI can position the browser after mounting the modal.
    startDiscordSignIn: async () => {
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

        set({ signingIn: true, pendingOAuthUrl: data.url })
        return data.url
    },

    // Step 2: UI calculates target rect from modal container and calls this.
    // Opens the webview at the given coordinates and listens for callback.
    openOAuthBrowser: async (url, rect) => {
        // Create promise + resolvers
        let resolveCallback: (value: string) => void = () => { }
        let rejectCallback: (reason: any) => void = () => { }
        const callbackPromise = new Promise<string>((resolve, reject) => {
            resolveCallback = resolve
            rejectCallback = reject
        })

        // CRITICAL: Await listener registration BEFORE opening the browser.
        // Otherwise the callback event may fire before we're listening and be lost.
        callbackUnlisten = await listen<string>('oauth-callback', (event) => {
            resolveCallback(event.payload)
        })

        // Set up timeout and cancel handler
        const timeout = setTimeout(() => {
            if (callbackUnlisten) callbackUnlisten()
            cancelResolver = null
            rejectCallback(new Error('OAuth timeout'))
        }, 5 * 60 * 1000)

        cancelResolver = () => {
            clearTimeout(timeout)
            if (callbackUnlisten) callbackUnlisten()
            cancelResolver = null
            rejectCallback(new Error('OAuth cancelled'))
        }

        // Now open the browser - listener is guaranteed active
        await invoke('open_oauth_browser', {
            url,
            callbackPattern: OAUTH_CALLBACK_PATTERN,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        })

        try {
            const callbackUrl = await callbackPromise
            clearTimeout(timeout)

            const urlObj = new URL(callbackUrl)

            // Check for error in query params first (OAuth failure case)
            const queryParams = urlObj.searchParams
            const errorCode = queryParams.get('error')
            if (errorCode) {
                const errorDesc = queryParams.get('error_description') || errorCode
                throw new Error(`OAuth 실패: ${decodeURIComponent(errorDesc)}`)
            }

            // Parse hash fragment for tokens
            const hash = urlObj.hash.startsWith('#') ? urlObj.hash.slice(1) : urlObj.hash
            const hashParams = new URLSearchParams(hash)

            // Check for error in hash too
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
        } finally {
            clearTimeout(timeout)
            if (callbackUnlisten) {
                callbackUnlisten()
                callbackUnlisten = null
            }
            cancelResolver = null
            await invoke('close_oauth_browser').catch(() => { })
            set({ signingIn: false, pendingOAuthUrl: null })
        }
    },

    resizeOAuthBrowser: async (rect) => {
        await invoke('resize_oauth_browser', {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        }).catch(() => { })
    },

    cancelSignIn: async () => {
        if (cancelResolver) cancelResolver()
        await invoke('close_oauth_browser').catch(() => { })
        set({ signingIn: false, pendingOAuthUrl: null })
    },

    signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, profile: null })
    },
}))
