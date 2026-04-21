import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useFragmentStore, FragmentFileMeta } from '@/stores/fragment-store'
import { Puzzle, ChevronRight, Folder } from 'lucide-react'

interface SelectFragmentFileDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (file: FragmentFileMeta) => void
}

export function SelectFragmentFileDialog({ open, onOpenChange, onSelect }: SelectFragmentFileDialogProps) {
    const { t } = useTranslation()
    const files = useFragmentStore(s => s.files)

    const handleSelect = (file: FragmentFileMeta) => {
        onSelect(file)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Puzzle className="h-5 w-5 text-green-400" />
                        {t('marketplace.selectFragmentFile', '업로드할 조각 프롬프트 선택')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('marketplace.selectFragmentFileDesc', '마켓에 공유할 조각 프롬프트를 선택하세요.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
                    {files.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                            <Puzzle className="h-10 w-10 opacity-30 mb-3" />
                            <p className="text-sm">{t('marketplace.noFragmentFiles', '업로드 가능한 조각 프롬프트가 없습니다')}</p>
                            <p className="text-xs mt-1">{t('marketplace.noFragmentFilesDesc', '조각 프롬프트를 먼저 만들어주세요')}</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {files.map(file => (
                                <button
                                    key={file.id}
                                    onClick={() => handleSelect(file)}
                                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors text-left"
                                >
                                    <Puzzle className="h-4 w-4 text-green-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate">{file.name}</div>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                            {file.folder && (
                                                <>
                                                    <Folder className="h-3 w-3" />
                                                    <span className="truncate max-w-[120px]">{file.folder}</span>
                                                    <span>·</span>
                                                </>
                                            )}
                                            <span>{t('marketplace.lineCount', '{{count}}줄', { count: file.lineCount })}</span>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
