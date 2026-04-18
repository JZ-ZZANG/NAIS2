import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useShortcutStore, matchesBinding, ShortcutAction } from '@/stores/shortcut-store'
import { useGenerationStore } from '@/stores/generation-store'
import { useFragmentStore } from '@/stores/fragment-store'

// 커스텀 이벤트 (다이얼로그 열기용)
export const SHORTCUT_EVENTS = {
    OPEN_PROMPT_GENERATOR: 'shortcut:openPromptGenerator',
    OPEN_FRAGMENT_DIALOG: 'shortcut:openFragmentDialog',
    OPEN_PARAMETER_SETTINGS: 'shortcut:openParameterSettings',
    OPEN_IMAGE_REFERENCE: 'shortcut:openImageReference',
    OPEN_CHARACTER_PROMPT: 'shortcut:openCharacterPrompt',
    OPEN_PRESET_DIALOG: 'shortcut:openPresetDialog',
    RESET_FRAGMENT_COUNTERS: 'shortcut:resetFragmentCounters',
}

// 메뉴 순서 정의
const MENU_ROUTES = ['/', '/scenes', '/tools', '/web', '/library', '/settings']

export function useShortcuts() {
    const navigate = useNavigate()
    const location = useLocation()
    const { bindings, enabled } = useShortcutStore()
    const generate = useGenerationStore(state => state.generate)
    const cancelGeneration = useGenerationStore(state => state.cancelGeneration)
    const isGenerating = useGenerationStore(state => state.isGenerating)
    const resetSequentialCounter = useFragmentStore(state => state.resetSequentialCounter)

    useEffect(() => {
        if (!enabled) return

        const handleKeyDown = (e: KeyboardEvent) => {
            // 각 바인딩 체크
            const actions: ShortcutAction[] = [
                'navigate:main',
                'navigate:scenes',
                'navigate:tools',
                'navigate:web',
                'navigate:library',
                'navigate:settings',
                'navigate:next',
                'navigate:prev',
                'open:promptGenerator',
                'open:fragmentDialog',
                'open:parameterSettings',
                'open:imageReference',
                'open:characterPrompt',
                'open:presetDialog',
                'action:generate',
                'action:resetFragmentCounters',
            ]

            for (const action of actions) {
                const binding = bindings[action]
                if (!binding) continue

                if (matchesBinding(e, binding)) {
                    // 네비게이션은 입력 필드에서도 작동
                    if (action.startsWith('navigate:')) {
                        // 다이얼로그가 열려 있으면 Tab/Shift+Tab은 네이티브 포커스 이동에 양보
                        if ((action === 'navigate:next' || action === 'navigate:prev') &&
                            document.querySelector('[role="dialog"][data-state="open"]')) {
                            return
                        }

                        e.preventDefault()

                        // 다음/이전 메뉴 이동
                        if (action === 'navigate:next' || action === 'navigate:prev') {
                            const currentPath = location.pathname.startsWith('/scenes/') ? '/scenes' : location.pathname
                            const currentIndex = MENU_ROUTES.indexOf(currentPath)
                            if (currentIndex === -1) return
                            
                            let nextIndex: number
                            if (action === 'navigate:next') {
                                nextIndex = (currentIndex + 1) % MENU_ROUTES.length
                            } else {
                                nextIndex = (currentIndex - 1 + MENU_ROUTES.length) % MENU_ROUTES.length
                            }
                            navigate(MENU_ROUTES[nextIndex])
                            return
                        }
                        
                        const routes: Record<string, string> = {
                            'navigate:main': '/',
                            'navigate:scenes': '/scenes',
                            'navigate:tools': '/tools',
                            'navigate:web': '/web',
                            'navigate:library': '/library',
                            'navigate:settings': '/settings',
                        }
                        navigate(routes[action])
                        return
                    }

                    // 다이얼로그 열기
                    if (action === 'open:promptGenerator') {
                        e.preventDefault()
                        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.OPEN_PROMPT_GENERATOR))
                        return
                    }

                    if (action === 'open:fragmentDialog') {
                        e.preventDefault()
                        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.OPEN_FRAGMENT_DIALOG))
                        return
                    }

                    if (action === 'open:parameterSettings') {
                        e.preventDefault()
                        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.OPEN_PARAMETER_SETTINGS))
                        return
                    }

                    if (action === 'open:imageReference') {
                        e.preventDefault()
                        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.OPEN_IMAGE_REFERENCE))
                        return
                    }

                    if (action === 'open:characterPrompt') {
                        e.preventDefault()
                        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.OPEN_CHARACTER_PROMPT))
                        return
                    }

                    if (action === 'open:presetDialog') {
                        e.preventDefault()
                        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.OPEN_PRESET_DIALOG))
                        return
                    }

                    // 이미지 생성 (메인 모드에서만)
                    if (action === 'action:generate') {
                        if (location.pathname === '/') {
                            e.preventDefault()
                            if (isGenerating) {
                                cancelGeneration()
                            } else {
                                generate()
                            }
                            return
                        }
                    }

                    // 순차 카운터 리셋
                    if (action === 'action:resetFragmentCounters') {
                        e.preventDefault()
                        resetSequentialCounter()
                        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.RESET_FRAGMENT_COUNTERS))
                        return
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [bindings, enabled, navigate, location.pathname, generate, cancelGeneration, isGenerating, resetSequentialCounter])
}
