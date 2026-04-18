import { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: ReactNode
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'destructive'
    onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText = '확인',
    cancelText = '취소',
    variant = 'default',
    onConfirm,
}: ConfirmDialogProps) {
    const handleConfirm = async () => {
        await onConfirm()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {variant === 'destructive' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                        {title}
                    </DialogTitle>
                    {description && (
                        <DialogDescription className="pt-1 whitespace-pre-wrap">{description}</DialogDescription>
                    )}
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {cancelText}
                    </Button>
                    <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={handleConfirm}>
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
