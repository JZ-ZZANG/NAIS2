import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Image as ImageIcon, Plus, Trash2, User, Waves, Eye, EyeOff, type LucideIcon } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useSceneStore, SceneCharacterSequenceEntry } from '@/stores/scene-store'
import { useCharacterPromptStore, CharacterPrompt, FOLDER_COLORS } from '@/stores/character-prompt-store'
import { useCharacterStore, ReferenceImage } from '@/stores/character-store'

interface SceneCharacterSequenceDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SceneCharacterSequenceDialog({ open, onOpenChange }: SceneCharacterSequenceDialogProps) {
    const { t } = useTranslation()
    const entries = useSceneStore(s => s.characterSequenceEntries)
    const addEntry = useSceneStore(s => s.addCharacterSequenceEntry)
    const updateEntry = useSceneStore(s => s.updateCharacterSequenceEntry)
    const deleteEntry = useSceneStore(s => s.deleteCharacterSequenceEntry)
    const clearEntries = useSceneStore(s => s.clearCharacterSequenceEntries)

    const promptCharacters = useCharacterPromptStore(s => s.characters)
    const promptGroups = useCharacterPromptStore(s => s.groups)
    const characterImages = useCharacterStore(s => s.characterImages)
    const vibeImages = useCharacterStore(s => s.vibeImages)
    const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (!open) return
        setCollapsedGroupIds(new Set(promptGroups.filter(group => group.collapsed).map(group => group.id)))
    }, [open, promptGroups])

    const groupedPrompts = useMemo(() => {
        const groupIds = new Set(promptGroups.map(g => g.id))
        const ungrouped = promptCharacters.filter(c => !c.groupId || !groupIds.has(c.groupId))
        return [
            ...promptGroups.map(group => ({
                id: group.id,
                name: group.name,
                characters: promptCharacters.filter(c => c.groupId === group.id),
                colorIndex: group.colorIndex,
                isUngrouped: false,
            })),
            { id: 'ungrouped', name: t('characterPanel.ungrouped'), characters: ungrouped, colorIndex: undefined, isUngrouped: true },
        ].filter(group => group.characters.length > 0)
    }, [promptGroups, promptCharacters, t])

    const toggleId = (ids: string[], id: string) =>
        ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]

    const getCharacterName = (character: CharacterPrompt, fallbackIndex?: number) =>
        character.name
        || character.prompt.split(',')[0]?.trim()
        || t('characterPanel.unnamed', `Character ${(fallbackIndex ?? 0) + 1}`)

    const promptName = (id: string) => {
        const index = promptCharacters.findIndex(c => c.id === id)
        const character = promptCharacters[index]
        return character ? getCharacterName(character, index) : id
    }
    const refName = (images: ReferenceImage[], id: string) => {
        const index = images.findIndex(img => img.id === id)
        return index >= 0 ? `#${index + 1}` : id
    }
    const toggleGroupCollapsed = (groupId: string) => {
        setCollapsedGroupIds(prev => {
            const next = new Set(prev)
            if (next.has(groupId)) next.delete(groupId)
            else next.add(groupId)
            return next
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[88vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>{t('sceneSequence.title', 'Character / Reference Queue Repeat')}</DialogTitle>
                    <DialogDescription>
                        {t('sceneSequence.description', 'Repeats the full queue while changing character prompts / reference images. When this mode is enabled, character prompts/reference images from the main settings are not applied.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                        {t('sceneSequence.itemCount', '{{count}} items', { count: entries.length })}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={clearEntries} disabled={entries.length === 0}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('sceneSequence.clearAll', 'Clear All')}
                        </Button>
                        <Button size="sm" onClick={() => addEntry()}>
                            <Plus className="h-4 w-4 mr-2" />
                            {t('sceneSequence.addItem', 'Add Item')}
                        </Button>
                    </div>
                </div>

                <ScrollArea className="flex-1 min-h-0 pr-3">
                    <div className="space-y-4 pb-2">
                        {entries.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
                                <User className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                <p className="text-sm">{t('sceneSequence.empty', 'Add a queue repeat item to start.')}</p>
                            </div>
                        ) : entries.map((entry, index) => (
                            <SequenceEntryEditor
                                key={entry.id}
                                entry={entry}
                                index={index}
                                groupedPrompts={groupedPrompts}
                                collapsedGroupIds={collapsedGroupIds}
                                onToggleGroup={toggleGroupCollapsed}
                                getCharacterName={getCharacterName}
                                characterImages={characterImages}
                                vibeImages={vibeImages}
                                onUpdate={(updates) => updateEntry(entry.id, updates)}
                                onDelete={() => deleteEntry(entry.id)}
                                toggleId={toggleId}
                                promptName={promptName}
                                refName={refName}
                                t={t}
                            />
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

function SequenceEntryEditor({
    entry,
    index,
    groupedPrompts,
    collapsedGroupIds,
    onToggleGroup,
    getCharacterName,
    characterImages,
    vibeImages,
    onUpdate,
    onDelete,
    toggleId,
    promptName,
    refName,
    t,
}: {
    entry: SceneCharacterSequenceEntry
    index: number
    groupedPrompts: { id: string; name: string; characters: CharacterPrompt[]; colorIndex?: number; isUngrouped: boolean }[]
    collapsedGroupIds: Set<string>
    onToggleGroup: (groupId: string) => void
    getCharacterName: (character: CharacterPrompt, fallbackIndex?: number) => string
    characterImages: ReferenceImage[]
    vibeImages: ReferenceImage[]
    onUpdate: (updates: Partial<SceneCharacterSequenceEntry>) => void
    onDelete: () => void
    toggleId: (ids: string[], id: string) => string[]
    promptName: (id: string) => string
    refName: (images: ReferenceImage[], id: string) => string
    t: ReturnType<typeof useTranslation>['t']
}) {
    const selectedPromptNames = entry.characterPromptIds.map(promptName)
    const selectedCharacterRefs = entry.characterReferenceIds.map(id => refName(characterImages, id))
    const selectedVibeRefs = entry.vibeReferenceIds.map(id => refName(vibeImages, id))
    const selectedItems = [
        ...selectedPromptNames.map((label, index) => ({
            key: `prompt-${entry.characterPromptIds[index]}`,
            label,
            className: 'bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 dark:text-sky-300',
            onRemove: () => onUpdate({ characterPromptIds: entry.characterPromptIds.filter((_, i) => i !== index) }),
        })),
        ...selectedCharacterRefs.map((label, index) => ({
            key: `ref-${entry.characterReferenceIds[index]}`,
            label: `${t('sceneSequence.refBadge')} ${label}`,
            className: 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300',
            onRemove: () => onUpdate({ characterReferenceIds: entry.characterReferenceIds.filter((_, i) => i !== index) }),
        })),
        ...selectedVibeRefs.map((label, index) => ({
            key: `vibe-${entry.vibeReferenceIds[index]}`,
            label: `${t('sceneSequence.vibeBadge')} ${label}`,
            className: 'bg-violet-500/15 text-violet-700 hover:bg-violet-500/25 dark:text-violet-300',
            onRemove: () => onUpdate({ vibeReferenceIds: entry.vibeReferenceIds.filter((_, i) => i !== index) }),
        })),
    ]

    return (
        <div className={cn("rounded-xl border bg-card/50 overflow-hidden", !entry.enabled && "opacity-60")}>
            <div className="flex items-center gap-3 p-3 border-b bg-muted/25">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                </div>
                <Input
                    value={entry.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    className="h-8 max-w-xs"
                    placeholder={t('sceneSequence.itemNamePlaceholder')}
                />
                <Button
                    variant={entry.enabled ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-8 w-8 ml-auto"
                    onClick={() => onUpdate({ enabled: !entry.enabled })}
                >
                    {entry.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
                <div className="space-y-2">
                    <SectionTitle icon={User} title={t('sceneSequence.characterPrompts', 'Character Prompts')} count={entry.characterPromptIds.length} />
                    <div className="rounded-lg border bg-background/50 max-h-72 overflow-y-auto p-2 space-y-2">
                        {groupedPrompts.length === 0 ? (
                            <EmptySmall label={t('sceneSequence.noPromptPresets', 'No character prompts.')} />
                        ) : groupedPrompts.map(group => (
                            <div key={group.id} className="space-y-1.5 rounded-lg">
                                <FolderHeader
                                    group={group}
                                    collapsed={collapsedGroupIds.has(group.id)}
                                    onToggle={() => onToggleGroup(group.id)}
                                />
                                {!collapsedGroupIds.has(group.id) && (
                                    <div className={cn(
                                        "space-y-1.5 pb-1",
                                        !group.isUngrouped && "pl-4 ml-2 border-l-2",
                                        !group.isUngrouped && FOLDER_COLORS[group.colorIndex ?? 0]?.border
                                    )}>
                                        {group.characters.map((character, characterIndex) => (
                                            <label key={character.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                                                <Checkbox
                                                    checked={entry.characterPromptIds.includes(character.id)}
                                                    onCheckedChange={() => onUpdate({ characterPromptIds: toggleId(entry.characterPromptIds, character.id) })}
                                                    className="mt-0.5"
                                                />
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate">{getCharacterName(character, characterIndex)}</div>
                                                    <div className="text-xs text-muted-foreground line-clamp-2">{character.prompt}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <ReferencePicker
                    title={t('sceneSequence.characterReferences', 'Character References')}
                    icon={ImageIcon}
                    images={characterImages}
                    selectedIds={entry.characterReferenceIds}
                    onChange={(ids) => onUpdate({ characterReferenceIds: ids })}
                    toggleId={toggleId}
                    emptyLabel={t('sceneSequence.noCharacterRefs', 'No character references.')}
                />

                <ReferencePicker
                    title={t('sceneSequence.vibeReferences', 'Vibe References')}
                    icon={Waves}
                    images={vibeImages}
                    selectedIds={entry.vibeReferenceIds}
                    onChange={(ids) => onUpdate({ vibeReferenceIds: ids })}
                    toggleId={toggleId}
                    emptyLabel={t('sceneSequence.noVibeRefs', 'No vibe references.')}
                />
            </div>

            <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                {selectedItems.map(item => (
                    <button
                        key={item.key}
                        type="button"
                        className={cn("max-w-[180px] truncate rounded-md px-2 py-1 text-xs transition-colors", item.className)}
                        onClick={item.onRemove}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    )
}

function FolderHeader({
    group,
    collapsed,
    onToggle,
}: {
    group: { id: string; name: string; characters: CharacterPrompt[]; colorIndex?: number; isUngrouped: boolean }
    collapsed: boolean
    onToggle: () => void
}) {
    const folderColor = group.isUngrouped ? null : FOLDER_COLORS[group.colorIndex ?? 0]
    const FolderIcon = collapsed ? Folder : FolderOpen

    return (
        <button
            type="button"
            className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60",
                folderColor?.bg || "bg-muted/30"
            )}
            onClick={onToggle}
        >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <FolderIcon className={cn("h-4 w-4", folderColor?.icon || "text-muted-foreground")} />
            <span className="truncate">{group.name}</span>
            <span className="ml-auto text-muted-foreground">({group.characters.length})</span>
        </button>
    )
}

function ReferencePicker({
    title,
    icon: Icon,
    images,
    selectedIds,
    onChange,
    toggleId,
    emptyLabel,
}: {
    title: string
    icon: LucideIcon
    images: ReferenceImage[]
    selectedIds: string[]
    onChange: (ids: string[]) => void
    toggleId: (ids: string[], id: string) => string[]
    emptyLabel: string
}) {
    return (
        <div className="space-y-2">
            <SectionTitle icon={Icon} title={title} count={selectedIds.length} />
            <div className="rounded-lg border bg-background/50 max-h-72 overflow-y-auto p-2">
                {images.length === 0 ? (
                    <EmptySmall label={emptyLabel} />
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {images.map((image, index) => {
                            const selected = selectedIds.includes(image.id)
                            return (
                                <button
                                    key={image.id}
                                    type="button"
                                    className={cn(
                                        "relative aspect-square rounded-lg overflow-hidden border bg-muted/30 text-left transition-all",
                                        selected ? "ring-2 ring-primary border-primary" : "opacity-55 grayscale hover:opacity-85 hover:grayscale-0 hover:border-primary/60"
                                    )}
                                    onClick={() => onChange(toggleId(selectedIds, image.id))}
                                >
                                    {image.thumbnail || image.base64 ? (
                                        <img src={image.thumbnail || image.base64} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                            <ImageIcon className="h-6 w-6" />
                                        </div>
                                    )}
                                    <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                        {`#${index + 1}`}
                                    </div>
                                    {!selected && (
                                        <div className="absolute inset-0 bg-background/25 pointer-events-none" />
                                    )}
                                    <div className="absolute right-1 bottom-1 rounded bg-black/50 p-0.5">
                                        <Checkbox
                                            checked={selected}
                                            onClick={(e) => e.stopPropagation()}
                                            onCheckedChange={() => onChange(toggleId(selectedIds, image.id))}
                                        />
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

function SectionTitle({ icon: Icon, title, count }: { icon: LucideIcon, title: string, count: number }) {
    return (
        <div className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span>{title}</span>
            <Badge variant="outline" className="ml-auto">{count}</Badge>
        </div>
    )
}

function EmptySmall({ label }: { label: string }) {
    return (
        <div className="py-8 text-center text-xs text-muted-foreground">
            {label}
        </div>
    )
}
