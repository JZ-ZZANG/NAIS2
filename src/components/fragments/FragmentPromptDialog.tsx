import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    Tip,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AutocompleteTextarea } from '@/components/ui/AutocompleteTextarea'
import { useFragmentStore, FragmentFileMeta } from '@/stores/fragment-store'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
    Plus,
    Trash2,
    Copy,
    FolderPlus,
    FileText,
    ChevronRight,
    ChevronDown,
    Save,
    RotateCcw,
    Info,
    Puzzle,
    Upload,
    Download,
    MoreHorizontal,
    GripVertical,
    Store,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { UploadFragmentDialog } from '@/components/marketplace/UploadFragmentDialog'

interface FragmentPromptDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function FragmentPromptDialog({ open, onOpenChange }: FragmentPromptDialogProps) {
    const { t } = useTranslation()

    // 선택적 구독으로 성능 최적화
    const files = useFragmentStore(state => state.files)
    const addFile = useFragmentStore(state => state.addFile)
    const updateFile = useFragmentStore(state => state.updateFile)
    const deleteFile = useFragmentStore(state => state.deleteFile)
    const duplicateFile = useFragmentStore(state => state.duplicateFile)
    const getFolders = useFragmentStore(state => state.getFolders)
    const resetSequentialCounter = useFragmentStore(state => state.resetSequentialCounter)
    const importFromText = useFragmentStore(state => state.importFromText)
    const exportToText = useFragmentStore(state => state.exportToText)
    const loadFileContent = useFragmentStore(state => state.loadFileContent)
    const exportAll = useFragmentStore(state => state.exportAll)
    const importAll = useFragmentStore(state => state.importAll)
    const reorderFiles = useFragmentStore(state => state.reorderFiles)

    const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
    const [editingContent, setEditingContent] = useState('')
    const [editingName, setEditingName] = useState('')
    const [editingFolder, setEditingFolder] = useState('')
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']))
    const [newFolderName, setNewFolderName] = useState('')
    const [isCreatingFolder, setIsCreatingFolder] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [tooltipEnabled, setTooltipEnabled] = useState(false)
    const [showUploadDialog, setShowUploadDialog] = useState(false)

    // Dialog 열릴 때 Tooltip 비활성화 후 500ms 뒤 활성화
    useEffect(() => {
        if (open) {
            setTooltipEnabled(false)
            const timer = setTimeout(() => setTooltipEnabled(true), 500)
            return () => clearTimeout(timer)
        }
    }, [open])

    const folders = getFolders()
    const selectedFile = files.find(f => f.id === selectedFileId)

    // 파일 선택 시 에디터에 내용 로드 (비동기)
    useEffect(() => {
        if (selectedFile) {
            loadFileContent(selectedFile.id).then(content => {
                setEditingContent(content.join('\n'))
                setEditingName(selectedFile.name)
                setEditingFolder(selectedFile.folder)
                setHasChanges(false)
            })
        }
    }, [selectedFile, loadFileContent])

    const handleSelectFile = (file: FragmentFileMeta) => {
        // 변경사항이 있어도 저장 안 하고 넘어감 (저장 버튼 강조로 유도)
        setSelectedFileId(file.id)
    }

    const handleSave = async () => {
        if (!selectedFileId) return

        const lines = editingContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'))

        await updateFile(selectedFileId, {
            name: editingName.trim(),
            folder: editingFolder.trim(),
            content: lines,
        })

        setHasChanges(false)
        toast({
            title: t('fragment.saved', '저장됨'),
            description: t('fragment.savedDesc', '조각 프롬프트가 저장되었습니다.'),
        })
    }

    const handleCreateFile = async (folder: string = '') => {
        const newFile = await addFile(`fragment_${Date.now()}`, folder, [])
        setSelectedFileId(newFile.id)
        setExpandedFolders(prev => new Set([...prev, folder]))
    }

    const handleDeleteFile = async (id: string) => {
        await deleteFile(id)
        if (selectedFileId === id) {
            setSelectedFileId(null)
            setEditingContent('')
            setEditingName('')
            setEditingFolder('')
        }
    }

    const handleDuplicateFile = async (id: string) => {
        const newFile = await duplicateFile(id)
        if (newFile) {
            setSelectedFileId(newFile.id)
        }
    }

