import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ResolutionSelector, Resolution } from '@/components/ui/ResolutionSelector'
import {
    ChevronLeft,
    Check,
    Play,
    Image as ImageIcon,
    FolderOpen,
    Minus,
    Plus,
    X,
    Pencil,
    Star,
    Trash2,
    CheckSquare,
    Square
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { AutocompleteTextarea } from "@/components/ui/AutocompleteTextarea";
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSceneStore, SceneImage } from '@/stores/scene-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useSceneGeneration } from '@/hooks/useSceneGeneration'
import { Command } from '@tauri-apps/plugin-shell'
import { MetadataDialog } from '@/components/metadata/MetadataDialog'
import { ImageReferenceDialog } from '@/components/metadata/ImageReferenceDialog'
import { InpaintingDialog } from '@/components/tools/InpaintingDialog'
import { pictureDir, join } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/core'
import { exists, readFile, remove } from '@tauri-apps/plugin-fs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'

export default function SceneDetail() {
    const { id: sceneId } = useParams()
    const { t } = useTranslation()
    const activePresetId = useSceneStore(state => state.activePresetId)

    // Use reactive selector for scene - this ensures component re-renders when scene.images changes
    const scene = useSceneStore(state => {
        const preset = state.presets.find(p => p.id === state.activePresetId)
        return preset?.scenes.find(s => s.id === sceneId)
    })

    const {
        renameScene,
        toggleFavorite,
        deleteImage,
        deleteNonFavoriteImages,
        incrementQueue,
        decrementQueue,
        validateSceneImages,
        updateSceneSettings,
    } = useSceneStore()
    const { isGenerating: _isGlobalGenerating } = useSceneGeneration()
    const { promptFontSize } = useSettingsStore()

    // --- Resolution Logic ---
    const currentWidth = scene?.width || 832
    const currentHeight = scene?.height || 1216

    // Handler for ResolutionSelector
    const handleResolutionChange = (resolution: Resolution) => {
        if (activePresetId && sceneId) {
            updateSceneSettings(activePresetId, sceneId, { width: resolution.width, height: resolution.height })
        }
    }

    // Current resolution value for ResolutionSelector
    const currentResolution: Resolution = {
        label: `${currentWidth} × ${currentHeight}`,
        width: currentWidth,
        height: currentHeight
    }

    const [editName, setEditName] = useState(scene?.name || '')
    // Dialog states
    const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
    const [selectedImageForMetadata, setSelectedImageForMetadata] = useState<string | undefined>()
    const [imageRefDialogOpen, setImageRefDialogOpen] = useState(false)
    const [selectedImageForRef, setSelectedImageForRef] = useState<string | null>(null)
    const [inpaintDialogOpen, setInpaintDialogOpen] = useState(false)
    const [selectedImageForInpaint, setSelectedImageForInpaint] = useState<string | null>(null)
    const [isEditingName, setIsEditingName] = useState(false)
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
    const [viewerImageSrc, setViewerImageSrc] = useState<string | null>(null)
    const [viewerImage, setViewerImage] = useState<SceneImage | null>(null)  // Current image object for context menu
    const streamingSceneId = useSceneStore(s => s.streamingSceneId)
    const streamingImage = useSceneStore(s => s.streamingSceneId === sceneId ? s.streamingImage : null)
    const streamingProgress = useSceneStore(s => s.streamingSceneId === sceneId ? s.streamingProgress : 0)
    const thumbnailLayout = useSceneStore(s => s.thumbnailLayout)

    // Edit mode state
    const [isEditMode, setIsEditMode] = useState(false)
    const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())

    // Auto-save prompt logic - hooks must be before conditional return
    const updateScenePrompt = useSceneStore(state => state.updateScenePrompt)
    const [localPrompt, setLocalPrompt] = useState(scene?.scenePrompt || '')

    const nav = useNavigate()

    // ESC key handler for closing viewer or navigating back
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (viewerImageSrc) {
                    setViewerImageSrc(null)
                } else {
                    // Navigate back to scene list
                    nav('/scenes')
                }
            }
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [viewerImageSrc, nav])

    // Memory cleanup on unmount - release streaming data when leaving scene detail
    // This prevents OOM when switching between modes (Issue #6)
    useEffect(() => {
        return () => {
            console.log('[SceneDetail] Unmounting - clearing streaming data')
            useSceneStore.getState().clearRuntimeData()
        }
    }, [])

    useEffect(() => {
        if (scene) {
            setEditName(scene.name)
        }
    }, [scene?.name])

    // Sync local prompt when scene ID changes
    useEffect(() => {
        if (scene) {
            setLocalPrompt(scene.scenePrompt)
        }
    }, [scene?.id])

    // Debounced save of prompt to store + save on unmount
    useEffect(() => {
        if (!scene || !activePresetId) return
        if (localPrompt === scene.scenePrompt) return

        const timer = setTimeout(() => {
            updateScenePrompt(activePresetId, scene.id, localPrompt)
        }, 1000)

        return () => {
            clearTimeout(timer)
            // Save immediately on unmount if changed
            const currentScene = useSceneStore.getState().presets
                .find(p => p.id === activePresetId)?.scenes
                .find(s => s.id === scene.id)
            if (currentScene && localPrompt !== currentScene.scenePrompt) {
                updateScenePrompt(activePresetId, scene.id, localPrompt)
            }
        }
    }, [localPrompt, scene, activePresetId, updateScenePrompt])

    // Auto-validate images on mount - MUST be before conditional return to maintain hook order
    useEffect(() => {
        if (!scene || !activePresetId || !validateSceneImages) return

        const validateImages = async () => {
            if (scene.images.length === 0) return

            const validImageIds: string[] = []
            let hasChanges = false

            for (const img of scene.images) {
                try {
                    // Check if url is a file path
                    if (!img.url.startsWith('data:')) {
                        if (await exists(img.url)) {
                            validImageIds.push(img.id)
                        } else {
                            hasChanges = true
                        }
                    } else {
                        // Keep base64 images
                        validImageIds.push(img.id)
                    }
                } catch (e) {
                    // If check fails, assume valid to be safe
                    validImageIds.push(img.id)
                }
            }

            // Only update if changes needed
            if (hasChanges && validImageIds.length !== scene.images.length) {
                validateSceneImages(activePresetId, scene.id, validImageIds)
            }
        }

        validateImages()
    }, [scene?.id, activePresetId, validateSceneImages])

    const handleBack = () => {
        // Save prompt immediately before leaving
        if (scene && activePresetId && localPrompt !== scene.scenePrompt) {
            updateScenePrompt(activePresetId, scene.id, localPrompt)
        }
        nav('/scenes')
    }

    if (!scene || !activePresetId) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                <p>{t('scene.notFound', '씬을 찾을 수 없습니다')}</p>
                <Button onClick={handleBack} variant="outline">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    {t('common.back', '돌아가기')}
                </Button>
            </div>
        )
    }

    const handleSaveName = () => {
        if (editName.trim()) {
            renameScene(activePresetId, scene.id, editName.trim())
        }
        setIsEditingName(false)
    }

    const handleGenerate = () => {
        if (!activePresetId || !scene) return

        // If queue count is 0, set it to 1 for single generation
        // Otherwise, use the existing queue count without incrementing
        if (scene.queueCount === 0) {
            incrementQueue(activePresetId, scene.id)
        }

        // Start a new generation session to properly track and allow cancellation
        useSceneStore.getState().startNewGenerationSession('detail')
    }

    const handleOpenFolder = async () => {
        try {
            if (!scene) return

            // Get preset name for folder structure
            const currentPreset = useSceneStore.getState().presets.find(p => p.id === activePresetId)
            const safePresetName = (currentPreset?.name || 'Default').replace(/[<>:"/\\|?*]/g, '_').trim()
            // Sanitize scene name for folder name - MUST match useSceneGeneration.ts logic
            const safeSceneName = scene.name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled_Scene'

            const { savePath, useAbsolutePath } = useSettingsStore.getState()
            let folderPath: string

            if (useAbsolutePath && savePath) {
                // Absolute path: savePath/NAIS_Scene/<PresetName>/<SceneName>
                folderPath = await join(savePath, 'NAIS_Scene', safePresetName, safeSceneName)

                if (!(await exists(folderPath))) {
                    // Try parent folder (preset folder)
                    const presetPath = await join(savePath, 'NAIS_Scene', safePresetName)
                    if (await exists(presetPath)) {
                        await Command.create('explorer', [presetPath]).execute()
                    } else {
                        // Try NAIS_Scene folder
                        const naisPath = await join(savePath, 'NAIS_Scene')
                        if (await exists(naisPath)) {
                            await Command.create('explorer', [naisPath]).execute()
                        }
                    }
                    return
                }
            } else {
                // Relative path: Pictures/NAIS_Scene/<PresetName>/<SceneName>
                const picDir = await pictureDir()
                folderPath = await join(picDir, 'NAIS_Scene', safePresetName, safeSceneName)

                if (!(await exists(folderPath))) {
                    const presetPath = await join(picDir, 'NAIS_Scene', safePresetName)
                    if (await exists(presetPath)) {
                        await Command.create('explorer', [presetPath]).execute()
                    } else {
                        const parentPath = await join(picDir, 'NAIS_Scene')
                        if (await exists(parentPath)) {
                            await Command.create('explorer', [parentPath]).execute()
                        }
                    }
                    return
                }
            }

            // Open folder in explorer
            await Command.create('explorer', [folderPath]).execute()
        } catch (error) {
            console.error("Failed to open folder:", error)
        }
    }

    const isStreaming = streamingSceneId === scene.id

    const sortedImages = showFavoritesOnly
        ? scene.images.filter(img => img.isFavorite)
        : scene.images

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Tip content={t('actions.openFolder', '생성된 이미지 폴더 열기')}>
                        <Button variant="ghost" size="icon" className="rounded-xl" onClick={handleOpenFolder}>
                            <FolderOpen className="h-5 w-5 text-muted-foreground" />
                        </Button>
                    </Tip>
                    <Tip content={t('actions.back', '씬 목록으로 돌아가기')}>
                        <Button variant="ghost" size="icon" className="rounded-xl" onClick={handleBack}>
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                    </Tip>
                    <div>
                        {isEditingName ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="text-2xl font-bold h-9 w-64 rounded-lg"
                                    autoFocus
                                    onBlur={handleSaveName}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveName()
                                        if (e.key === 'Escape') setIsEditingName(false)
                                    }}
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleSaveName}>
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setIsEditingName(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold">{scene.name}</h1>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-50 hover:opacity-100" onClick={() => setIsEditingName(true)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                        <p className="text-muted-foreground text-sm">{t('scene.editPrompt')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Resolution Settings */}
                    <div className="w-[220px]">
                        <ResolutionSelector
                            value={currentResolution}
                            onChange={handleResolutionChange}
                        />
                    </div>

                    <div className="w-px h-8 bg-border mx-2" />

                    {/* Queue Controls */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/50">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => decrementQueue(activePresetId, scene.id)}
                            disabled={scene.queueCount === 0}
                        >
                            <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-medium w-8 text-center">{scene.queueCount}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => incrementQueue(activePresetId, scene.id)}
                        >
                            <Plus className="h-3 w-3" />
                        </Button>
                    </div>


                    <Button size="sm" className="rounded-xl" onClick={handleGenerate}>
                        <Play className="mr-2 h-4 w-4" />
                        {t('generate.button')}
                    </Button>
                </div>
            </div >

            {/* Scene Prompt - Clean Style like PromptPanel */}
            < div className="flex flex-col min-h-[140px] shrink-0" >
                <label className="text-xs font-medium text-muted-foreground mb-1">{t('scene.scenePrompt')}</label>
                <AutocompleteTextarea
                    placeholder=""
                    className="flex-1 min-h-0 resize-none rounded-xl"
                    style={{ fontSize: `${promptFontSize}px` }}
                    value={localPrompt}
                    onChange={(e: any) => setLocalPrompt(e.target.value)}
                />
            </div >

            {/* Generated Images - Large Section */}
            < Card glass className="flex-1 overflow-hidden flex flex-col mt-2" >
                <CardHeader className="py-3 flex-row items-center justify-between shrink-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                        {t('scene.generatedImages')}
                        <span className="text-muted-foreground font-normal">({scene.images.length})</span>
                        {isEditMode && selectedImageIds.size > 0 && (
                            <span className="text-primary font-medium ml-2">
                                {t('scene.selectedCount', '{{count}}개 선택됨', { count: selectedImageIds.size })}
                            </span>
                        )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {isEditMode ? (
                            <>
                                {/* Select All / Deselect All */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-lg gap-1"
                                    onClick={() => {
                                        if (selectedImageIds.size === scene.images.length) {
                                            setSelectedImageIds(new Set())
                                        } else {
                                            setSelectedImageIds(new Set(scene.images.map(img => img.id)))
                                        }
                                    }}
                                >
                                    {selectedImageIds.size === scene.images.length ? (
                                        <Square className="h-3 w-3" />
                                    ) : (
                                        <CheckSquare className="h-3 w-3" />
                                    )}
                                    {selectedImageIds.size === scene.images.length ? t('scene.deselectAll', '선택 해제') : t('scene.selectAll', '전체 선택')}
                                </Button>
                                {/* Delete Selected */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-lg gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={async () => {
                                        if (activePresetId && sceneId && selectedImageIds.size > 0) {
                                            for (const imgId of selectedImageIds) {
                                                const img = scene.images.find(i => i.id === imgId)
                                                if (img && !img.url.startsWith('data:')) {
                                                    try { await remove(img.url) } catch (e) { console.warn('Delete failed:', e) }
                                                }
                                                deleteImage(activePresetId, scene.id, imgId)
                                            }
                                            toast({ description: t('scene.deletedSelected', '{{count}}개 이미지 삭제됨', { count: selectedImageIds.size }) })
                                            setSelectedImageIds(new Set())
                                        }
                                    }}
                                    disabled={selectedImageIds.size === 0}
                                >
                                    <Trash2 className="h-3 w-3" />
                                    {t('scene.deleteSelected', '선택 삭제')}
                                </Button>
                                {/* Exit Edit Mode */}
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 rounded-lg gap-1"
                                    onClick={() => {
                                        setIsEditMode(false)
                                        setSelectedImageIds(new Set())
                                    }}
                                >
                                    <Check className="h-3 w-3" />
                                    {t('scene.exitEditMode', '편집 종료')}
                                </Button>
                            </>
                        ) : (
                            <>
                                {/* Edit Mode Button */}
                                <Tip content={t('scene.editMode', '편집 모드')}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 rounded-lg gap-1"
                                        onClick={() => setIsEditMode(true)}
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </Button>
                                </Tip>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-lg gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={async () => {
                                        if (activePresetId && sceneId) {
                                            const { count, paths } = deleteNonFavoriteImages(activePresetId, sceneId)
                                            // Delete actual files
                                            for (const filePath of paths) {
                                                try {
                                                    await remove(filePath)
                                                } catch (e) {
                                                    console.warn('Failed to delete file:', filePath, e)
                                                }
                                            }
                                            if (count > 0) {
                                                toast({ description: t('scene.deletedNonFavorites', '{{count}}개 이미지 삭제됨', { count }) })
                                            }
                                        }
                                    }}
                                    disabled={scene.images.filter(img => !img.isFavorite).length === 0}
                                >
                                    <Trash2 className="h-3 w-3" />
                                    {t('scene.deleteNonFavorites', '즐겨찾기 제외 삭제')}
                                </Button>
                                <Button
                                    variant={showFavoritesOnly ? "default" : "outline"}
                                    size="sm"
                                    className="h-7 rounded-lg gap-1"
                                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                                >
                                    <Star className={`h-3 w-3 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                                    {t('scene.favoritesOnly', '즐겨찾기')}
                                </Button>
                            </>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {sortedImages.length === 0 && !isStreaming ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                            <ImageIcon className="h-16 w-16 mb-4 stroke-1" />
                            <p>{t('scene.noImages', '생성된 이미지가 없습니다')}</p>
                        </div>
                    ) : (
                        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                            {/* Streaming Card Slot */}
                            {isStreaming && streamingImage && (
                                <div className={cn("rounded-xl overflow-hidden bg-muted/30 relative border border-primary/50 shadow-[0_0_15px_rgba(59,130,246,0.5)]", thumbnailLayout === 'vertical' ? "aspect-[2/3]" : "aspect-[3/2]")}>
                                    <img src={streamingImage} alt="Generating..." className="w-full h-full object-cover animate-pulse opacity-80" />
                                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gray-500/50">
                                        <div className="h-full bg-white transition-all duration-300 shadow-[0_0_8px_rgba(255,255,255,0.8)]" style={{ width: `${streamingProgress * 100}%` }} />
                                    </div>
                                </div>
                            )}

                            {sortedImages.map((image) => (
                                <SceneImageCard
                                    key={image.id}
                                    image={image}
                                    thumbnailLayout={thumbnailLayout}
                                    isEditMode={isEditMode}
                                    isSelected={selectedImageIds.has(image.id)}
                                    onSelect={() => {
                                        const newSet = new Set(selectedImageIds)
                                        if (newSet.has(image.id)) {
                                            newSet.delete(image.id)
                                        } else {
                                            newSet.add(image.id)
                                        }
                                        setSelectedImageIds(newSet)
                                    }}
                                    onDelete={() => deleteImage(activePresetId, scene.id, image.id)}
                                    onToggleFavorite={() => toggleFavorite(activePresetId, scene.id, image.id)}
                                    // Handlers for new context menu items
                                    onAddRef={async () => {
                                        // Reuse image loading logic or read file
                                        try {
                                            let dataUrl = image.url
                                            if (!dataUrl.startsWith('data:')) {
                                                const data = await readFile(image.url)
                                                let binary = ''
                                                const len = data.byteLength
                                                for (let i = 0; i < len; i++) {
                                                    binary += String.fromCharCode(data[i])
                                                }
                                                dataUrl = `data:image/png;base64,${btoa(binary)}`
                                            }
                                            setSelectedImageForRef(dataUrl)
                                            setImageRefDialogOpen(true)
                                        } catch (e) {
                                            console.error("Failed to load reference image", e)
                                        }
                                    }}
                                    onLoadMetadata={async () => {
                                        try {
                                            let dataUrl = image.url
                                            if (!dataUrl.startsWith('data:')) {
                                                const data = await readFile(image.url)
                                                let binary = ''
                                                const len = data.byteLength
                                                for (let i = 0; i < len; i++) {
                                                    binary += String.fromCharCode(data[i])
                                                }
                                                dataUrl = `data:image/png;base64,${btoa(binary)}`
                                            }
                                            setSelectedImageForMetadata(dataUrl)
                                            setMetadataDialogOpen(true)
                                        } catch (e) {
                                            console.error("Failed to load metadata image", e)
                                        }
                                    }}
                                    onInpaint={(base64) => {
                                        setSelectedImageForInpaint(base64)
                                        setInpaintDialogOpen(true)
                                    }}
                                    onImageClick={(imgSrc) => {
                                        setViewerImageSrc(imgSrc)
                                        setViewerImage(image)
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card >

            <MetadataDialog
                open={metadataDialogOpen}
                onOpenChange={(open) => {
                    setMetadataDialogOpen(open)
                    if (!open) setSelectedImageForMetadata(undefined)
                }}
                initialImage={selectedImageForMetadata}
            />

            <ImageReferenceDialog
                open={imageRefDialogOpen}
                onOpenChange={setImageRefDialogOpen}
                imageBase64={selectedImageForRef}
            />

            <InpaintingDialog
                open={inpaintDialogOpen}
                onOpenChange={(open) => {
                    setInpaintDialogOpen(open)
                    if (!open) setSelectedImageForInpaint(null)
                }}
                sourceImage={selectedImageForInpaint}
            />

            {/* Full-Screen Image Viewer Overlay with Context Menu */}
            {viewerImageSrc && viewerImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
                    onClick={() => {
                        setViewerImageSrc(null)
                        setViewerImage(null)
                    }}
                >
                    <SceneImageContextMenu
                        image={viewerImage}
                        onDelete={() => {
                            if (activePresetId && scene) {
                                deleteImage(activePresetId, scene.id, viewerImage.id)
                            }
                            setViewerImageSrc(null)
                            setViewerImage(null)
                        }}
                        onAddRef={async () => {
                            try {
                                let dataUrl = viewerImage.url
                                if (!dataUrl.startsWith('data:')) {
                                    const data = await readFile(viewerImage.url)
                                    let binary = ''
                                    for (let i = 0; i < data.byteLength; i++) {
                                        binary += String.fromCharCode(data[i])
                                    }
                                    dataUrl = `data:image/png;base64,${btoa(binary)}`
                                }
                                setSelectedImageForRef(dataUrl)
                                setImageRefDialogOpen(true)
                            } catch (e) {
                                console.error('Failed to load ref image', e)
                            }
                        }}
                        onLoadMetadata={async () => {
                            try {
                                let dataUrl = viewerImage.url
                                if (!dataUrl.startsWith('data:')) {
                                    const data = await readFile(viewerImage.url)
                                    let binary = ''
                                    for (let i = 0; i < data.byteLength; i++) {
                                        binary += String.fromCharCode(data[i])
                                    }
                                    dataUrl = `data:image/png;base64,${btoa(binary)}`
                                }
                                setSelectedImageForMetadata(dataUrl)
                                setMetadataDialogOpen(true)
                            } catch (e) {
                                console.error('Failed to load metadata image', e)
                            }
                        }}
                        onInpaint={async (base64) => {
                            setSelectedImageForInpaint(base64)
                            setInpaintDialogOpen(true)
                        }}
                    >
                        <img
                            src={viewerImageSrc}
                            alt="Full view"
                            className="max-w-[90vw] max-h-[90vh] object-contain cursor-default"
                            onClick={(e) => e.stopPropagation()}
                            onContextMenu={(e) => e.stopPropagation()}
                        />
                    </SceneImageContextMenu>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-lg h-10 w-10"
                        onClick={() => {
                            setViewerImageSrc(null)
                            setViewerImage(null)
                        }}
                    >
                        <X className="h-6 w-6" />
                    </Button>
                </div>
            )}
        </div >
    )
}

import { SceneImageContextMenu } from '@/components/scene/SceneImageContextMenu'

function SceneImageCard({
    image,
    thumbnailLayout,
    isEditMode,
    isSelected,
    onSelect,
    onToggleFavorite,
    onDelete,
    onAddRef,
    onLoadMetadata,
    onImageClick,
    onInpaint,
}: {
    image: SceneImage
    thumbnailLayout: 'vertical' | 'horizontal'
    isEditMode?: boolean
    isSelected?: boolean
    onSelect?: () => void
    onToggleFavorite: () => void
    onDelete: () => void
    onAddRef?: () => void
    onLoadMetadata?: () => void
    onImageClick?: (imgSrc: string) => void
    onInpaint?: (base64: string) => void
}) {
    // SceneImageCard now just renders the image and overlay.
    // Logic for loading the image data is handled by the browser <img> tag directly using the file path (image.url).
    // Note: If Tauri requires a special protocol for local files, it's usually `asset://` or handled by `tauri-plugin-fs` + convertFileSrc.
    // Assuming standard `src={image.url}` works for now based on context, or user has configured identifying protocol.
    // If image.url is strictly a Windows path "C:\...", we might need convertFileSrc.
    // BUT the previous code was using readFile + base64. Let's stick to that if needed, 
    // OR try the simpler approach first if supported. 
    // Wait, the previous code had `loadImage` logic because `image.url` is a raw path. 
    // I will restore the `loadImage` logic inside SceneImageCard to ensure images display correctly.

    const [imgSrc, setImgSrc] = useState<string>('')

    useEffect(() => {
        if (!image.url) return
        if (image.url.startsWith('data:')) {
            setImgSrc(image.url)
            return
        }
        // Use convertFileSrc for efficient native asset loading
        // No need for base64 conversion - directly use the asset protocol
        setImgSrc(convertFileSrc(image.url))
    }, [image.url])

    return (
        <SceneImageContextMenu
            image={image}
            onDelete={onDelete}
            onAddRef={onAddRef}
            onLoadMetadata={onLoadMetadata}
            onInpaint={onInpaint}
        >
            <div
                className={cn(
                    "relative group rounded-xl overflow-hidden bg-muted/30 border-2 transition-all duration-300 shadow-sm cursor-pointer",
                    thumbnailLayout === 'vertical' ? "aspect-[2/3]" : "aspect-[3/2]",
                    isEditMode && isSelected
                        ? "border-orange-500 ring-2 ring-orange-500/50"
                        : image.isFavorite
                            ? "border-yellow-500 ring-2 ring-yellow-500/30"
                            : "border-border/50 hover:border-primary/50"
                )}
                onClick={() => {
                    if (isEditMode) {
                        onSelect?.()
                    } else {
                        imgSrc && onImageClick?.(imgSrc)
                    }
                }}
            >
                {/* Image */}
                {imgSrc && (
                    <img
                        src={imgSrc}
                        alt="Scene Image"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                    />
                )}

                {/* Edit mode selection overlay */}
                {isEditMode && (
                    <div className={cn(
                        "absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all",
                        isSelected
                            ? "bg-orange-500 border-orange-500"
                            : "bg-black/50 border-white/50"
                    )}>
                        {isSelected && <Check className="h-4 w-4 text-white" />}
                    </div>
                )}

                {/* Overlay (hide in edit mode) */}
                {!isEditMode && (
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
                        >
                            <Star className={cn("h-3.5 w-3.5", image.isFavorite && "fill-current")} />
                        </Button>
                    </div>
                )}

                <div className="absolute inset-0 rounded-xl border border-transparent group-hover:border-primary/50 pointer-events-none" />
            </div>
        </SceneImageContextMenu>
    )
}
