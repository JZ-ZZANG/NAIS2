import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Pencil, Check, X, FolderOpen, GripVertical, Copy } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { usePresetStore } from '@/stores/preset-store'
import { cn } from '@/lib/utils'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'

interface PresetDialogContentProps {
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

interface SortablePresetItemProps {
    preset: {
        id: string
        name: string
        isDefault?: boolean
    }
    isActive: boolean
    isEditing: boolean
    editName: string
    onSelect: () => void
    onStartEdit: (e: React.MouseEvent) => void
    onDuplicate: (e: React.MouseEvent) => void
    onDelete: (e: React.MouseEvent) => void
    onRename: () => void
    onCancelEdit: () => void
    onEditNameChange: (name: string) => void
    t: any
}

function SortablePresetItem({
    preset,
    isActive,
    isEditing,
    editName,
    onSelect,
    onStartEdit,
    onDuplicate,
    onDelete,
    onRename,
    onCancelEdit,
    onEditNameChange,
    t
}: SortablePresetItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: preset.id,
        disabled: preset.isDefault, // Default preset cannot be dragged
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                isActive
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-muted/30 hover:bg-muted/50 border border-transparent",
                isDragging && "shadow-lg"
            )}
            onClick={onSelect}
        >
            {/* Drag handle - only for non-default presets */}
            {!preset.isDefault && (
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                    onClick={e => e.stopPropagation()}
                >
                    <GripVertical className="h-4 w-4" />
                </div>
            )}

            {isEditing ? (
                <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                    <Input
                        value={editName}
                        onChange={(e) => onEditNameChange(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onRename()
                            if (e.key === 'Escape') onCancelEdit()
                        }}
                    />
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={onRename}
                    >
                        <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={onCancelEdit}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            ) : (
                <>
                    <span className="flex-1 text-sm font-medium truncate">
                        {preset.isDefault ? t('preset.default', '기본') : preset.name}
                    </span>
                    {isActive && (
                        <span className="text-[10px] text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">
                            {t('preset.active', '활성')}
                        </span>
                    )}
                    <div className="flex items-center gap-0.5">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={onDuplicate}
                            title={t('preset.duplicate', '복사')}
                        >
                            <Copy className="h-3 w-3" />
                        </Button>
                        {!preset.isDefault && (
                            <>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={onStartEdit}
                                >
                                    <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={onDelete}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

function PresetDialogContent({ open: externalOpen, onOpenChange: externalOnOpenChange }: PresetDialogContentProps) {
    const { t } = useTranslation()
    const {
        presets,
        activePresetId,
        addPreset,
        duplicatePreset,
        deletePreset,
        loadPreset,
        renamePreset,
        reorderPresets,
    } = usePresetStore()

    const [internalOpen, setInternalOpen] = useState(false)

    // Use external state if provided, otherwise internal
    const open = externalOpen !== undefined ? externalOpen : internalOpen
    const setOpen = externalOnOpenChange || setInternalOpen

    const [isCreating, setIsCreating] = useState(false)
    const [newName, setNewName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setIsCreating(false)
            setNewName('')
            setEditingId(null)
            setEditName('')
        }
    }, [open])

    const handleCreate = () => {
        if (newName.trim()) {
            addPreset(newName.trim())
            setNewName('')
            setIsCreating(false)
        }
    }

    const handleRename = (id: string) => {
        if (editName.trim()) {
            renamePreset(id, editName.trim())
            setEditingId(null)
            setEditName('')
        }
    }

    const handleSelect = (id: string) => {
        loadPreset(id)
        setOpen(false)
    }

    const startEdit = (id: string, currentName: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingId(id)
        setEditName(currentName)
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = presets.findIndex(p => p.id === active.id)
            const newIndex = presets.findIndex(p => p.id === over.id)
            reorderPresets(oldIndex, newIndex)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <FolderOpen className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('preset.title', '프리셋 관리')}</DialogTitle>
                    <DialogDescription>
                        {t('preset.description', '프롬프트와 설정을 프리셋으로 저장하고 불러올 수 있습니다.')}
                    </DialogDescription>
                </DialogHeader>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                >
                    <SortableContext
                        items={presets.map(p => p.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {presets.map(preset => (
                                <SortablePresetItem
                                    key={preset.id}
                                    preset={preset}
                                    isActive={activePresetId === preset.id}
                                    isEditing={editingId === preset.id}
                                    editName={editName}
                                    onSelect={() => handleSelect(preset.id)}
                                    onStartEdit={(e) => startEdit(preset.id, preset.name, e)}
                                    onDuplicate={(e) => {
                                        e.stopPropagation()
                                        duplicatePreset(preset.id)
                                    }}
                                    onDelete={(e) => {
                                        e.stopPropagation()
                                        setDeleteTargetId(preset.id)
                                    }}
                                    onRename={() => handleRename(preset.id)}
                                    onCancelEdit={() => setEditingId(null)}
                                    onEditNameChange={setEditName}
                                    t={t}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {/* Add new preset */}
                <div className="pt-2 border-t">
                    {isCreating ? (
                        <div className="flex items-center gap-2">
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder={t('preset.newName', '프리셋 이름')}
                                className="h-9 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreate()
                                    if (e.key === 'Escape') {
                                        setIsCreating(false)
                                        setNewName('')
                                    }
                                }}
                            />
                            <Button size="sm" onClick={handleCreate}>
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setIsCreating(false)
                                    setNewName('')
                                }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setIsCreating(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {t('preset.add', '새 프리셋')}
                        </Button>
                    )}
                </div>
            </DialogContent>
            <ConfirmDialog
                open={!!deleteTargetId}
                onOpenChange={(o) => !o && setDeleteTargetId(null)}
                title={t('preset.deleteTitle', '프리셋 삭제')}
                description={t('preset.confirmDelete', '프리셋을 삭제하시겠습니까?')}
                confirmText={t('common.delete', '삭제')}
                cancelText={t('common.cancel', '취소')}
                variant="destructive"
                onConfirm={() => { if (deleteTargetId) deletePreset(deleteTargetId) }}
            />
        </Dialog>
    )
}

// Export as PresetDropdown for backward compatibility
export { PresetDialogContent as PresetDropdown }
