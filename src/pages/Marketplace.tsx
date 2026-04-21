import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Store, Heart, Download, LogIn, LogOut, Search, Clock, Flame, User, X, Trash2, Package, Film, Puzzle, Loader2, Pencil, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { supabase, MarketPreset, readableError } from '@/lib/supabase'
import { useMarketAuthStore } from '@/stores/market-auth-store'
import { ScenePreset } from '@/stores/scene-store'
import { FragmentFileMeta } from '@/stores/fragment-store'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ChangeUsernameDialog } from '@/components/marketplace/ChangeUsernameDialog'
import { UploadPresetDialog } from '@/components/marketplace/UploadPresetDialog'
import { UploadFragmentDialog } from '@/components/marketplace/UploadFragmentDialog'
import { SelectScenePresetDialog } from '@/components/marketplace/SelectScenePresetDialog'
import { SelectFragmentFileDialog } from '@/components/marketplace/SelectFragmentFileDialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { MarketPresetType } from '@/lib/supabase'

type SortMode = 'latest' | 'popular'
type ViewMode = 'browse' | 'myUploads'
type ContentFilter = 'all' | MarketPresetType

const PAGE_SIZE = 20

export default function Marketplace() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const user = useMarketAuthStore(s => s.user)
    const profile = useMarketAuthStore(s => s.profile)
    const authLoading = useMarketAuthStore(s => s.loading)
    const authSigningIn = useMarketAuthStore(s => s.signingIn)
    const signInWithDiscord = useMarketAuthStore(s => s.signInWithDiscord)
    const cancelSignIn = useMarketAuthStore(s => s.cancelSignIn)
    const signOut = useMarketAuthStore(s => s.signOut)

    const [presets, setPresets] = useState<MarketPreset[]>([])
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [sortMode, setSortMode] = useState<SortMode>('latest')
    const [searchQuery, setSearchQuery] = useState('')
    const [activeSearch, setActiveSearch] = useState('')
    const [viewMode, setViewMode] = useState<ViewMode>('browse')
    const [contentFilter, setContentFilter] = useState<ContentFilter>('all')
    const [deleteTarget, setDeleteTarget] = useState<MarketPreset | null>(null)
    const [showUsernameDialog, setShowUsernameDialog] = useState(false)
    const [showSelectPresetDialog, setShowSelectPresetDialog] = useState(false)
    const [uploadScenePreset, setUploadScenePreset] = useState<ScenePreset | null>(null)
    const [showSelectFragmentDialog, setShowSelectFragmentDialog] = useState(false)
    const [uploadFragmentFile, setUploadFragmentFile] = useState<FragmentFileMeta | null>(null)

    // Load presets (first page or subsequent page)
    const loadPresets = async (append: boolean = false) => {
        if (append) {
            setLoadingMore(true)
        } else {
            setLoading(true)
        }
        try {
            const offset = append ? presets.length : 0

            let query = supabase
                .from('presets')
                .select('*, profiles!presets_user_id_profiles_fkey(username, avatar_url)')
                .range(offset, offset + PAGE_SIZE - 1)

            if (viewMode === 'myUploads') {
                if (!user) {
                    setPresets([])
                    setHasMore(false)
                    setLoading(false)
                    return
                }
                query = query.eq('user_id', user.id)
            } else {
                query = query.eq('is_hidden', false)
            }

            if (contentFilter !== 'all') {
                query = query.eq('type', contentFilter)
            }

            if (sortMode === 'latest') {
                query = query.order('created_at', { ascending: false })
            } else {
                query = query.order('likes_count', { ascending: false })
            }

            if (activeSearch.trim()) {
                query = query.ilike('title', `%${activeSearch.trim()}%`)
            }

            const { data, error } = await query
            if (error) throw error

            const fetched = (data as MarketPreset[]) || []
            setHasMore(fetched.length === PAGE_SIZE)
            setPresets(prev => append ? [...prev, ...fetched] : fetched)
        } catch (e: any) {
            console.error('Failed to load presets:', e)
            toast({ title: t('marketplace.loadFailed', '프리셋 목록을 불러오지 못했습니다'), description: readableError(e), variant: 'destructive' })
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }

    // Reload whenever filter/sort/view changes
    useEffect(() => {
        loadPresets(false)
    }, [sortMode, viewMode, activeSearch, contentFilter, user?.id])

    const requestDelete = (preset: MarketPreset, e: React.MouseEvent) => {
        e.stopPropagation()
        setDeleteTarget(preset)
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        try {
            const { error } = await supabase.from('presets').delete().eq('id', deleteTarget.id)
            if (error) throw error
            setPresets(prev => prev.filter(p => p.id !== deleteTarget.id))
            toast({ title: t('marketplace.deleted', '프리셋이 삭제되었습니다'), variant: 'success' })
        } catch (e: any) {
            toast({ title: t('marketplace.deleteFailed', '삭제 실패'), description: readableError(e), variant: 'destructive' })
        }
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setActiveSearch(searchQuery)
    }

    const handleSignIn = async () => {
        try {
            await signInWithDiscord()
            toast({ title: t('marketplace.signedIn', '로그인 완료'), variant: 'success' })
        } catch (e: any) {
            if (e.message === 'OAuth cancelled') return
            toast({ title: t('marketplace.signInFailed', '로그인 실패'), description: e.message, variant: 'destructive' })
        }
    }

    const handleSignOut = async () => {
        await signOut()
        toast({ title: t('marketplace.signedOut', '로그아웃됨'), variant: 'default' })
    }

    return (
        <>
        {/* OAuth Waiting Overlay — browser is open externally */}
        {authSigningIn && (
            <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <div>
                        <h3 className="font-semibold text-base mb-1">{t('marketplace.signingInDiscord', 'Discord 로그인')}</h3>
                        <p className="text-sm text-muted-foreground">
                            {t('marketplace.waitingBrowser', '브라우저에서 Discord 로그인을 완료해주세요.')}
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => cancelSignIn()} className="gap-2">
                        <X className="h-4 w-4" />
                        {t('common.cancel', '취소')}
                    </Button>
                </div>
            </div>
        )}
        <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Store className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">{t('marketplace.title', '마켓')}</h1>
                </div>

                {authLoading ? (
                    <div className="h-9 w-32 bg-muted/30 rounded-lg animate-pulse" />
                ) : user && profile ? (
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" className="gap-2 rounded-full">
                                    <Upload className="h-4 w-4" />
                                    {t('marketplace.upload', '업로드')}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => setShowSelectPresetDialog(true)}>
                                    <Film className="h-4 w-4 mr-2 text-blue-400" />
                                    {t('marketplace.uploadScenePreset', '씬 프리셋 업로드')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowSelectFragmentDialog(true)}>
                                    <Puzzle className="h-4 w-4 mr-2 text-green-400" />
                                    {t('marketplace.uploadFragment', '조각 프롬프트 업로드')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                            type="button"
                            onClick={() => setShowUsernameDialog(true)}
                            title={t('marketplace.changeUsername', '닉네임 변경')}
                            className="group flex items-center gap-2 px-3 py-1.5 bg-muted/30 hover:bg-muted/50 rounded-full transition-colors"
                        >
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.username} className="h-6 w-6 rounded-full" />
                            ) : (
                                <User className="h-5 w-5" />
                            )}
                            <span className="text-sm font-medium">{profile.username}</span>
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <Button variant="ghost" size="icon" onClick={handleSignOut} title={t('marketplace.signOut', '로그아웃')}>
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <Button onClick={handleSignIn} disabled={authSigningIn} className="gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white">
                        <LogIn className="h-4 w-4" />
                        {authSigningIn ? t('marketplace.signingIn', '로그인 중...') : t('marketplace.signInDiscord', 'Discord로 로그인')}
                    </Button>
                )}
            </div>

            {/* View Tabs */}
            <div className="flex items-center gap-2 border-b border-border">
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                        viewMode === 'browse' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setViewMode('browse')}
                >
                    {t('marketplace.browse', '둘러보기')}
                </button>
                {user && (
                    <button
                        className={cn(
                            "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
                            viewMode === 'myUploads' ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setViewMode('myUploads')}
                    >
                        <Package className="h-3.5 w-3.5" />
                        {t('marketplace.myUploads', '내 업로드')}
                    </button>
                )}
            </div>

            {/* Search + Filters */}
            <div className="flex items-center gap-3">
                <form onSubmit={handleSearch} className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('marketplace.searchPlaceholder', '프리셋 검색...')}
                        className="pl-10 h-10 rounded-xl"
                    />
                </form>
                <div className="flex items-center bg-muted/30 rounded-xl p-1">
                    <Button variant={contentFilter === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setContentFilter('all')} className="rounded-lg text-xs">
                        {t('marketplace.filterAll', '전체')}
                    </Button>
                    <Button variant={contentFilter === 'scene' ? 'secondary' : 'ghost'} size="sm" onClick={() => setContentFilter('scene')} className="rounded-lg text-xs gap-1">
                        <Film className="h-3 w-3 text-blue-400" />
                        {t('marketplace.filterScene', '씬')}
                    </Button>
                    <Button variant={contentFilter === 'fragment' ? 'secondary' : 'ghost'} size="sm" onClick={() => setContentFilter('fragment')} className="rounded-lg text-xs gap-1">
                        <Puzzle className="h-3 w-3 text-green-400" />
                        {t('marketplace.filterFragment', '조각')}
                    </Button>
                </div>
                <div className="flex items-center bg-muted/30 rounded-xl p-1">
                    <Button
                        variant={sortMode === 'latest' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setSortMode('latest')}
                        className="rounded-lg gap-1.5"
                    >
                        <Clock className="h-3.5 w-3.5" />
                        {t('marketplace.latest', '최신순')}
                    </Button>
                    <Button
                        variant={sortMode === 'popular' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setSortMode('popular')}
                        className="rounded-lg gap-1.5"
                    >
                        <Flame className="h-3.5 w-3.5" />
                        {t('marketplace.popular', '인기순')}
                    </Button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex flex-col gap-2">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="bg-muted/20 rounded-xl h-20 animate-pulse" />
                        ))}
                    </div>
                ) : presets.length === 0 ? (
                    <EmptyState
                        viewMode={viewMode}
                        hasSearch={!!activeSearch.trim()}
                        t={t}
                    />
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            {presets.map(preset => (
                                <PresetRow
                                    key={preset.id}
                                    preset={preset}
                                    onClick={() => navigate(`/marketplace/${preset.id}`)}
                                    showDelete={viewMode === 'myUploads'}
                                    onDelete={(e) => requestDelete(preset, e)}
                                />
                            ))}
                        </div>
                        {hasMore && (
                            <div className="flex justify-center mt-4 pb-4">
                                <Button
                                    variant="outline"
                                    onClick={() => loadPresets(true)}
                                    disabled={loadingMore}
                                    className="rounded-xl"
                                >
                                    {loadingMore
                                        ? t('marketplace.loadingMore', '불러오는 중...')
                                        : t('marketplace.loadMore', '더 보기')}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
        <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            title={t('marketplace.confirmDeleteTitle', '프리셋 삭제')}
            description={t('marketplace.confirmDelete', '이 프리셋을 정말 삭제하시겠습니까? 되돌릴 수 없습니다.')}
            confirmText={t('common.delete', '삭제')}
            cancelText={t('common.cancel', '취소')}
            variant="destructive"
            onConfirm={confirmDelete}
        />
        <ChangeUsernameDialog
            open={showUsernameDialog}
            onOpenChange={setShowUsernameDialog}
        />
        <SelectScenePresetDialog
            open={showSelectPresetDialog}
            onOpenChange={setShowSelectPresetDialog}
            onSelect={(preset) => setUploadScenePreset(preset)}
        />
        <UploadPresetDialog
            open={!!uploadScenePreset}
            onOpenChange={(o) => { if (!o) setUploadScenePreset(null) }}
            preset={uploadScenePreset}
            onUploaded={() => loadPresets(false)}
        />
        <SelectFragmentFileDialog
            open={showSelectFragmentDialog}
            onOpenChange={setShowSelectFragmentDialog}
            onSelect={(file) => setUploadFragmentFile(file)}
        />
        <UploadFragmentDialog
            open={!!uploadFragmentFile}
            onOpenChange={(o) => { if (!o) setUploadFragmentFile(null) }}
            fileId={uploadFragmentFile?.id ?? null}
            onUploaded={() => loadPresets(false)}
        />
        </>
    )
}

function EmptyState({ viewMode, hasSearch, t }: { viewMode: ViewMode; hasSearch: boolean; t: any }) {
    let title: string
    let desc: string

    if (hasSearch) {
        title = t('marketplace.emptySearch', '검색 결과가 없습니다')
        desc = t('marketplace.searchPlaceholder', '다른 키워드로 검색해보세요')
    } else if (viewMode === 'myUploads') {
        title = t('marketplace.emptyMyUploads', '아직 업로드한 프리셋이 없습니다')
        desc = t('marketplace.emptyMyUploadsDesc', '씬 모드에서 프리셋을 공유할 수 있습니다')
    } else {
        title = t('marketplace.empty', '아직 공유된 프리셋이 없습니다')
        desc = t('marketplace.emptyDesc', '첫 번째 프리셋을 공유해보세요!')
    }

    return (
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
            <Store className="h-16 w-16 opacity-30 mb-4" />
            <p className="text-lg font-medium">{title}</p>
            <p className="text-sm mt-2">{desc}</p>
        </div>
    )
}

function PresetRow({ preset, onClick, showDelete, onDelete }: {
    preset: MarketPreset
    onClick: () => void
    showDelete?: boolean
    onDelete?: (e: React.MouseEvent) => void
}) {
    const timeAgo = (date: string) => {
        const d = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
        if (d < 60) return '방금 전'
        if (d < 3600) return `${Math.floor(d / 60)}분 전`
        if (d < 86400) return `${Math.floor(d / 3600)}시간 전`
        if (d < 2592000) return `${Math.floor(d / 86400)}일 전`
        return new Date(date).toLocaleDateString('ko-KR')
    }

    return (
        <div
            onClick={onClick}
            className="bg-card border border-border rounded-xl hover:border-primary/50 transition-colors cursor-pointer group px-4 py-3 flex items-center gap-4"
        >
            {/* Main info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    {preset.type === 'fragment' ? (
                        <Puzzle className="h-4 w-4 text-green-400 shrink-0" />
                    ) : (
                        <Film className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                    <h3 className="font-semibold text-base truncate">{preset.title}</h3>
                    <span className="text-xs text-muted-foreground shrink-0">·</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                        {preset.type === 'fragment' ? `${preset.scene_count}개` : `${preset.scene_count}씬`}
                    </span>
                </div>
                {preset.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{preset.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate max-w-[150px]">@{preset.profiles?.username || 'anonymous'}</span>
                    <span>·</span>
                    <span>{timeAgo(preset.created_at)}</span>
                    {preset.tags.length > 0 && (
                        <>
                            <span>·</span>
                            <div className="flex gap-1 overflow-hidden">
                                {preset.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px]">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground shrink-0">
                <span className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" />
                    {preset.likes_count}
                </span>
                <span className="flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" />
                    {preset.downloads_count}
                </span>
            </div>

            {/* Delete button for my uploads */}
            {showDelete && onDelete && (
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={onDelete}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
        </div>
    )
}
