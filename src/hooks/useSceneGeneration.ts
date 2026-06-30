import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/components/ui/use-toast'
import { useSceneStore } from '@/stores/scene-store'
import { useGenerationStore } from '@/stores/generation-store'
import { useCharacterPromptStore } from '@/stores/character-prompt-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useAuthStore } from '@/stores/auth-store'
import { generateImage, generateImageStream, GenerationParams } from '@/services/novelai-api'
import { BaseDirectory, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import { pictureDir, join } from '@tauri-apps/api/path'
import { processWildcards } from '@/lib/fragment-processor'
import { createThumbnail } from '@/lib/image-utils'
import { useCharacterStore } from '@/stores/character-store'

// Module-level variable to prevent concurrent processing
let isProcessing = false

export function useSceneGeneration() {
    const { t } = useTranslation()
    const { token } = useAuthStore()
    const { savePath, useStreaming: streamingView } = useSettingsStore()

    // NOTE: Do NOT use useGenerationStore() hook here — it subscribes to ALL store
    // changes (prompt typing, preview image, etc.) causing unnecessary re-renders.
    // Use useGenerationStore.getState() inside processQueue instead.

    const {
        isGenerating,
        setIsGenerating,
        activePresetId,
        getNextCharacterSequenceScene,
        getHasMoreSceneGeneration,
        addImageToScene,
        setStreamingData,
        initGenerationProgress,
        setGenerationProgress,
        completedCount,
        totalQueuedCount,
        generationSessionId
    } = useSceneStore()

    useEffect(() => {
        const processQueue = async (sessionId: number) => {
            // CRITICAL: Prevent concurrent API requests (429 error fix)
            // Check and SET immediately to prevent race condition
            if (isProcessing) {
                return
            }
            
            // Session check: If session changed, this processQueue is stale
            if (sessionId !== useSceneStore.getState().generationSessionId) {
                isProcessing = false
                return
            }
            
            isProcessing = true

            // Check if cancelled - if so, stop generation after current API call completes
            const sceneState = useSceneStore.getState()
            if (sceneState.isCancelling || !isGenerating) {
                // If scene generation stopped or cancelled, ensure global mode is cleared
                if (useGenerationStore.getState().generatingMode === 'scene') {
                    useGenerationStore.getState().setGeneratingMode(null)
                }
                setIsGenerating(false)  // This will also reset isCancelling
                isProcessing = false
                return
            }

            // Conflict Check: If Main Mode is generating, stop Scene Mode
            if (useGenerationStore.getState().generatingMode === 'main') {
                setIsGenerating(false)
                isProcessing = false  // CRITICAL: Reset flag on early return
                toast({
                    title: t('common.error', '오류'),
                    description: t('generate.conflictMain', '메인 모드에서 생성 중입니다.'),
                    variant: 'destructive'
                })
                return
            }

            // Set global mode to scene
            if (useGenerationStore.getState().generatingMode !== 'scene') {
                useGenerationStore.getState().setGeneratingMode('scene')
            }

            if (!activePresetId || !token) {
                setIsGenerating(false)
                isProcessing = false  // CRITICAL: Reset flag on early return
                return
            }

            // Double-check session before modifying queue
            if (sessionId !== useSceneStore.getState().generationSessionId) {
                isProcessing = false
                return
            }

            const nextGeneration = getNextCharacterSequenceScene(activePresetId)
            const scene = nextGeneration?.scene
            const sequenceEntry = nextGeneration?.entry ?? null

            if (!scene) {
                setIsGenerating(false)
                // Global mode will be cleared by the effect or next loop
                useGenerationStore.getState().setGeneratingMode(null)

                // Reset progress
                setGenerationProgress(0, 0)
                isProcessing = false  // CRITICAL: Reset flag
                // Release character/vibe base64 from memory after all scene generation completes
                useCharacterStore.getState().releaseImageData()
                toast({ title: t('generate.complete', '생성 완료'), description: t('generate.allComplete', '모든 예약된 작업이 완료되었습니다.'), variant: 'success' })
                return
            }

            // Note: isProcessing is already set at the start of processQueue

            // Start Streaming State for this scene
            setStreamingData(scene.id, null, 0)

            try {
                // Get fresh generation store state
                const genState = useGenerationStore.getState()

                // Helper to remove comment lines (lines starting with #)
                const removeComments = (text: string) => text
                    .split('\n')
                    .filter(line => !line.trimStart().startsWith('#'))
                    .join('\n')

                // Construct Prompt (including inpaintingPrompt if in inpaint mode)
                const parts = [
                    removeComments(genState.basePrompt),
                    // Add inpainting prompt after basePrompt (same as main mode)
                    genState.i2iMode === 'inpaint' ? removeComments(genState.inpaintingPrompt) : null,
                    removeComments(genState.additionalPrompt),
                    removeComments(scene.scenePrompt),
                    removeComments(genState.detailPrompt),
                ].filter(p => p && p.trim())

                // Apply wildcard/fragment processing to final prompt (async)
                // processWildcards handles both <filename> fragments and (a/b/c) random selection
                const finalPrompt = await processWildcards(parts.join(', '))

                // Get Character & Vibe Data (활성화된 이미지만 필터링)
                // Ensure base64 data is loaded from files before generation
                await useCharacterStore.getState().ensureImagesLoaded()
                const latestCharStore = useCharacterStore.getState()
                const latestPromptStore = useCharacterPromptStore.getState()
                const latestSceneStore = useSceneStore.getState()
                const sequenceMode = !!sequenceEntry
                const sceneAddition = latestSceneStore.sceneCharacterAdditionsEnabled
                    ? latestSceneStore.sceneCharacterAdditions[activePresetId]?.[scene.id]
                    : null
                const uniqueIds = (ids: string[]) => Array.from(new Set(ids))
                const characterReferenceIds = sequenceMode
                    ? sequenceEntry.characterReferenceIds
                    : latestCharStore.characterImages.filter(img => img.enabled !== false).map(img => img.id)
                const vibeReferenceIds = sequenceMode
                    ? sequenceEntry.vibeReferenceIds
                    : latestCharStore.vibeImages.filter(img => img.enabled !== false).map(img => img.id)
                const characterPromptIds = sequenceMode
                    ? sequenceEntry.characterPromptIds
                    : latestPromptStore.characters.filter(character => character.enabled).map(character => character.id)
                const finalCharacterReferenceIds = uniqueIds([
                    ...characterReferenceIds,
                    ...(sceneAddition?.characterReferenceIds || []),
                ])
                const finalVibeReferenceIds = uniqueIds([
                    ...vibeReferenceIds,
                    ...(sceneAddition?.vibeReferenceIds || []),
                ])
                const finalCharacterPromptIds = uniqueIds([
                    ...characterPromptIds,
                    ...(sceneAddition?.characterPromptIds || []),
                ])
                const characterImages = latestCharStore.characterImages.filter(img => finalCharacterReferenceIds.includes(img.id) && img.base64)
                const vibeImages = latestCharStore.vibeImages.filter(img => finalVibeReferenceIds.includes(img.id) && img.base64)
                const characterPrompts = finalCharacterPromptIds.length > 0
                    ? latestPromptStore.characters
                        .filter(character => finalCharacterPromptIds.includes(character.id))
                        .map(character => ({
                            prompt: character.prompt,
                            negative: character.negative,
                            enabled: true,
                            position: character.position,
                        }))
                    : []

                // Apply fragment/wildcard substitution to character prompts (async)
                const processedCharacterPrompts = await Promise.all(
                    characterPrompts.filter(c => c.enabled).map(async c => ({
                        prompt: await processWildcards(c.prompt),
                        negative: await processWildcards(c.negative),
                        enabled: c.enabled,
                        position: c.position
                    }))
                )

                // Determine Seed (Randomize if not locked)
                // If seed is 0, treat it as "random seed" request
                let finalSeed = genState.seedLocked ? genState.seed : Math.floor(Math.random() * 4294967295)
                if (finalSeed === 0) {
                    finalSeed = Math.floor(Math.random() * 4294967295)
                }

                // Helper function to round to nearest multiple of 64 (NovelAI requirement)
                const roundTo64 = (value: number): number => Math.round(value / 64) * 64

                // For I2I and Inpainting, use source image dimensions instead of scene/global resolution
                let finalWidth = roundTo64(scene.width || genState.selectedResolution.width)
                let finalHeight = roundTo64(scene.height || genState.selectedResolution.height)

                if (genState.sourceImage) {
                    // Extract dimensions from base64 image
                    try {
                        const img = new Image()
                        await new Promise<void>((resolve, reject) => {
                            img.onload = () => resolve()
                            img.onerror = () => reject(new Error('Failed to load source image'))
                            img.src = genState.sourceImage!
                        })
                        // Round source image dimensions to multiples of 64
                        finalWidth = roundTo64(img.width)
                        finalHeight = roundTo64(img.height)
                        console.log(`[SceneGeneration] Using source image dimensions: ${img.width}x${img.height} → ${finalWidth}x${finalHeight}`)
                        // MEMORY: Clear image reference
                        img.src = ''
                    } catch (e) {
                        console.warn('[SceneGeneration] Failed to get source image dimensions, using scene/global resolution')
                    }
                }

                const params: GenerationParams = {
                    prompt: finalPrompt,
                    negative_prompt: removeComments(genState.negativePrompt),
                    steps: genState.steps,
                    cfg_scale: genState.cfgScale,
                    cfg_rescale: genState.cfgRescale,
                    sampler: genState.sampler,
                    scheduler: genState.scheduler,
                    smea: genState.smea,
                    smea_dyn: genState.smeaDyn,
                    variety: genState.variety ?? false,
                    seed: finalSeed,

                    width: finalWidth,
                    height: finalHeight,

                    model: genState.model,

                    // I2I / Inpainting parameters
                    sourceImage: genState.sourceImage || undefined,
                    strength: genState.strength,
                    noise: genState.noise,
                    mask: genState.mask || undefined,

                    // Precise Reference (캐릭터 참조) - filter out images without base64 loaded
                    charImages: characterImages.filter(img => img.base64).map(img => img.base64!),
                    charStrength: characterImages.filter(img => img.base64).map(img => img.strength),
                    charFidelity: characterImages.filter(img => img.base64).map(img => img.fidelity ?? 0.6),
                    charReferenceType: characterImages.filter(img => img.base64).map(img => img.referenceType ?? 'character&style'),
                    charCacheKeys: characterImages.filter(img => img.base64).map(img => img.cacheKey || null),

                    // Vibe Transfer - filter out images without base64 loaded
                    vibeImages: vibeImages.filter(img => img.base64).map(img => img.base64!),
                    vibeInfo: vibeImages.filter(img => img.base64).map(img => img.informationExtracted),
                    vibeStrength: vibeImages.filter(img => img.base64).map(img => img.strength),
                    preEncodedVibes: vibeImages.filter(img => img.base64).map(img => img.encodedVibe || null),

                    // Character Prompts - already processed with fragment substitution
                    characterPrompts: processedCharacterPrompts,

                    // Image format from settings
                    imageFormat: useSettingsStore.getState().imageFormat,
                }

                let result

                const streamMimeType = params.imageFormat === 'webp' ? 'image/webp' : 'image/png'
                if (streamingView) {
                    // Streaming Generation - real-time preview updates
                    result = await generateImageStream(token, params, (progress, image) => {
                        if (image) {
                            setStreamingData(scene.id, `data:${streamMimeType};base64,${image}`, progress / 100)
                        } else {
                            // Progress-only update
                            setStreamingData(scene.id, null, progress / 100)
                        }
                    })
                } else {
                    // Normal Generation
                    result = await generateImage(token, params)
                }

                // NOTE: Removed isGenerating check here - it causes a race condition.
                // When queueCount changes to 0, useEffect re-runs and sets isGenerating=false
                // before the current generation finishes saving.

                if (result.success && result.imageData) {
                    // Get preset name for folder structure
                    const currentPreset = useSceneStore.getState().presets.find(p => p.id === activePresetId)
                    const safePresetName = (currentPreset?.name || 'Default').replace(/[<>:"/\\|?*]/g, '_').trim()
                    // Sanitize scene name for folder name
                    const safeSceneName = scene.name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled_Scene'
                    const { imageFormat } = useSettingsStore.getState()
                    const fileExt = imageFormat === 'webp' ? 'webp' : 'png'
                    const mimeType = imageFormat === 'webp' ? 'image/webp' : 'image/png'
                    const fileName = `NAIS_SCENE_${Date.now()}.${fileExt}`

                    try {
                        const base64Data = result.imageData.replace(/^data:image\/(png|webp);base64,/, '')
                        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

                        const { useAbsolutePath } = useSettingsStore.getState()
                        let fullPath: string

                        if (useAbsolutePath && savePath) {
                            // Save to absolute path: savePath/NAIS_Scene/presetName/sceneName/
                            const naisSceneDir = await join(savePath, 'NAIS_Scene')
                            const presetDir = await join(naisSceneDir, safePresetName)
                            const sceneDir = await join(presetDir, safeSceneName)

                            if (!(await exists(naisSceneDir))) {
                                await mkdir(naisSceneDir, { recursive: true })
                            }
                            if (!(await exists(presetDir))) {
                                await mkdir(presetDir, { recursive: true })
                            }
                            if (!(await exists(sceneDir))) {
                                await mkdir(sceneDir, { recursive: true })
                            }

                            fullPath = await join(sceneDir, fileName)
                            await writeFile(fullPath, binaryData)
                        } else {
                            // Save to Pictures/NAIS_Scene/presetName/sceneName/
                            const baseDir = await pictureDir()
                            const presetSceneDir = `NAIS_Scene/${safePresetName}/${safeSceneName}`

                            const naisSceneDir = 'NAIS_Scene'
                            if (!(await exists(naisSceneDir, { baseDir: BaseDirectory.Picture }))) {
                                await mkdir(naisSceneDir, { baseDir: BaseDirectory.Picture })
                            }

                            const presetDirPath = `NAIS_Scene/${safePresetName}`
                            if (!(await exists(presetDirPath, { baseDir: BaseDirectory.Picture }))) {
                                await mkdir(presetDirPath, { baseDir: BaseDirectory.Picture })
                            }

                            if (!(await exists(presetSceneDir, { baseDir: BaseDirectory.Picture }))) {
                                await mkdir(presetSceneDir, { baseDir: BaseDirectory.Picture })
                            }

                            await writeFile(`${presetSceneDir}/${fileName}`, binaryData, { baseDir: BaseDirectory.Picture })
                            fullPath = await join(baseDir, presetSceneDir, fileName)
                        }

                        // Notify HistoryPanel immediately (file path only — no base64 needed,
                        // HistoryPanel uses convertFileSrc for file-based images)
                        window.dispatchEvent(new CustomEvent('newImageGenerated', {
                            detail: { path: fullPath }
                        }))

                        addImageToScene(activePresetId, scene.id, fullPath)

                        // Add to Global History (with proper thumbnail, not full image)
                        const thumbnailData = result.imageData 
                            ? await createThumbnail(`data:${mimeType};base64,${result.imageData}`)
                            : undefined
                        useGenerationStore.getState().addToHistory({
                            id: Date.now().toString(),
                            url: fullPath,
                            thumbnail: thumbnailData,
                            prompt: finalPrompt,
                            seed: params.seed,
                            timestamp: new Date()
                        })

                        // Cache newly encoded vibes to character store for future use (shows lightning icon)
                        if (result.encodedVibes && result.encodedVibes.length > 0) {
                            const { vibeImages, updateVibeImage } = useCharacterStore.getState()
                            let encodedIndex = 0
                            // Match encoded vibes to images that didn't have encoded data
                            for (let vi = 0; vi < vibeImages.length && encodedIndex < result.encodedVibes.length; vi++) {
                                // Only update vibes that weren't pre-encoded
                                if (!vibeImages[vi].encodedVibe) {
                                    updateVibeImage(vibeImages[vi].id, { encodedVibe: result.encodedVibes[encodedIndex] })
                                    encodedIndex++
                                }
                            }
                        }

                    } catch (saveError) {
                        console.error('Failed to save scene image file:', saveError)
                        // DON'T add base64 image to store - it will exceed localStorage quota
                        // Just show error and continue
                        toast({ title: t('common.saveFailed', '파일 저장 실패'), description: String(saveError), variant: 'destructive' })
                    }

                    // Refresh Anlas balance after each image
                    useAuthStore.getState().refreshAnlas()

                    // Update progress counter
                    const currentState = useSceneStore.getState()
                    setGenerationProgress(currentState.completedCount + 1, currentState.totalQueuedCount)

                } else {
                    console.error('Generation failed:', result.error)
                    toast({ title: t('common.error', '오류'), description: result.error || 'Generation failed', variant: 'destructive' })
                    // Don't stop on single failure, continue queue
                }

                // Reset Streaming Data
                setStreamingData(null, null, 0)

                // Check if there are more scenes to process AND session is still valid
                const sceneState = useSceneStore.getState()
                const sessionStillValid = sessionId === sceneState.generationSessionId
                const hasMoreScenes = sessionStillValid && 
                    sceneState.isGenerating &&
                    sceneState.getHasMoreSceneGeneration(activePresetId)

                // Apply generation delay only if there are more scenes
                if (hasMoreScenes) {
                    const { generationDelay } = useSettingsStore.getState()
                    if (generationDelay > 0) {
                        await new Promise(resolve => setTimeout(resolve, generationDelay))
                    }
                }

                // CRITICAL: Release processing lock AFTER delay
                isProcessing = false

                // Continue Queue - only if still generating AND same session
                const latestState = useSceneStore.getState()
                if (latestState.isGenerating && sessionId === latestState.generationSessionId) {
                    processQueue(sessionId)
                }

            } catch (e) {
                console.error('Process queue error:', e)
                isProcessing = false
                setStreamingData(null, null, 0)

                // Check if session is still valid before retrying
                const latestState = useSceneStore.getState()
                if (sessionId !== latestState.generationSessionId) {
                    return  // Session invalidated, don't retry
                }

                // Check if it's a 429 error and retry after delay
                const errorMessage = String(e)
                if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('too many requests')) {
                    console.log('429 error detected, retrying after 3 seconds...')
                    await new Promise(resolve => setTimeout(resolve, 3000))
                    const retryState = useSceneStore.getState()
                    if (retryState.isGenerating && sessionId === retryState.generationSessionId) {
                        processQueue(sessionId)
                    }
                } else {
                    toast({ title: t('common.error', '오류'), description: errorMessage, variant: 'destructive' })
                    setIsGenerating(false)
                }
            }
        }

        if (isGenerating && !isProcessing) {
            // Initialize progress tracking when generation starts
            if (completedCount === 0 && totalQueuedCount === 0) {
                initGenerationProgress()
            }
            // Pass current session ID to processQueue
            processQueue(generationSessionId)
        }
    }, [isGenerating, activePresetId, token, savePath, t, addImageToScene, getNextCharacterSequenceScene, getHasMoreSceneGeneration, setIsGenerating, streamingView, setStreamingData, initGenerationProgress, setGenerationProgress, completedCount, totalQueuedCount, generationSessionId])

    // Reset processing when generation stops
    useEffect(() => {
        if (!isGenerating) {
            isProcessing = false
        }
    }, [isGenerating])

    return {
        isGenerating
    }
}
