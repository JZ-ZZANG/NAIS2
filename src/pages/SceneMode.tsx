import { useState, useEffect, useRef, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    DndContext,
    pointerWithin,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    defaultDropAnimationSideEffects,
    MeasuringStrategy,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy,
} from '@dnd-kit/sortable'
import { snapCenterToCursor, restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
    Plus,
    Check,
    MoreVertical,
    Trash2,
    Copy,
    ImageIcon,
    Pencil,
    Minus,
    ListPlus,
    ListX,
    Download,
    Edit3,
    X,
    CheckSquare,
    Square,
    FolderInput,
    ArrowRight,
    Grid3x3,
    Upload,
    LayoutGrid,
    LayoutList,
    Star,
    ImageOff,
    GripVertical,
    ArrowUpDown,
    Store,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/tooltip'
import { useSceneStore } from '@/stores/scene-store'
import { useGenerationStore } from '@/stores/generation-store'
import { toast } from '@/components/ui/use-toast'
import { convertFileSrc } from '@tauri-apps/api/core'
import { writeFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { ExportDialog } from '@/components/scene/ExportDialog'
import { UploadPresetDialog } from '@/components/marketplace/UploadPresetDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { ResolutionSelector, Resolution } from '@/components/ui/ResolutionSelector'

const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.4',
            },
        },
    }),
}

// --- Scene Preset Reorder Dialog ---
function SortablePresetRow({ preset, isActive, listeners, attributes, setNodeRef, style, isDragging, t }: any) {
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors",
                isActive ? "bg-primary/10 border border-primary/30" : "bg-muted/30 border border-transparent",
                isDragging && "shadow-lg opacity-50"
            )}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            >
                <GripVertical className="h-4 w-4" />
            </div>
            <span className="flex-1 text-sm font-medium truncate">
                {preset.id === 'scene-default' ? t('scene.presetDefault', '기본') : preset.name}
            </span>
            <span className="text-xs text-muted-foreground">{preset.scenes.length}</span>
            {isActive && (
                <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">
                    {t('preset.active', '활성')}
                </span>
            )}
        </div>
    )
}

function SortablePresetWrapper({ preset, isActive, t }: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id })
    const style = { transform: CSS.Transform.toString(transform), transition }
    return <SortablePresetRow preset={preset} isActive={isActive} listeners={listeners} attributes={attributes} setNodeRef={setNodeRef} style={style} isDragging={isDragging} t={t} />
}

