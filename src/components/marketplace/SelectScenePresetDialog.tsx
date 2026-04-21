import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useSceneStore, ScenePreset } from '@/stores/scene-store'
import { Film, ChevronRight } from 'lucide-react'

interface SelectScenePresetDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (preset: ScenePreset) => void
}

export function SelectScenePresetDialog({ open, onOpenChange, onSelect }: SelectScenePresetDialogProps) {
    const { t } = useTranslation()
    const presets = useSceneStore(s => s.presets)

    const eligible = presets.filter(p => p.scenes.length > 0)

    const handleSelect = (preset: ScenePreset) => {
        onSelect(preset)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Film className="h-5 w-5 text-blue-400" />
                        {t('marketplace.selectScenePreset', '업로드할 씬 프리셋 선택')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('marketplace.selectScenePresetDesc', '마켓에 공유할 씬 프리셋을 선택하세요.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
                    {eligible.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                            <Film className="h-10 w-10 opacity-30 mb-3" />
                            <p className="text-sm">{t('marketplace.noScenePresets', '업로드 가능한 씬 프리셋이 없습니다')}</p>
                            <p className="text-xs mt-1">{t('marketplace.noScenePresetsDesc', '씬 모드에서 프리셋을 먼저 만들어주세요')}</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {eligible.map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => handleSelect(preset)}
                                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors text-left"
                                >
                                    <Film className="h-4 w-4 text-blue-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate">{preset.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t('marketplace.sceneCount', '씬')}: {preset.scenes.length}
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