    const handleDeleteFolder = async (folderName: string) => {
        // 폴더 내 모든 파일 삭제
        const folderFiles = files.filter(f => f.folder === folderName)
        for (const f of folderFiles) {
            await deleteFile(f.id)
        }

        // 선택된 파일이 해당 폴더에 있었다면 선택 해제
        if (selectedFile && selectedFile.folder === folderName) {
            setSelectedFileId(null)
            setEditingContent('')
            setEditingName('')
            setEditingFolder('')
        }
    }

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return
        setExpandedFolders(prev => new Set([...prev, newFolderName.trim()]))
        await handleCreateFile(newFolderName.trim())
        setNewFolderName('')
        setIsCreatingFolder(false)
    }

    const toggleFolder = (folder: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev)
            if (next.has(folder)) {
                next.delete(folder)
            } else {
                next.add(folder)
            }
            return next
        })
    }

    const handleResetCounters = () => {
        resetSequentialCounter()
        toast({
            title: t('fragment.countersReset', '카운터 리셋'),
            description: t('fragment.countersResetDesc', '모든 순차 카운터가 리셋되었습니다.'),
        })
    }

    // txt 파일 불러오기
    const handleImportTxt = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog')
            const { readTextFile } = await import('@tauri-apps/plugin-fs')

            const selected = await open({
                multiple: true,
                filters: [{ name: 'Text Files', extensions: ['txt'] }],
            })

            if (!selected) return

            const filePaths = Array.isArray(selected) ? selected : [selected]
            let importedCount = 0

            for (const filePath of filePaths) {
                const content = await readTextFile(filePath)
                // 파일 이름에서 확장자 제거
                const fileName = filePath.split(/[/\\]/).pop()?.replace(/\.txt$/i, '') || `import_${Date.now()}`
                const newFile = await importFromText(fileName, content, editingFolder || '')
                if (newFile) {
                    importedCount++
                    // 마지막 파일 선택
                    setSelectedFileId(newFile.id)
                }
            }

            if (importedCount > 0) {
                toast({
                    title: t('fragment.imported', '불러오기 완료'),
                    description: t('fragment.importedDesc', '{{count}}개 파일을 불러왔습니다.', { count: importedCount }),
                })
            }
        } catch (error) {
            console.error('Failed to import txt:', error)
            toast({
                variant: 'destructive',
                title: t('common.error', '오류'),
                description: t('fragment.importError', '파일을 불러오는 중 오류가 발생했습니다.'),
            })
        }
    }

    // txt 파일 내보내기
    const handleExportTxt = async () => {
        if (!selectedFileId || !selectedFile) return

        try {
            const { save } = await import('@tauri-apps/plugin-dialog')
            const { writeTextFile } = await import('@tauri-apps/plugin-fs')

            const content = await exportToText(selectedFileId)
            if (content === null) return

            const filePath = await save({
                defaultPath: `${selectedFile.name}.txt`,
                filters: [{ name: 'Text Files', extensions: ['txt'] }],
            })

            if (!filePath) return

            await writeTextFile(filePath, content)

            toast({
                title: t('fragment.exported', '내보내기 완료'),
                description: t('fragment.exportedDesc', '{{name}}.txt 파일로 저장되었습니다.', { name: selectedFile.name }),
            })
        } catch (error) {
            console.error('Failed to export txt:', error)
            toast({
                variant: 'destructive',
                title: t('common.error', '오류'),
                description: t('fragment.exportError', '파일을 저장하는 중 오류가 발생했습니다.'),
            })
        }
    }

    // 전체 내보내기 (JSON)
    const handleExportAll = async () => {
        try {
            const { save } = await import('@tauri-apps/plugin-dialog')
            const { writeTextFile } = await import('@tauri-apps/plugin-fs')

            const data = await exportAll()
            
            const filePath = await save({
                defaultPath: `NAIS_Fragments_${Date.now()}.json`,
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
            })

            if (!filePath) return

            await writeTextFile(filePath, JSON.stringify(data, null, 2))

            toast({
                title: t('fragment.exportedAll', '전체 내보내기 완료'),
                description: t('fragment.exportedAllDesc', '{{count}}개 파일을 내보냈습니다.', { count: data.meta.length }),
            })
        } catch (error) {
            console.error('Failed to export all:', error)
            toast({
                variant: 'destructive',
                title: t('common.error', '오류'),
                description: t('fragment.exportError', '파일을 저장하는 중 오류가 발생했습니다.'),
            })
        }
    }

    // 전체 가져오기 (JSON)
    const handleImportAll = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog')
            const { readTextFile } = await import('@tauri-apps/plugin-fs')

            const selected = await open({
                multiple: false,
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
            })

            if (!selected || Array.isArray(selected)) return

            const content = await readTextFile(selected)
            const data = JSON.parse(content)

            // 데이터 유효성 검사
            if (!data.meta || !Array.isArray(data.meta) || !data.contents) {
                throw new Error('Invalid format')
            }

            const importedCount = await importAll(data)

            toast({
                title: t('fragment.importedAll', '전체 가져오기 완료'),
                description: t('fragment.importedAllDesc', '{{count}}개 파일을 가져왔습니다.', { count: importedCount }),
            })
        } catch (error) {
            console.error('Failed to import all:', error)
            toast({
                variant: 'destructive',
                title: t('common.error', '오류'),
                description: t('fragment.importAllError', 'JSON 파일을 가져오는 중 오류가 발생했습니다.'),
            })
        }
    }

    // dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            const oldIndex = files.findIndex(f => f.id === active.id)
            const newIndex = files.findIndex(f => f.id === over.id)
            if (oldIndex !== -1 && newIndex !== -1) {
                const newFiles = [...files]
                const [removed] = newFiles.splice(oldIndex, 1)
                newFiles.splice(newIndex, 0, removed)
                reorderFiles(newFiles)
            }
        }
    }

    // 폴더별 파일 그룹화
    const filesByFolder: Record<string, FragmentFileMeta[]> = { '': [] }
    folders.forEach(f => { filesByFolder[f] = [] })
    files.forEach(f => {
        const folder = f.folder || ''
        if (!filesByFolder[folder]) filesByFolder[folder] = []
        filesByFolder[folder].push(f)
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Puzzle className="h-5 w-5" />
                        {t('fragment.manager', '조각 프롬프트 관리')}
                        {tooltipEnabled && (
                            <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button type="button" className="inline-flex items-center justify-center h-5 w-5 ml-1 rounded hover:bg-muted">
                                            <Info className="h-4 w-4 text-muted-foreground" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-sm">
                                        <div className="space-y-2 text-sm">
                                            <p className="font-medium">{t('fragment.usageGuide', '사용법')}</p>
                                            <div className="space-y-1 font-mono text-xs">
                                                <p><code>&lt;name&gt;</code> - {t('fragment.usageRandom', '랜덤 선택')}</p>
                                                <p><code>&lt;folder/name&gt;</code> - {t('fragment.usageFolder', '폴더 내 파일')}</p>
                                                <p><code>&lt;*name&gt;</code> - {t('fragment.usageSequential', '순차 선택')}</p>
                                                <p><code>&lt;a|b|c&gt;</code> - {t('fragment.usageInline', '인라인 랜덤')}</p>
                                            </div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        {!tooltipEnabled && (
                            <button type="button" className="inline-flex items-center justify-center h-5 w-5 ml-1 rounded hover:bg-muted">
                                <Info className="h-4 w-4 text-muted-foreground" />
                            </button>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex gap-4 min-h-0">
                    {/* 왼쪽: 파일 트리 */}
                    <div className="w-64 flex flex-col border rounded-lg">
                        <div className="p-2 border-b flex gap-1">
                            <Tip content={t('fragment.newFile', '새 파일')}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCreateFile()}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </Tip>
                            <Tip content={t('fragment.newFolder', '새 폴더')}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsCreatingFolder(true)}
                                >
                                    <FolderPlus className="h-4 w-4" />
                                </Button>
                            </Tip>
                            <Tip content={t('fragment.resetCounters', '순차 카운터 리셋')}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleResetCounters}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                            </Tip>
                            <div className="flex-1" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" title={t('fragment.importExport', '불러오기/내보내기')}>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={handleImportTxt}>
                                        <Upload className="h-4 w-4 mr-2" />
                                        {t('fragment.importTxt', 'txt 파일 불러오기')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleImportAll}>
                                        <Upload className="h-4 w-4 mr-2" />
                                        {t('fragment.importAllJson', '전체 불러오기 (JSON)')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleExportAll} disabled={files.length === 0}>
                                        <Download className="h-4 w-4 mr-2" />
                                        {t('fragment.exportAll', '전체 내보내기 (JSON)')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => setShowUploadDialog(true)}
                                        disabled={!selectedFile}
                                        title={!selectedFile ? t('marketplace.selectFileFirst', '공유할 파일을 먼저 선택하세요') : undefined}
                                    >
                                        <Store className="h-4 w-4 mr-2" />
                                        {t('marketplace.shareFragment', '마켓에 공유')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {isCreatingFolder && (
                            <div className="p-2 border-b flex gap-1">
                                <Input
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder={t('fragment.folderName', '폴더 이름')}
                                    className="h-7 text-sm"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateFolder()
                                        if (e.key === 'Escape') setIsCreatingFolder(false)
                                    }}
                                    autoFocus
                                />
                                <Button size="sm" onClick={handleCreateFolder} className="h-7 px-2">
                                    {t('common.create', '생성')}
                                </Button>
                            </div>
                        )}

                        <ScrollArea className="flex-1">
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                            >
                                <div className="p-2">
                                    {/* 루트 파일들 */}
                                    <SortableContext
                                        items={filesByFolder['']?.map(f => f.id) || []}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {filesByFolder['']?.map(file => (
                                            <SortableFileItem
                                                key={file.id}
                                                file={file}
                                                isSelected={selectedFileId === file.id}
                                                onSelect={() => handleSelectFile(file)}
                                                onDelete={() => handleDeleteFile(file.id)}
                                                onDuplicate={() => handleDuplicateFile(file.id)}
                                            />
                                        ))}
                                    </SortableContext>

                                    {/* 폴더들 */}
                                    {folders.map(folder => (
                                        <FolderItem
                                            key={folder}
                                            folder={folder}
                                            files={filesByFolder[folder] || []}
                                            isExpanded={expandedFolders.has(folder)}
                                            selectedFileId={selectedFileId}
                                            onToggle={() => toggleFolder(folder)}
                                            onSelectFile={handleSelectFile}
                                            onDeleteFile={handleDeleteFile}
                                            onDuplicateFile={handleDuplicateFile}
                                            onDeleteFolder={() => handleDeleteFolder(folder)}
                                            onAddFile={() => handleCreateFile(folder)}
                                        />
                                    ))}

                                    {files.length === 0 && (
                                        <div className="text-center text-muted-foreground text-sm py-8">
                                            {t('fragment.noFiles', '조각 프롬프트가 없습니다.')}
                                            <br />
                                            {t('fragment.createFirst', '+ 버튼으로 새 파일을 만드세요.')}
                                        </div>
                                    )}
                                </div>
                            </DndContext>
                        </ScrollArea>
                    </div>

                    {/* 오른쪽: 에디터 */}
                    <div className="flex-1 flex flex-col border rounded-lg">
                        {selectedFile ? (
                            <>
                                <div className="p-2 border-b flex gap-2 items-center">
                                    <Input
                                        value={editingFolder}
                                        onChange={(e) => {
                                            setEditingFolder(e.target.value)
                                            setHasChanges(true)
                                        }}
                                        placeholder={t('fragment.folderOptional', '폴더 (선택)')}
                                        className="h-8 w-32"
                                    />
                                    <span className="text-muted-foreground">/</span>
                                    <Input
                                        value={editingName}
                                        onChange={(e) => {
                                            setEditingName(e.target.value)
                                            setHasChanges(true)
                                        }}
                                        placeholder={t('fragment.fileName', '파일 이름')}
                                        className="h-8 w-40"
                                    />
                                    <div className="flex-1" />
                                    <Tip content={t('fragment.exportTxt', 'txt 파일로 내보내기')}>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleExportTxt}
                                        >
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    </Tip>
                                    <Button
                                        size="sm"
                                        onClick={handleSave}
                                        className={cn(
                                            "gap-1 transition-all",
                                            hasChanges && "bg-yellow-500 hover:bg-yellow-600 text-black animate-pulse shadow-lg shadow-yellow-500/50"
                                        )}
                                    >
                                        <Save className="h-4 w-4" />
                                        {t('common.save', '저장')}
                                    </Button>
                                </div>

                                <div className="p-2 border-b bg-muted/50">
                                    <code className="text-xs text-muted-foreground">
                                        {t('fragment.usage', '사용법')}: {'<'}
                                        {editingFolder ? `${editingFolder}/` : ''}{editingName || 'name'}
                                        {'>'} {t('fragment.or', '또는')} {'<*'}
                                        {editingFolder ? `${editingFolder}/` : ''}{editingName || 'name'}
                                        {'>'} ({t('fragment.sequential', '순차')})
                                    </code>
                                </div>

                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <AutocompleteTextarea
                                        value={editingContent}
                                        onChange={(e) => {
                                            setEditingContent(e.target.value)
                                            setHasChanges(true)
                                        }}
                                        className="h-full w-full border-0 focus-within:ring-0 rounded-none bg-transparent font-mono"
                                        placeholder={t('fragment.contentPlaceholder', '한 줄에 하나씩 옵션을 입력하세요.\n# 으로 시작하는 줄은 주석입니다.\n\n예시:\nlong hair, blue eyes\nshort hair, red eyes\ntwintails, green eyes')}
                                        style={{ fontSize: '0.875rem' }}
                                    />
                                </div>

                                <div className="p-2 border-t bg-muted/50 flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                        {editingContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length} {t('fragment.lines', '개 항목')}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>{t('fragment.selectFile', '왼쪽에서 파일을 선택하세요')}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>

            <UploadFragmentDialog
                open={showUploadDialog}
                onOpenChange={setShowUploadDialog}
                fileId={selectedFileId}
            />
        </Dialog>
    )
}

// Sortable 파일 아이템 컴포넌트
function SortableFileItem({
    file,
    isSelected,
    onSelect,
    onDelete,
    onDuplicate,
}: {
    file: FragmentFileMeta
    isSelected: boolean
    onSelect: () => void
    onDelete: () => void
    onDuplicate: () => void
}) {
    const { t } = useTranslation()
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: file.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined,
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors",
                            isSelected ? "bg-primary/20" : "hover:bg-muted",
                            isDragging && "ring-2 ring-primary"
                        )}
                        onClick={onSelect}
                    >
                        <div 
                            className="p-1 -ml-1 cursor-grab hover:bg-muted/50 rounded active:cursor-grabbing touch-none"
                            {...listeners}
                        >
                            <GripVertical className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground" />
                        </div>
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                            ({file.lineCount})
                        </span>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={onDuplicate}>
                        <Copy className="h-4 w-4 mr-2" />
                        {t('common.copy', '복제')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={onDelete} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('common.delete', '삭제')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        </div>
    )
}