function ScenePresetReorderDialog({ presets, activePresetId, onReorder, t }: {
    presets: any[], activePresetId: string | null, onReorder: (oldIndex: number, newIndex: number) => void, t: any
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            const oldIndex = presets.findIndex(p => p.id === active.id)
            const newIndex = presets.findIndex(p => p.id === over.id)
            onReorder(oldIndex, newIndex)
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 rounded-lg h-8 w-8 hover:bg-white/10 text-muted-foreground">
                    <Tip content={t('scene.reorderPresets', '프리셋 순서 편집')}>
                        <ArrowUpDown className="h-4 w-4" />
                    </Tip>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t('scene.reorderPresets', '프리셋 순서 편집')}</DialogTitle>
                </DialogHeader>
                <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
                    <SortableContext items={presets.map(p => p.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                            {presets.map(preset => (
                                <SortablePresetWrapper key={preset.id} preset={preset} isActive={activePresetId === preset.id} t={t} />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </DialogContent>
        </Dialog>
    )
}

export default function SceneMode() {
    const { t } = useTranslation()
    // const { token } = useAuthStore()
    // const { savePath } = useSettingsStore()

    // Granular selectors to prevent re-renders on unrelated store changes (like streaming progress)
    const presets = useSceneStore(s => s.presets)
    const activePresetId = useSceneStore(s => s.activePresetId)
    const setActivePreset = useSceneStore(s => s.setActivePreset)
    const addPreset = useSceneStore(s => s.addPreset)
    const deletePreset = useSceneStore(s => s.deletePreset)
    const activePreset = useSceneStore(s => s.presets.find(p => p.id === s.activePresetId))
    const scenes = activePreset?.scenes || []
    const scrollPosition = useSceneStore(s => s.scrollPosition)
    
    // Scroll container ref
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const gridColumns = useSceneStore(s => s.gridColumns)
    const setGridColumns = useSceneStore(s => s.setGridColumns)
    const thumbnailLayout = useSceneStore(s => s.thumbnailLayout)
    const setThumbnailLayout = useSceneStore(s => s.setThumbnailLayout)

    // Actions needed for SceneMode local logic
    const addScene = useSceneStore(s => s.addScene)
    const renamePreset = useSceneStore(s => s.renamePreset)
    const reorderScenes = useSceneStore(s => s.reorderScenes)
    const reorderPresets = useSceneStore(s => s.reorderPresets)
    const isGenerating = useSceneStore(s => s.isGenerating)
    const importPreset = useSceneStore(s => s.importPreset)

    const addAllToQueue = useSceneStore(s => s.addAllToQueue)
    const clearAllQueue = useSceneStore(s => s.clearAllQueue)
    const getTotalQueueCount = useSceneStore(s => s.getTotalQueueCount)
    const batchCount = useGenerationStore(s => s.batchCount)

    const totalQueue = activePresetId ? getTotalQueueCount(activePresetId) : 0

    // Edit Mode (Multi-Select)
    const isEditMode = useSceneStore(s => s.isEditMode)
    const setEditMode = useSceneStore(s => s.setEditMode)
    const selectedSceneIds = useSceneStore(s => s.selectedSceneIds)
    const selectAllScenes = useSceneStore(s => s.selectAllScenes)
    const clearSelection = useSceneStore(s => s.clearSelection)
    const deleteSelectedScenes = useSceneStore(s => s.deleteSelectedScenes)
    const moveSelectedScenesToPreset = useSceneStore(s => s.moveSelectedScenesToPreset)
    const updateSelectedScenesResolution = useSceneStore(s => s.updateSelectedScenesResolution)
    const clearAllFavorites = useSceneStore(s => s.clearAllFavorites)
    const deleteAllImages = useSceneStore(s => s.deleteAllImages)

    // Resolution state for selected scenes
    const [editModeResolution, setEditModeResolution] = useState<Resolution>({
        label: '인물 (세로)',
        width: 832,
        height: 1216
    })

    const handleApplyResolutionToSelected = () => {
        updateSelectedScenesResolution(editModeResolution.width, editModeResolution.height)
        toast({ description: t('scene.resolutionApplied', { count: selectedSceneIds.length, width: editModeResolution.width, height: editModeResolution.height }) })
    }

    const [newPresetName, setNewPresetName] = useState('')
    // const [isExporting, setIsExporting] = useState(false) // Removed unused state
    const [activeId, setActiveId] = useState<string | null>(null)
    const [isRenamingPreset, setIsRenamingPreset] = useState(false)

    // Generation Store values - used by export logic or future features?
    // Left empty for now as logic moved to hook

    // Note: useSceneGeneration() is now called at App level for persistence across navigation

    // Restore scroll position when returning from detail page
    useEffect(() => {
        if (scrollContainerRef.current && scrollPosition > 0) {
            scrollContainerRef.current.scrollTop = scrollPosition
        }
    }, []) // Only on mount

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id && activePresetId) {
            const oldIndex = scenes.findIndex((item) => item.id === active.id)
            const newIndex = scenes.findIndex((item) => item.id === over.id)
            reorderScenes(activePresetId, arrayMove(scenes, oldIndex, newIndex))
        }
        setActiveId(null)
    }

    const handleAddScene = () => {
        if (activePresetId) {
            const sceneCount = scenes.length + 1
            addScene(activePresetId, t('scene.defaultName', '씬 {{num}}', { num: sceneCount }))
        }
    }

    const handleAddPreset = () => {
        if (newPresetName.trim()) {
            addPreset(newPresetName.trim())
            setNewPresetName('')
        }
    }

    const [isDragOver, setIsDragOver] = useState(false)
    const dragCounter = useRef(0)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // JSON Import via file picker
    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        let importedCount = 0
        for (const file of Array.from(files)) {
            if (file.name.toLowerCase().endsWith('.json')) {
                try {
                    const text = await file.text()
                    const json = JSON.parse(text)
                    importPreset(json)
                    importedCount++
                } catch (err) {
                    console.error("Failed to parse preset JSON", err)
                }
            }
        }

        if (importedCount > 0) {
            toast({ description: t('scene.imported', { count: importedCount }) })
        }

        // Reset input value to allow re-selecting same file
        e.target.value = ''
    }

    // --- Import Logic (DnD) ---
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current++
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current--
        if (dragCounter.current === 0) {
            setIsDragOver(false)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
        dragCounter.current = 0

        const files = Array.from(e.dataTransfer.files)
        if (files.length === 0) return

        let importedCount = 0
        for (const file of files) {
            // Check file extension .json
            if (file.name.toLowerCase().endsWith('.json')) {
                try {
                    const text = await file.text()
                    const json = JSON.parse(text)

                    // importPreset handles all formats:
                    // - Case A: Array format (scene_preset_export.json)
                    // - Case B: Scenes object format (NAI 에셋봇)
                    // - Case C: SDImageGenEasy presets
                    // - Case D: Standard NAIS2 ScenePreset format
                    importPreset(json)
                    importedCount++
                } catch (err) {
                    console.error("Failed to parse preset JSON", err)
                }
            }
        }

        if (importedCount > 0) {
            toast({ description: t('scene.imported', { count: importedCount }) })
        }
    }

    const handleToggleGrid = () => {
        // Cycle: 4 -> 5 -> 2 -> 3 -> 4
        // Default sequence requested: 2 -> 3 -> 4 -> 5 -> 2
        // Assuming current logic cycle
        const next = gridColumns >= 5 ? 2 : gridColumns + 1
        setGridColumns(next)
    }

    const [showExportDialog, setShowExportDialog] = useState(false)
    const [exportScenesFilter, setExportScenesFilter] = useState<'all' | 'selected'>('all')
    const [showUploadDialog, setShowUploadDialog] = useState(false)
    const [showDeletePresetDialog, setShowDeletePresetDialog] = useState(false)

    // Scenes to export based on filter
    const scenesToExport = exportScenesFilter === 'selected'
        ? scenes.filter(s => selectedSceneIds.includes(s.id))
        : scenes

    const handleExportSelectedZip = () => {
        if (selectedSceneIds.length === 0) {
            toast({ title: t('scene.noImagesToExport', '내보낼 이미지가 없습니다'), variant: 'destructive' })
            return
        }
        setExportScenesFilter('selected')
        setShowExportDialog(true)
    }

    // --- Export Logic ---
    const handleExportJson = async () => {
        if (!activePreset) return
        try {
            const fileName = `NAIS_Preset_${activePreset.name}_${Date.now()}.json`
            const filePath = await save({
                defaultPath: fileName,
                filters: [{ name: 'JSON File', extensions: ['json'] }]
            })

            if (filePath) {
                // 이미지 데이터 제외하고 씬 정보만 내보내기 (공유용)
                const exportData = {
                    ...activePreset,
                    scenes: activePreset.scenes.map(scene => ({
                        ...scene,
                        images: [],  // 이미지 제거
                        queueCount: 0  // 대기열도 초기화
                    }))
                }
                const content = JSON.stringify(exportData, null, 2)
                const encoder = new TextEncoder()
                await writeFile(filePath, encoder.encode(content))
                toast({ title: t('common.saved', '저장됨'), variant: 'success' })
            }
        } catch (e) {
            console.error('Export JSON failed', e)
            toast({ title: t('common.error'), variant: 'destructive' })
        }
    }

    const handleExportZip = () => {
        if (!activePresetId || scenes.length === 0) {
            toast({ title: t('scene.noImagesToExport', '내보낼 이미지가 없습니다'), variant: 'destructive' })
            return
        }
        setShowExportDialog(true)
    }

    const activeItem = activeId ? scenes.find(s => s.id === activeId) : null

    return (
        <div
            className="h-full flex flex-col gap-4 relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Header - Normal Mode or Edit Mode */}
            {isEditMode ? (
                /* Edit Mode Toolbar */
                <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-2xl p-3">
                    <div className="flex items-center gap-3">
                        <Tip content={t('scene.exitEditMode', '편집 종료')} shortcut="Esc">
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-primary hover:bg-primary/20" onClick={() => { setEditMode(false); clearSelection() }}>
                                <X className="h-4 w-4" />
                            </Button>
                        </Tip>
                        <div className="h-6 w-px bg-primary/20" />
                        <span className="text-sm font-medium text-primary">
                            {t('scene.selectedCount', { count: selectedSceneIds.length })}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Select All */}
                        <Tip content={t('scene.selectAll', '전체 선택')} shortcut="Ctrl+A">
                            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={selectAllScenes} disabled={scenes.length === 0}>
                                <CheckSquare className="h-4 w-4" />
                            </Button>
                        </Tip>
                        {/* Deselect All */}
                        <Tip content={t('scene.deselectAll', '선택 해제')}>
                            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={clearSelection} disabled={selectedSceneIds.length === 0}>
                                <Square className="h-4 w-4" />
                            </Button>
                        </Tip>
                        <div className="h-6 w-px bg-border" />

                        {/* Change Resolution */}
                        <div className="flex items-center gap-2">
                            <div className="w-[200px]">
                                <ResolutionSelector
                                    value={editModeResolution}
                                    onChange={setEditModeResolution}
                                    disabled={selectedSceneIds.length === 0}
                                />
                            </div>
                            <Tip content={t('scene.applyResolution', '선택한 씬에 해상도 적용')}>
                                <Button variant="secondary" size="icon" className="h-9 w-9" onClick={handleApplyResolutionToSelected} disabled={selectedSceneIds.length === 0}>
                                    <Check className="h-4 w-4" />
                                </Button>
                            </Tip>
                        </div>

                        <div className="h-6 w-px bg-border" />

                        {/* Move to Preset */}
                        <DropdownMenu>
                            <Tip content={t('scene.moveToPreset', '프리셋으로 이동')}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-9 w-9" disabled={selectedSceneIds.length === 0 || presets.length < 2}>
                                        <FolderInput className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                            </Tip>
                            <DropdownMenuContent className="max-h-[300px] overflow-y-auto">
                                {presets.filter(p => p.id !== activePresetId).map(p => (
                                    <DropdownMenuItem key={p.id} onClick={() => moveSelectedScenesToPreset(p.id)}>
                                        <ArrowRight className="mr-2 h-4 w-4" />
                                        {p.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Delete Selected */}
                        <Tip content={t('scene.deleteSelected', '선택 삭제')} shortcut="Del">
                            <Button variant="destructive" size="icon" className="h-9 w-9" onClick={deleteSelectedScenes} disabled={selectedSceneIds.length === 0}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </Tip>

                        <div className="h-6 w-px bg-border" />

                        {/* Clear All Favorites in Selected Scenes */}
                        <Tip content={t('scene.clearAllFavoritesInSelected', '선택된 씬들의 즐겨찾기 전체 해제')}>
                            <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-9 w-9" 
                                onClick={() => {
                                    if (!activePresetId) return
                                    let totalCount = 0
                                    for (const sceneId of selectedSceneIds) {
                                        totalCount += clearAllFavorites(activePresetId, sceneId)
                                    }
                                    if (totalCount > 0) {
                                        toast({ description: t('scene.clearedFavorites', '{{count}}개 즐겨찾기 해제됨', { count: totalCount }) })
                                    }
                                }} 
                                disabled={selectedSceneIds.length === 0}
                            >
                                <Star className="h-4 w-4" />
                            </Button>
                        </Tip>

                        {/* Delete All Images in Selected Scenes */}
                        <Tip content={t('scene.deleteAllImagesInSelected', '선택된 씬들의 이미지 전체 삭제')}>
                            <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10" 
                                onClick={async () => {
                                    if (!activePresetId) return
                                    let totalCount = 0
                                    const allPaths: string[] = []
                                    for (const sceneId of selectedSceneIds) {
                                        const { count, paths } = deleteAllImages(activePresetId, sceneId)
                                        totalCount += count
                                        allPaths.push(...paths)
                                    }
                                    // Delete actual files
                                    const { remove } = await import('@tauri-apps/plugin-fs')
                                    for (const filePath of allPaths) {
                                        try { await remove(filePath) } catch (e) { console.warn('Delete failed:', e) }
                                    }
                                    if (totalCount > 0) {
                                        toast({ description: t('scene.deletedAllImages', '{{count}}개 이미지 전체 삭제됨', { count: totalCount }) })
                                    }
                                }} 
                                disabled={selectedSceneIds.length === 0}
                            >
                                <ImageOff className="h-4 w-4" />
                            </Button>
                        </Tip>

                        {/* Export Selected ZIP */}
                        <Tip content={t('scene.exportSelectedZip', '선택한 씬 이미지 ZIP 내보내기')}>
                            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleExportSelectedZip} disabled={selectedSceneIds.length === 0}>
                                <Download className="h-4 w-4" />
                            </Button>
                        </Tip>
                    </div>
                </div>
            ) : (
                /* Normal Header */
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">{t('scene.title')}</h1>
                    </div>
                    <div className="flex gap-2">
                        {/* Hidden file input for JSON import */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            multiple
                            className="hidden"
                            onChange={handleFileInputChange}
                        />
                        {/* Import JSON Button */}
                        <Tip content={t('scene.importJson', 'JSON 불러오기')}>
                            <Button variant="outline" size="icon" className="rounded-xl h-10 w-10 border-white/10 hover:bg-white/5" onClick={handleImportClick} disabled={isGenerating}>
                                <Upload className="h-4 w-4" />
                            </Button>
                        </Tip>
                        {/* Edit Mode Toggle Button */}
                        <Tip content={t('scene.editMode', '여러 씬을 선택하여 일괄 편집')}>
                            <Button variant="outline" size="icon" className="rounded-xl h-10 w-10 border-white/10 hover:bg-white/5" onClick={() => setEditMode(true)} disabled={scenes.length === 0 || isGenerating}>
                                <Edit3 className="h-4 w-4" />
                            </Button>
                        </Tip>
                        <div className="flex items-center bg-muted/30 rounded-xl p-1 border border-white/5">
                            <Tip content={t('scene.addAllQueue', '모든 씬 생성 대기열에 추가')}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={() => activePresetId && addAllToQueue(activePresetId, batchCount)} disabled={scenes.length === 0 || isGenerating}>
                                    <ListPlus className="h-4 w-4" />
                                </Button>
                            </Tip>
                            <div className="w-px h-4 bg-white/10 mx-1" />
                            <Tip content={t('scene.clearAllQueue', '모든 대기열 초기화')}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => activePresetId && clearAllQueue(activePresetId)} disabled={totalQueue === 0 || isGenerating}>
                                    <ListX className="h-4 w-4" />
                                </Button>
                            </Tip>
                        </div>
                        <Tip content={t('scene.exportJson', '씬 데이터를 JSON으로 내보내기')}>
                            <Button variant="outline" size="icon" className="rounded-xl h-10 w-10 border-white/10 hover:bg-white/5" onClick={handleExportJson} disabled={!activePreset || isGenerating}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </Tip>
                        <Tip content={t('scene.shareToMarket', '마켓에 공유')}>
                            <Button variant="outline" size="icon" className="rounded-xl h-10 w-10 border-white/10 hover:bg-white/5" onClick={() => setShowUploadDialog(true)} disabled={!activePreset || scenes.length === 0 || isGenerating}>
                                <Store className="h-4 w-4" />
                            </Button>
                        </Tip>
                        <Tip content={t('scene.exportZip', '모든 씬 이미지 ZIP 내보내기')}>
                            <Button variant="outline" size="icon" className="rounded-xl h-10 w-10 border-white/10 hover:bg-white/5" onClick={handleExportZip} disabled={scenes.length === 0}>
                                <Download className="h-4 w-4" />
                            </Button>
                        </Tip>
                    </div>
                </div>
            )}

            {/* Full screen Drag Overlay */}
            {/* Full screen Drag Overlay */}
            {isDragOver && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center transition-all duration-300 pointer-events-none">
                    <div className="relative">
                        {/* Animated ring */}
                        <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary via-purple-500 to-primary animate-pulse opacity-50 blur-xl" />

                        {/* Main card */}
                        <div className="relative bg-background/80 backdrop-blur-xl border border-white/20 rounded-3xl p-12 shadow-2xl transform transition-transform scale-100">
                            <div className="text-center space-y-4">
                                {/* Animated icon container */}
                                <div className="relative mx-auto w-20 h-20">
                                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                                    <div className="relative w-full h-full rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-inner">
                                        <Download className="h-10 w-10 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xl font-bold text-foreground">
                                        {t('scene.dropImport', '프리셋 파일 놓기')}
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        {t('scene.dropImportDesc', 'JSON 파일을 드롭하여 프리셋을 불러오세요')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Preset Bar */}
            <div className="flex items-center gap-3 p-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 flex-1 max-w-[300px]">
                    {isRenamingPreset ? (
                        <PresetRenameInput
                            initialValue={activePreset?.name || ''}
                            onSave={(val) => {
                                if (activePresetId && val) {
                                    renamePreset(activePresetId, val)
                                }
                                setIsRenamingPreset(false)
                            }}
                            onCancel={() => setIsRenamingPreset(false)}
                        />
                    ) : (
                        <Select value={activePresetId || ''} onValueChange={setActivePreset} disabled={isGenerating}>
                            <SelectTrigger className="rounded-xl bg-transparent border-white/10 hover:bg-white/5 transition-colors h-10">
                                <SelectValue placeholder={t('scene.preset')} />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                {presets.map((preset) => (
                                    <SelectItem key={preset.id} value={preset.id}>
                                        {preset.id === 'scene-default' ? t('scene.presetDefault') : preset.name} ({preset.scenes.length})
                                    </SelectItem>
                                ))}
                                <DropdownMenuSeparator />
                                <div className="p-1">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            placeholder={t('scene.newPresetName')}
                                            value={newPresetName}
                                            onChange={(e) => setNewPresetName(e.target.value)}
                                            className="h-8 text-xs"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.stopPropagation()
                                                    handleAddPreset()
                                                }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <Button size="sm" variant="secondary" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); handleAddPreset() }} disabled={!newPresetName.trim() || isGenerating}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </SelectContent>
                        </Select>
                    )}
                    {activePreset && activePreset.id !== 'scene-default' && (
                        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                            {!isRenamingPreset && (
                                <Tip content={t('actions.rename', '이름 변경')}>
                                    <Button variant="ghost" size="icon" className="shrink-0 rounded-lg h-8 w-8 hover:bg-white/10" onClick={() => setIsRenamingPreset(true)} disabled={isGenerating}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                </Tip>
                            )}
                            <Tip content={t('scene.deletePreset', '프리셋 삭제')}>
                                <Button variant="ghost" size="icon" className="shrink-0 rounded-lg h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDeletePresetDialog(true)} disabled={isGenerating}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </Tip>
                        </div>
                    )}
                    {presets.length > 1 && (
                        <ScenePresetReorderDialog
                            presets={presets}
                            activePresetId={activePresetId}
                            onReorder={reorderPresets}
                            t={t}
                        />
                    )}
                </div>



                <div className="flex items-center gap-2 ml-auto">
                    <Tip content={t('scene.thumbnailLayout', '세로/가로 썸네일 전환')}>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-white/10" 
                            onClick={() => setThumbnailLayout(thumbnailLayout === 'vertical' ? 'horizontal' : 'vertical')}
                        >
                            {thumbnailLayout === 'vertical' ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
                        </Button>
                    </Tip>
                    <Tip content={t('scene.gridColumnsDesc', '그리드 열 개수 변경')}>
                        <Button variant="ghost" size="sm" className="h-9 text-muted-foreground hover:text-foreground hover:bg-white/10" onClick={handleToggleGrid}>
                            <Grid3x3 className="h-4 w-4 mr-1.5" />
                            <span className="font-medium text-sm">{gridColumns}</span>
                        </Button>
                    </Tip>
                </div>
            </div>

            {/* Scene Grid */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar p-1">
                {scenes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-white/5 rounded-3xl border border-white/10 border-dashed">
                        <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-6"> <ImageIcon className="h-10 w-10 opacity-50" /> </div>
                        <h3 className="text-xl font-medium mb-2">{t('scene.noScenes')}</h3>
                        <p className="text-sm mb-6 max-w-sm text-center leading-relaxed opacity-70">{t('scene.noScenesDesc')}</p>
                        <Button className="rounded-xl h-11 px-8" variant="outline" onClick={handleAddScene} disabled={isGenerating}> <Plus className="mr-2 h-5 w-5" /> {t('scene.addScene')} </Button>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={pointerWithin}
                        measuring={{
                            droppable: {
                                strategy: MeasuringStrategy.WhileDragging,
                            },
                        }}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={scenes.map(s => s.id)} strategy={rectSortingStrategy}>
                            <div className="grid gap-6 pb-20" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                                {scenes.map((scene) => (
                                    <SortableSceneCard
                                        key={scene.id}
                                        scene={scene}
                                        disabled={isGenerating}
                                    />
                                ))}
                                <button onClick={!isGenerating ? handleAddScene : undefined} className={cn("flex flex-col items-center justify-center h-full rounded-2xl border-2 border-dashed border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 transition-all group", thumbnailLayout === 'vertical' ? "aspect-[2/3]" : "aspect-[3/2]", isGenerating && "opacity-50 cursor-not-allowed")}>
                                    <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"> <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" /> </div>
                                    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors"> {t('scene.addScene')} </span>
                                </button>
                            </div>
                        </SortableContext>
                        <DragOverlay dropAnimation={dropAnimation} modifiers={[snapCenterToCursor]}>
                            {activeItem ? <SceneCardItem scene={activeItem} isOverlay /> : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </div>

            {
                activePreset && (
                    <ExportDialog
                        open={showExportDialog}
                        onOpenChange={(open) => {
                            setShowExportDialog(open)
                            if (!open) setExportScenesFilter('all') // Reset filter when closing
                        }}
                        activePresetName={activePreset.name}
                        scenes={scenesToExport}
                    />
                )
            }

            <UploadPresetDialog
                open={showUploadDialog}
                onOpenChange={setShowUploadDialog}
                preset={activePreset ?? null}
            />

            <ConfirmDialog
                open={showDeletePresetDialog}
                onOpenChange={setShowDeletePresetDialog}
                title={t('scene.deletePreset', '프리셋 삭제')}
                description={t('scene.confirmDeletePreset', '이 프리셋을 삭제하시겠습니까?')}
                confirmText={t('common.delete', '삭제')}
                cancelText={t('common.cancel', '취소')}
                variant="destructive"
                onConfirm={() => { if (activePreset) deletePreset(activePreset.id) }}
            />
        </div >
    )
}

// Memoized SceneCard to prevent unnecessary re-renders
const SceneCardItem = memo(function SceneCardItem({ scene, onClick, disabled = false, isOverlay = false, style, dragAttributes, dragListeners }: any) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(scene.name)

    // Essential reactive state - only subscribe to what MUST trigger re-renders
    const activePresetId = useSceneStore(s => s.activePresetId)
    const isEditMode = useSceneStore(s => s.isEditMode)
    const isSelected = useSceneStore(s => s.selectedSceneIds.includes(scene.id))
    const thumbnailLayout = useSceneStore(s => s.thumbnailLayout)
    
    // Subscribe to queueCount directly for fast updates (bypasses memo)
    const queueCount = useSceneStore(s => {
        const preset = s.presets.find(p => p.id === s.activePresetId)
        return preset?.scenes.find(sc => sc.id === scene.id)?.queueCount ?? 0
    })

    // Streaming State - only this card's streaming state
    const isStreaming = useSceneStore(s => s.streamingSceneId === scene.id)
    const streamingImage = useSceneStore(s => s.streamingSceneId === scene.id ? s.streamingImage : null)
    const streamingProgress = useSceneStore(s => s.streamingSceneId === scene.id ? s.streamingProgress : 0)

    // Actions - use getState() for stable references that don't trigger re-renders
    const getSceneThumbnail = useSceneStore.getState().getSceneThumbnail
    const renameScene = useSceneStore.getState().renameScene
    const duplicateScene = useSceneStore.getState().duplicateScene
    const deleteScene = useSceneStore.getState().deleteScene
    const incrementQueue = useSceneStore.getState().incrementQueue
    const decrementQueue = useSceneStore.getState().decrementQueue
    const toggleSceneSelection = useSceneStore.getState().toggleSceneSelection
    const selectSceneRange = useSceneStore.getState().selectSceneRange
    const lastSelectedSceneId = useSceneStore.getState().lastSelectedSceneId

    const thumbnail = getSceneThumbnail(scene)
    const [imageUrl, setImageUrl] = useState<string>('')

    useEffect(() => {
        if (!thumbnail) {
            setImageUrl('')
            return
        }
        if (thumbnail.startsWith('data:')) {
            setImageUrl(thumbnail)
            return
        }
        // Use convertFileSrc for efficient native asset loading
        setImageUrl(convertFileSrc(thumbnail))
    }, [thumbnail])


    const handleSaveName = () => {
        if (editName.trim() && activePresetId) {
            renameScene(activePresetId, scene.id, editName.trim())
        }
        setIsEditing(false)
    }

    const onDelete = () => { if (activePresetId) deleteScene(activePresetId, scene.id) }
    const onDuplicate = () => { if (activePresetId) duplicateScene(activePresetId, scene.id) }
    const onIncrement = () => { if (activePresetId) incrementQueue(activePresetId, scene.id, useGenerationStore.getState().batchCount) }
    const onDecrement = () => { if (activePresetId) decrementQueue(activePresetId, scene.id) }

    const handleSceneClick = (e: React.MouseEvent) => {
        if (isEditMode) {
            // Edit Mode: handle selection
            if (e.shiftKey && lastSelectedSceneId) {
                selectSceneRange(lastSelectedSceneId, scene.id)
            } else if (e.ctrlKey || e.metaKey) {
                toggleSceneSelection(scene.id, false) // Multi-select
            } else {
                toggleSceneSelection(scene.id, true) // Single select
            }
        } else {
            // Normal Mode: navigate to detail
            // Save scroll position before navigating
            const scrollContainer = document.querySelector('.custom-scrollbar')
            if (scrollContainer) {
                useSceneStore.getState().setScrollPosition(scrollContainer.scrollTop)
            }
            if (onClick) onClick()
            else navigate(`/scenes/${scene.id}`)
        }
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild disabled={isOverlay || disabled}>
                <div
                    style={style}
                    className={cn(
                        "group relative flex flex-col rounded-2xl overflow-hidden",
                        thumbnailLayout === 'vertical' ? "aspect-[2/3]" : "aspect-[3/2]",
                        "bg-card border border-border/50 shadow-sm",
                        !isOverlay && "hover:shadow-lg hover:border-primary/30 transition-shadow",
                        isOverlay && "shadow-xl ring-2 ring-primary cursor-grabbing z-50",
                        disabled && "opacity-80 pointer-events-none",
                        isEditMode && isSelected && "ring-2 ring-orange-500"
                    )}
                    onClick={(e) => { if (!isOverlay && !isEditing && !disabled) handleSceneClick(e) }}
                    {...(!isEditing && !isEditMode ? dragAttributes : {})}
                    {...(!isEditing && !isEditMode ? dragListeners : {})}
                >
                    {/* Selection Checkbox Overlay (Edit Mode) */}
                    {isEditMode && (
                        <div className="absolute top-2 right-2 z-40">
                            <div className={cn(
                                "h-6 w-6 rounded-md flex items-center justify-center transition-all",
                                isSelected ? "bg-orange-500 text-white" : "bg-black/40 text-white/70 border border-white/30"
                            )}>
                                {isSelected ? <Check className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            </div>
                        </div>
                    )}

                    {/* Queue Badge - lightweight */}
                    {queueCount > 0 && (
                        <div className="absolute top-2 left-2 z-30 px-2.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                            {queueCount}
                        </div>
                    )}

                    {/* 3-dot Menu - hidden in edit mode */}
                    {!disabled && !isOverlay && !isEditMode && (
                        <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 text-white"> <MoreVertical className="h-4 w-4" /> </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditName(scene.name) }}> <Pencil className="mr-2 h-4 w-4" /> {t('scene.rename')} </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate() }}> <Copy className="mr-2 h-4 w-4" /> {t('scene.duplicate')} </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete() }}> <Trash2 className="mr-2 h-4 w-4" /> {t('actions.delete')} </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}

                    <div className="relative flex-1 bg-zinc-900/50 w-full overflow-hidden">
                        {isStreaming && streamingImage ? (
                            <img src={streamingImage} alt="Streaming..." className="w-full h-full object-cover animate-pulse" />
                        ) : imageUrl ? (
                            <img src={imageUrl} alt={scene.name} className="w-full h-full object-cover" draggable={false} />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30"> <ImageIcon className="h-10 w-10 mb-2" /> <span className="text-xs">No Image</span> </div>
                        )}
                        {/* Gradient - hover only for performance */}
                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        {/* Progress Bar for Streaming */}
                        {isStreaming && streamingProgress > 0 && (
                            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gray-600/50 z-20 backdrop-blur-sm">
                                <div
                                    className="h-full bg-white transition-all duration-300"
                                    style={{ width: `${streamingProgress * 100}%` }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-0 inset-x-0 p-3 z-20">
                        <div className="mb-3">
                            {isEditing ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm rounded-lg bg-black/60 border-white/20 text-white focus-visible:ring-primary" autoFocus onBlur={handleSaveName} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditing(false) }} />
                                </div>
                            ) : (
                                <h3 className="text-sm font-semibold text-white truncate drop-shadow-md">{scene.name}</h3>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/5 disabled:opacity-30" onClick={() => onDecrement()} disabled={queueCount === 0 || disabled}> <Minus className="h-3 w-3" /> </Button>
                            <div className="flex-1" />
                            <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/5" onClick={() => onIncrement()} disabled={disabled}> <Plus className="h-3 w-3" /> </Button>
                        </div>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40">
                <ContextMenuItem onClick={() => { setIsEditing(true); setEditName(scene.name) }}> <Pencil className="mr-2 h-4 w-4" /> {t('scene.rename')} </ContextMenuItem>
                <ContextMenuItem onClick={() => onDuplicate()}> <Copy className="mr-2 h-4 w-4" /> {t('scene.duplicate')} </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete()}> <Trash2 className="mr-2 h-4 w-4" /> {t('actions.delete')} </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
})

// Isolated PresetRenameInput to prevent SceneMode re-renders on every keystroke
const PresetRenameInput = memo(({
    initialValue,
    onSave,
    onCancel
}: {
    initialValue: string,
    onSave: (val: string) => void,
    onCancel: () => void
}) => {
    const [value, setValue] = useState(initialValue)

    const handleSave = () => {
        if (value.trim()) onSave(value.trim())
        else onCancel()
    }

    return (
        <div className="flex items-center gap-1 flex-1">
            <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9"
                autoFocus
                onBlur={handleSave}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                    if (e.key === 'Escape') onCancel()
                }}
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
                <Check className="h-4 w-4" />
            </Button>
        </div>
    )
})

// Memoized SortableSceneCard with custom comparator to prevent re-renders during drag
const SortableSceneCard = memo(function SortableSceneCard(props: any) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.scene.id, disabled: props.disabled })
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.0 : 1 }
    return <div ref={setNodeRef} style={style}> <SceneCardItem {...props} dragAttributes={attributes} dragListeners={listeners} /> </div>
}, (prevProps, nextProps) => {
    // Only re-render if scene id, queueCount, name, or disabled changes
    return prevProps.scene.id === nextProps.scene.id &&
        prevProps.scene.queueCount === nextProps.scene.queueCount &&
        prevProps.scene.name === nextProps.scene.name &&
        prevProps.scene.images?.length === nextProps.scene.images?.length &&
        prevProps.disabled === nextProps.disabled
})
