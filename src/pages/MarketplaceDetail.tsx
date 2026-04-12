import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Heart, Download, Flag, User, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { supabase, MarketPreset, readableError } from '@/lib/supabase'
import { useMarketAuthStore } from '@/stores/market-auth-store'
import { useSceneStore } from '@/stores/scene-store'
import { useFragmentStore } from '@/stores/fragment-store'
import { ReportDialog } from '@/components/marketplace/ReportDialog'
import { cn } from '@/lib/utils'

export default function MarketplaceDetail() {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const user = useMarketAuthStore(s => s.user)
    const importPreset = useSceneStore(s => s.importPreset)
    const importFragments = useFragmentStore(s => s.importAll)

    const [preset, setPreset] = useState<MarketPreset | null>(null)
    const [loading, setLoading] = useState(true)
    const [liked, setLiked] = useState(false)
    const [likeLoading, setLikeLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [reportOpen, setReportOpen] = useState(false)

    useEffect(() => {
        if (!id) return
        loadPreset()
    }, [id])

    const loadPreset = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('presets')
                .select('*, profiles!presets_user_id_profiles_fkey(username, avatar_url)')
                .eq('id', id)
                .single()

            if (error) throw error
            setPreset(data as MarketPreset)

            // Check if current user liked this preset
            if (user) {
                const { data: likeData } = await supabase
                    .from('preset_likes')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('preset_id', id)
                    .maybeSingle()
                setLiked(!!likeData)
            }
        } catch (e: any) {
            console.error('Failed to load preset:', e)
            toast({ title: t('marketplace.loadFailed', '프리셋 로드 실패'), description: readableError(e), variant: 'destructive' })
            navigate('/marketplace')
        } finally {
            setLoading(false)
        }
    }

    const handleLike = async () => {
        if (!user) {
            toast({ title: t('marketplace.loginRequired', '로그인이 필요합니다'), variant: 'destructive' })
            return
        }
        if (!preset || likeLoading) return

        setLikeLoading(true)
        try {
            if (liked) {
                await supabase
                    .from('preset_likes')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('preset_id', preset.id)
                setLiked(false)
                setPreset({ ...preset, likes_count: Math.max(0, preset.likes_count - 1) })
            } else {
                await supabase.from('preset_likes').insert({ user_id: user.id, preset_id: preset.id })
                setLiked(true)
                setPreset({ ...preset, likes_count: preset.likes_count + 1 })
            }
        } catch (e: any) {
            console.error('Like failed:', e)
            toast({ title: t('marketplace.likeFailed', '좋아요 실패'), variant: 'destructive' })
        } finally {
            setLikeLoading(false)
        }
    }

    const handleDownload = async () => {
        if (!user) {
            toast({ title: t('marketplace.loginRequired', '로그인이 필요합니다'), variant: 'destructive' })
            return
        }
        if (!preset) return

        setDownloading(true)
        try {
            if (preset.type === 'fragment') {
                // Import fragment data
                await importFragments(preset.scene_data)
            } else {
                // Import scene data into local scene store with marketplace title as preset name
                importPreset({ ...preset.scene_data, name: preset.title })
            }

            // Record download (for counter). Ignore errors (e.g. duplicate download)
            try {
                await supabase.from('preset_downloads').insert({ user_id: user.id, preset_id: preset.id })
            } catch { }

            toast({
                title: t('marketplace.downloadSuccess', '씬 모드에 추가됨'),
                description: t('marketplace.downloadSuccessDesc', '씬 모드에서 확인해보세요'),
                variant: 'success',
            })
        } catch (e: any) {
            console.error('Download failed:', e)
            toast({ title: t('marketplace.downloadFailed', '다운로드 실패'), description: readableError(e), variant: 'destructive' })
        } finally {
            setDownloading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!preset) return null

    const scenes = Array.isArray(preset.scene_data?.scenes) ? preset.scene_data.scenes : []
    const fragments = Array.isArray(preset.scene_data?.meta) ? preset.scene_data.meta : []
    const isFragment = preset.type === 'fragment'

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto w-full p-6 space-y-6">
                {/* Back */}
                <Button variant="ghost" size="sm" onClick={() => navigate('/marketplace')} className="gap-2 -ml-2">
                    <ArrowLeft className="h-4 w-4" />
                    {t('marketplace.back', '목록으로')}
                </Button>

                {/* Header */}
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">{preset.title}</h1>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            {preset.profiles?.avatar_url ? (
                                <img src={preset.profiles.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                            ) : (
                                <User className="h-4 w-4" />
                            )}
                            <span>@{preset.profiles?.username || 'anonymous'}</span>
                        </div>
                        <span>·</span>
                        <span>{new Date(preset.created_at).toLocaleDateString('ko-KR')}</span>
                        <span>·</span>
                        <span>{t('marketplace.sceneCount', '씬')} {preset.scene_count}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    <Button onClick={handleDownload} disabled={downloading} className="gap-2 flex-1">
                        <Download className="h-4 w-4" />
                        {downloading
                            ? t('marketplace.adding', '추가 중...')
                            : isFragment
                                ? t('marketplace.addFragments', '내 조각 프롬프트에 추가')
                                : t('marketplace.addToScene', '내 씬 모드에 추가')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleLike}
                        disabled={likeLoading}
                        className="gap-2"
                    >
                        <Heart className={cn('h-4 w-4', liked && 'fill-red-500 text-red-500')} />
                        {preset.likes_count}
                    </Button>
                </div>

                {/* Description */}
                {preset.description && (
                    <div className="p-4 bg-muted/30 rounded-xl">
                        <p className="text-sm whitespace-pre-wrap">{preset.description}</p>
                    </div>
                )}

                {/* Tags */}
                {preset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {preset.tags.map(tag => (
                            <span key={tag} className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Content preview */}
                <div>
                    <h2 className="text-sm font-semibold mb-3 text-muted-foreground">
                        {isFragment
                            ? `${t('marketplace.includedFragments', '포함된 조각')} (${fragments.length})`
                            : `${t('marketplace.includedScenes', '포함된 씬')} (${scenes.length})`}
                    </h2>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                        {isFragment ? (
                            fragments.map((file: any, i: number) => (
                                <div key={file.id || i} className="px-3 py-2 bg-muted/20 rounded-lg text-sm">
                                    <div className="font-medium truncate">
                                        {file.folder ? `${file.folder}/` : ''}{file.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {file.lineCount || file.content?.length || 0} lines
                                    </div>
                                </div>
                            ))
                        ) : (
                            scenes.map((scene: any, i: number) => (
                                <div key={scene.id || i} className="px-3 py-2 bg-muted/20 rounded-lg text-sm">
                                    <div className="font-medium truncate">{scene.name || `Scene ${i + 1}`}</div>
                                    {scene.scenePrompt && (
                                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                                            {scene.scenePrompt}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Report */}
                <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('marketplace.downloadsLabel', '다운로드')}: {preset.downloads_count}</span>
                    <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)} className="gap-1.5 text-destructive hover:text-destructive">
                        <Flag className="h-3.5 w-3.5" />
                        {t('marketplace.report', '신고하기')}
                    </Button>
                </div>
            </div>

            <ReportDialog
                open={reportOpen}
                onOpenChange={setReportOpen}
                presetId={preset.id}
            />
        </div>
    )
}