// 파일 아이템 컴포넌트 (폴더 내부용 - 드래그 없음)
function FileItem({
    file,
    isSelected,
    onSelect,
    onDelete,
    onDuplicate,
}: {
    file: FragmentFileMeta
    isSelected: boolean
    onSelect: () => void
    onDelete: () => void
    onDuplicate: () => void
}) {
    const { t } = useTranslation()

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors",
                        isSelected ? "bg-primary/20" : "hover:bg-muted"
                    )}
                    onClick={onSelect}
                >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                        ({file.lineCount})
                    </span>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onDuplicate}>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('common.copy', '복제')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('common.delete', '삭제')}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

// 폴더 아이템 컴포넌트
function FolderItem({
    folder,
    files,
    isExpanded,
    selectedFileId,
    onToggle,
    onSelectFile,
    onDeleteFile,
    onDuplicateFile,
    onDeleteFolder,
    onAddFile,
}: {
    folder: string
    files: FragmentFileMeta[]
    isExpanded: boolean
    selectedFileId: string | null
    onToggle: () => void
    onSelectFile: (file: FragmentFileMeta) => void
    onDeleteFile: (id: string) => void
    onDuplicateFile: (id: string) => void
    onDeleteFolder: () => void
    onAddFile: () => void
}) {
    const { t } = useTranslation()

    return (
        <div>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted cursor-pointer transition-colors"
                        onClick={onToggle}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        <span className="text-sm font-medium flex-1">{folder}</span>
                        <span className="text-xs text-muted-foreground">
                            ({files.length})
                        </span>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={onAddFile}>
                        <Plus className="h-4 w-4 mr-2" />
                        {t('fragment.addToFolder', '파일 추가')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={onDeleteFolder} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('fragment.deleteFolder', '폴더 삭제')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {isExpanded && (
                <div className="ml-4">
                    {files.map(file => (
                        <FileItem
                            key={file.id}
                            file={file}
                            isSelected={selectedFileId === file.id}
                            onSelect={() => onSelectFile(file)}
                            onDelete={() => onDeleteFile(file.id)}
                            onDuplicate={() => onDuplicateFile(file.id)}
                        />
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground"
                        onClick={onAddFile}
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        {t('fragment.addToFolder', '파일 추가')}
                    </Button>
                </div>
            )}
        </div>
    )
}
