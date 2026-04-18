import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { useMarketAuthStore, getUsernameCooldownEndsAt } from '@/stores/market-auth-store'
import { readableError } from '@/lib/supabase'
import { UserCog, Clock } from 'lucide-react'

interface ChangeUsernameDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

function formatRemaining(ms: number): string {
    const totalMin = Math.ceil(ms / 60000)
    if (totalMin <= 1) return '1분 미만'
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    if (h === 0) return `${m}분`
    if (m === 0) return `${h}시간`
    return `${h}시간 ${m}분`
}

export function ChangeUsernameDialog({ open, onOpenChange }: ChangeUsernameDialogProps) {
    const { t } = useTranslation()
    const profile = useMarketAuthStore(s => s.profile)
    const updateUsername = useMarketAuthStore(s => s.updateUsername)

    const [username, setUsername] = useState('')
    const [saving, setSaving] = useState(false)
    const [now, setNow] = useState(() => Date.now())

    const cooldownEndsAt = useMemo(() => getUsernameCooldownEndsAt(profile), [profile, now])
    const isOnCooldown = !!cooldownEndsAt

    useEffect(() => {
        if (open && profile) setUsername(profile.username)
    }, [open, profile])

    // Refresh remaining time every 30s while dialog is open and on cooldown.
    useEffect(() => {
        if (!open || !isOnCooldown) return
        const timer = setInterval(() => setNow(Date.now()), 30000)
        return () => clearInterval(timer)
    }, [open, isOnCooldown])

    const handleSave = async () => {
        const trimmed = username.trim()
        if (!trimmed) return
        if (trimmed === profile?.username) {
            onOpenChange(false)
            return
        }

        setSaving(true)
        try {
            await updateUsername(trimmed)
            toast({ title: t('marketplace.usernameUpdated', '닉네임이 변경되었습니다'), variant: 'success' })
            onOpenChange(false)
        } catch (e: any) {
            let msg: string
            if (e?.code === 'username_cooldown') {
                msg = t('marketplace.usernameCooldown', '닉네임은 24시간에 한 번만 변경할 수 있습니다')
            } else if (e?.code === '23505') {
                msg = t('marketplace.usernameTaken', '이미 사용 중인 닉네임입니다')
            } else {
                msg = readableError(e)
            }
            toast({ title: t('marketplace.usernameUpdateFailed', '닉네임 변경 실패'), description: msg, variant: 'destructive' })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserCog className="h-4 w-4" />
                        {t('marketplace.changeUsername', '닉네임 변경')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('marketplace.changeUsernameDesc', '2자 이상 20자 이하로 입력해주세요. 24시간에 한 번만 변경할 수 있습니다.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    <Label className="text-xs">{t('marketplace.username', '닉네임')}</Label>
                    <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !saving && !isOnCooldown) handleSave() }}
                        maxLength={20}
                        placeholder={t('marketplace.usernamePlaceholder', '닉네임 입력')}
                        className="mt-1"
                        autoFocus
                        disabled={isOnCooldown}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{username.trim().length}/20</p>

                    {isOnCooldown && cooldownEndsAt && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>
                                {t('marketplace.usernameCooldownRemaining', '{{time}} 후에 다시 변경할 수 있습니다.', {
                                    time: formatRemaining(cooldownEndsAt.getTime() - Date.now()),
                                })}
                            </span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('common.cancel', '취소')}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || isOnCooldown || username.trim().length < 2 || username.trim().length > 20}
                    >
                        {saving ? t('common.saving', '저장 중...') : t('common.save', '저장')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
