import { ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { PromptPanel } from './PromptPanel'
import { HistoryPanel } from './HistoryPanel'
import { AnimatedNavBar } from './AnimatedNavBar'
import { CustomTitleBar } from './CustomTitleBar'
import { PresetDropdown } from '@/components/preset/PresetDropdown'
import { useAuthStore } from '@/stores/auth-store'
import { SHORTCUT_EVENTS } from '@/hooks/useShortcuts'
import GlassSurface from '@/components/ui/GlassSurface'
import { Tip } from '@/components/ui/tooltip'
import {
    Home,
    Film,
    Globe,
    Images,
    Settings,
    Coins,
    Wand2,
    Zap,
    PanelLeft,
    PanelRight,
    Store,
} from 'lucide-react'

interface ThreeColumnLayoutProps {
    children: ReactNode
}

import { calculateExtraCost } from '@/lib/anlas-calculator'
import { useCharacterStore } from '@/stores/character-store'
import { usePresetStore } from '@/stores/preset-store'
import { useLayoutStore } from '@/stores/layout-store'

// Check if running on Mac (works in browser and Tauri WebView)
const isMac = navigator.platform.toUpperCase().includes('MAC') ||
    navigator.userAgent.toUpperCase().includes('MAC')

export function ThreeColumnLayout({ children }: ThreeColumnLayoutProps) {
    const { t } = useTranslation()
    const location = useLocation()
    const { anlas, isVerified, refreshAnlas } = useAuthStore()
    const { leftSidebarVisible, rightSidebarVisible, toggleLeftSidebar, toggleRightSidebar } = useLayoutStore()

    // Get generation params for cost calculation
    const { characterImages, vibeImages } = useCharacterStore()

    // Get active preset for header display
    const { presets, activePresetId } = usePresetStore()
    const activePreset = presets.find(p => p.id === activePresetId)

    // Preset dialog state (for shortcut support)
    const [presetDialogOpen, setPresetDialogOpen] = useState(false)

    // 프리셋 다이얼로그 단축키 이벤트 수신
    useEffect(() => {
        const handleOpenPreset = () => setPresetDialogOpen(prev => !prev)

        window.addEventListener(SHORTCUT_EVENTS.OPEN_PRESET_DIALOG, handleOpenPreset)
        return () => {
            window.removeEventListener(SHORTCUT_EVENTS.OPEN_PRESET_DIALOG, handleOpenPreset)
        }
    }, [])

    // Calculate cached vs uncached vibes (only enabled ones)
    const enabledVibes = vibeImages.filter(v => v.enabled !== false)
    const uncachedVibeCount = enabledVibes.filter(v => !v.encodedVibe).length
    const cachedVibeCount = enabledVibes.length - uncachedVibeCount

    // Count only enabled character images
    const enabledCharCount = characterImages.filter(c => c.enabled !== false).length

    // Only calculate extra costs for enabled uncached vibes and enabled characters
    const cost = calculateExtraCost(
        enabledCharCount,
        uncachedVibeCount
    )

    // Refresh Anlas on mount if verified
    useEffect(() => {
        if (isVerified) {
            refreshAnlas()
        }
    }, [isVerified, refreshAnlas])

    const navItems = [
        { path: '/', icon: Home, labelKey: 'nav.main' },
        { path: '/scenes', icon: Film, labelKey: 'nav.scenes' },
        { path: '/tools', icon: Wand2, labelKey: 'smartTools.title' },
        { path: '/marketplace', icon: Store, labelKey: 'nav.marketplace' },
        { path: '/web', icon: Globe, labelKey: 'nav.web' },
        { path: '/library', icon: Images, labelKey: 'nav.library' },
        { path: '/settings', icon: Settings, labelKey: 'nav.settings' },
    ]

    // Format Anlas number
    const formatAnlas = (value: number) => {
        return value.toLocaleString()
    }

    return (
        <div className="flex flex-col h-screen bg-background overflow-hidden">
            {/* Custom Title Bar - Only show on Windows (Mac uses native decorations) */}
            {!isMac && <CustomTitleBar />}

            {/* Main Layout */}
            <div className="flex flex-1 p-3 gap-3 overflow-hidden">
                {/* Left Panel - Prompt Input (Fixed, Rounded Box) */}
                <aside className={cn(
                    "w-[420px] xl:w-[460px] 2xl:w-[500px] flex-shrink-0 flex flex-col bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden shadow-lg transition-all duration-200",
                    !leftSidebarVisible && "hidden"
                )}>
                    {/* Header - Preset Title & Anlas Display */}
                    <div className="h-14 flex items-center justify-between px-4">
                        {/* Preset Title + Dialog Trigger */}
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold truncate max-w-[180px]">
                                {activePreset?.name || t('preset.default', '기본')}
                            </h2>
                            <PresetDropdown open={presetDialogOpen} onOpenChange={setPresetDialogOpen} />
                        </div>

                        {/* Anlas Display */}
                        {isVerified && anlas ? (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 rounded-full border border-amber-500/30">
                                    <Coins className="h-4 w-4 text-amber-500" />
                                    <span className="text-sm font-semibold text-amber-500">
                                        {formatAnlas(anlas.total)}
                                    </span>
                                </div>
                                {(cost > 0 || cachedVibeCount > 0) && (
                                    <div className={cn(
                                        "flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-bold animate-in fade-in slide-in-from-left-2 shadow-sm",
                                        cost > 0
                                            ? "bg-destructive/10 border-destructive/30 text-destructive"
                                            : "bg-blue-500/10 border-blue-500/30 text-blue-500"
                                    )}>
                                        {cost > 0 && <span>-{cost}</span>}
                                        {cachedVibeCount > 0 && (
                                            <Zap className={cn("h-3 w-3", cost === 0 && "ml-0.5")} fill="currentColor" />
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full">
                                <Coins className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                    {t('settingsPage.api.token')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Prompt Panel */}
                    <PromptPanel />
                </aside>

                {/* Center Panel - Page Content (Rounded Box) */}
                <div className="flex-1 flex flex-col min-w-0 bg-card/30 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden shadow-lg">
                    {/* Tab Navigation (Glass Surface) */}
                    <div className="shrink-0 flex items-center justify-center py-3 z-10 gap-2">
                        {/* Mac: Left sidebar toggle */}
                        {isMac && (
                            <Tip content={t('layout.toggleLeftSidebar', 'Toggle Left Sidebar')}>
                                <button
                                    onClick={toggleLeftSidebar}
                                    className={cn(
                                        "p-1.5 rounded-full transition-colors",
                                        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                        !leftSidebarVisible && "opacity-50"
                                    )}
                                >
                                    <PanelLeft className="h-4 w-4" />
                                </button>
                            </Tip>
                        )}
                        <GlassSurface
                            width="fit-content"
                            height={52}
                            borderRadius={30}
                            opacity={0.6}
                            blur={15}
                            borderWidth={0.5}
                            className="flex items-center px-2"
                        >
                            <AnimatedNavBar items={navItems} />
                        </GlassSurface>
                        {/* Mac: Right sidebar toggle */}
                        {isMac && (
                            <Tip content={t('layout.toggleRightSidebar', 'Toggle Right Sidebar')}>
                                <button
                                    onClick={toggleRightSidebar}
                                    className={cn(
                                        "p-1.5 rounded-full transition-colors",
                                        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                        !rightSidebarVisible && "opacity-50"
                                    )}
                                >
                                    <PanelRight className="h-4 w-4" />
                                </button>
                            </Tip>
                        )}
                    </div>

                    {/* Page Content */}
                    <main className={cn(
                        "flex-1 relative",
                        (location.pathname === '/' || location.pathname === '/library') ? "p-0 overflow-hidden" : "p-4 overflow-y-auto"
                    )}>
                        {children}
                    </main>
                </div>

                {/* Right Panel - History Only (Rounded Box) */}
                <aside className={cn(
                    "w-[280px] flex-shrink-0 bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden shadow-lg transition-all duration-200",
                    !rightSidebarVisible && "hidden"
                )}>
                    <HistoryPanel />
                </aside>
            </div>
        </div>
    )
}
