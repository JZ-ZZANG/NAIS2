import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { supabase, readableError } from '@/lib/supabase'
import { useMarketAuthStore } from '@/stores/market-auth-store'
import { useFragmentStore } from '@/stores/fragment-store'
import { Upload, X, Plus } from 'lucide-react'

interface UploadFragmentDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    fileId: string | null
    onUploaded?: () => void
}

export function UploadFragmentDialog({ open, onOpenChange, fileId, onUploaded }: UploadFragmentDialogProps) {
    const { t } = useTranslation()
    const { user } = useMarketAuthStore()
    const files = useFragmentStore(s => s.files)
    const loadFileContent = useFragmentStore(s => s.loadFileContent)

    const selectedFile = fileId ? files.find(f => f.id === fileId) ?? null : null

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [tagInput, setTagInput] = useState('')
    const [uploading, setUploading] = useState(false)

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setTitle('')
            setDescription('')
            setTags([])
            setTagInput('')
        } else if (selectedFile) {
            setTitle(selectedFile.name)
        }
        onOpenChange(next)
    }

    const addTag = () => {
        const v = tagInput.trim()
        if (!v || tags.includes(v) || tags.length >= 5) return
        setTags([...tags, v])
        setTagInput('')
    }

    const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))

    const handleUpload = async () => {
        if (!user || !selectedFile) return
        if (!title.trim()) {
            toast({ title: t('marketplace.titleRequired', '제목을 입력해주세요'), variant: 'destructive' })
            return
        }

        setUploading(true)
        try {
            const content = await loadFileContent(selectedFile.id)
            const exportData = {
                meta: [selectedFile],
                contents: { [selectedFile.id]: content },
            }

            const { error } = await supabase.from('presets').insert({
                user_id: user.id,
                title: title.trim(),
                description: description.trim() || null,
                type: 'fragment',
                scene_data: exportData,
                scene_count: 1,
                tags: tags,
            })

            if (error) throw error

            toast({ title: t('marketplace.uploadSuccess', '업로드 완료'), variant: 'success' })
            handleOpenChange(false)
            onUploaded?.()
        } catch (e: any) {
            console.error('Fragment upload failed:', e)
            toast({ title: t('marketplace.uploadFailed', '업로드 실패'), description: readableError(e), variant: 'destructive' })
        } finally {
            setUploading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        {t('marketplace.shareFragment', '조각 프롬프트 공유')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('marketplace.shareDesc', '업로드한 프리셋은 공개되며 누구나 다운로드할 수 있습니다.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {selectedFile && (
                        <div className="text-sm text-muted-foreground">
                            {t('marketplace.selectedFragment', '선택된 조각')}:{' '}
                            <span className="font-medium text-foreground">
                                {selectedFile.folder ? `${selectedFile.folder}/` : ''}{selectedFile.name}
                            </span>
                            {' · '}
                            <span>{t('marketplace.lineCount', '{{count}}줄', { count: selectedFile.lineCount })}</span>
                        </div>
                    )}

                    <div>
                        <Label className="text-xs">{t('marketplace.presetTitle', '제목')} *</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={50}
                            placeholder={t('marketplace.fragmentTitlePlaceholder', '조각 프롬프트 제목 (최대 50자)')}
                            className="mt-1"
                        />
                    </div>

                    <div>
                        <Label className="text-xs">{t('marketplace.description', '설명')}</Label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={500}
                            placeholder={t('marketplace.descriptionPlaceholder', '설명 (선택)')}
                            className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{description.length}/500</p>
                    </div>

                    <div>
                        <Label className="text-xs">{t('marketplace.tags', '태그')} ({tags.length}/5)</Label>
                        <div className="flex gap-2 mt-1">
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                                placeholder={t('marketplace.tagPlaceholder', '태그 입력 후 Enter')}
                                disabled={tags.length >= 5}
                                className="flex-1"
                            />
                            <Button type="button" size="icon" variant="outline" onClick={addTag} disabled={tags.length >= 5 || !tagInput.trim()}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {tags.map(tag => (
                                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                        #{tag}
                                        <button onClick={() => removeTag(tag)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={uploading}>
                        {t('common.cancel', '취소')}
                    </Button>
                    <Button
                        onClick={handleUpload}
                        disabled={uploading || !title.trim() || !user || !selectedFile}
                    >
                        {uploading ? t('marketplace.uploading', '업로드 중...') : t('marketplace.upload', '업로드')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
