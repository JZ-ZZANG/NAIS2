import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { supabase, ReportReason, readableError } from '@/lib/supabase'
import { useMarketAuthStore } from '@/stores/market-auth-store'
import { Flag } from 'lucide-react'

interface ReportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    presetId: string
}

const REASONS: { value: ReportReason; labelKey: string; fallback: string }[] = [
    { value: 'nsfw_minor', labelKey: 'marketplace.reportReason.nsfw_minor', fallback: '미성년자 관련 부적절한 콘텐츠' },
    { value: 'real_person', labelKey: 'marketplace.reportReason.real_person', fallback: '실존 인물 관련 부적절한 콘텐츠' },
    { value: 'spam', labelKey: 'marketplace.reportReason.spam', fallback: '스팸 / 광고' },
    { value: 'other', labelKey: 'marketplace.reportReason.other', fallback: '기타' },
]

export function ReportDialog({ open, onOpenChange, presetId }: ReportDialogProps) {
    const { t } = useTranslation()
    const user = useMarketAuthStore(s => s.user)
    const [reason, setReason] = useState<ReportReason>('nsfw_minor')
    const [detail, setDetail] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!user) {
            toast({ title: t('marketplace.loginRequired', '로그인이 필요합니다'), variant: 'destructive' })
            return
        }

        setSubmitting(true)
        try {
            const { error } = await supabase.from('preset_reports').insert({
                user_id: user.id,
                preset_id: presetId,
                reason,
                detail: detail.trim() || null,
            })

            if (error) {
                if (error.code === '23505') {
                    toast({ title: t('marketplace.alreadyReported', '이미 신고한 프리셋입니다'), variant: 'default' })
                } else {
                    throw error
                }
            } else {
                toast({ title: t('marketplace.reportSubmitted', '신고가 접수되었습니다'), variant: 'success' })
            }
            onOpenChange(false)
            setDetail('')
        } catch (e: any) {
            console.error('Report failed:', e)
            toast({ title: t('marketplace.reportFailed', '신고 실패'), description: readableError(e), variant: 'destructive' })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Flag className="h-4 w-4 text-destructive" />
                        {t('marketplace.reportTitle', '프리셋 신고')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('marketplace.reportDesc', '누적 신고 시 자동으로 비공개 처리됩니다.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <Label className="text-xs">{t('marketplace.reportReasonLabel', '사유')}</Label>
                        <div className="space-y-1.5 mt-2">
                            {REASONS.map(r => (
                                <label key={r.value} className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 p-2 rounded">
                                    <input
                                        type="radio"
                                        name="reason"
                                        value={r.value}
                                        checked={reason === r.value}
                                        onChange={() => setReason(r.value)}
                                    />
                                    <span className="text-sm">{t(r.labelKey, r.fallback)}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs">{t('marketplace.reportDetail', '상세 내용')} ({t('common.optional', '선택')})</Label>
                        <textarea
                            value={detail}
                            onChange={(e) => setDetail(e.target.value)}
                            maxLength={500}
                            placeholder={t('marketplace.reportDetailPlaceholder', '추가 설명이 있으시면 입력해주세요')}
                            className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        {t('common.cancel', '취소')}
                    </Button>
                    <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? t('marketplace.submitting', '전송 중...') : t('marketplace.submitReport', '신고 제출')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
