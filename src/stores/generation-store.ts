import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import { useAuthStore } from './auth-store'
import { useSettingsStore } from './settings-store'
import { generateImage, generateImageStream } from '@/services/novelai-api'
import { writeFile, mkdir, exists, BaseDirectory } from '@tauri-apps/plugin-fs'
import { pictureDir, join } from '@tauri-apps/api/path'
import { useCharacterStore } from './character-store'
import { useCharacterPromptStore } from './character-prompt-store'
import { processWildcards } from '@/lib/fragment-processor'
import { createThumbnail } from '@/lib/image-utils'
import i18n from '@/i18n'
import { toast } from '@/components/ui/use-toast'

interface Resolution {
    label: string
    width: number
    height: number
}

interface HistoryItem {
    id: string
    url: string // Base64 or Blob URL
    thumbnail?: string
    prompt: string
    seed: number
    timestamp: Date
}

export const AVAILABLE_MODELS = [
    { id: 'nai-diffusion-4-5-curated', name: 'NAI Diffusion V4.5 Curated' },
    { id: 'nai-diffusion-4-5-full', name: 'NAI Diffusion V4.5 Full' },
    { id: 'nai-diffusion-4-curated-preview', name: 'NAI Diffusion V4 Curated' },
    { id: 'nai-diffusion-4-full', name: 'NAI Diffusion V4 Full' },
    { id: 'nai-diffusion-3', name: 'NAI Diffusion V3 (Anime)' },
    { id: 'nai-diffusion-furry-3', name: 'NAI Diffusion Furry V3' },
] as const

interface GenerationState {
    // Prompt fields
    basePrompt: string
    additionalPrompt: string
    detailPrompt: string
    negativePrompt: string
    inpaintingPrompt: string

    // Model selection
    model: string

    // Generation settings
    steps: number
    cfgScale: number
    cfgRescale: number
    sampler: string
    scheduler: string
    smea: boolean
    smeaDyn: boolean
    variety: boolean

    seed: number
    previewSeed: number | null
    seedLocked: boolean
    selectedResolution: Resolution

    // Quality settings
    qualityToggle: boolean
    ucPreset: number

    // Batch generation
    batchCount: number
    currentBatch: number

    // I2I & Inpainting
    sourceImage: string | null
    strength: number
    noise: number
    mask: string | null
    i2iMode: 'i2i' | 'inpaint' | null

    // Timing
    lastGenerationTime: number | null  // ms
    estimatedTime: number | null

    // State
    isGenerating: boolean // Deprecated in favor of generatingMode check? Or keep for local main mode state?
    generatingMode: 'main' | 'scene' | null
    isCancelled: boolean
    previewImage: string | null
    history: HistoryItem[]

    // AbortController for cancellation
    abortController: AbortController | null

    // Generation session ID (to handle race conditions on cancel/restart)
    generationSessionId: number

    // Streaming progress (0-100)
    streamProgress: number

    // Actions
    setBasePrompt: (prompt: string) => void
    setAdditionalPrompt: (prompt: string) => void
    setDetailPrompt: (prompt: string) => void
    setNegativePrompt: (prompt: string) => void
    setInpaintingPrompt: (prompt: string) => void

    setModel: (model: string) => void
    setSteps: (steps: number) => void
    setCfgScale: (v: number) => void
    setCfgRescale: (v: number) => void
    setSampler: (v: string) => void
    setScheduler: (v: string) => void
    setSmea: (v: boolean) => void
    setSmeaDyn: (v: boolean) => void
    setVariety: (v: boolean) => void

    setSeed: (seed: number) => void
    setPreviewSeed: (seed: number | null) => void
    setSeedLocked: (locked: boolean) => void
    setSelectedResolution: (resolution: Resolution) => void
    setQualityToggle: (v: boolean) => void
    setUcPreset: (v: number) => void

    setBatchCount: (count: number) => void

    // I2I Actions
    setSourceImage: (img: string | null) => void
    setReferenceImage: (img: string | null) => void
    setStrength: (v: number) => void
    setNoise: (v: number) => void
    setMask: (mask: string | null) => void
    setI2IMode: (mode: 'i2i' | 'inpaint' | null) => void
    resetI2IParams: () => void

    // Batch update for preset loading (avoids multiple IndexedDB writes)
    applyPreset: (preset: {
        basePrompt: string
        additionalPrompt: string
        detailPrompt: string
        negativePrompt: string
        model: string
        steps: number
        cfgScale: number
        cfgRescale: number
        sampler: string
        scheduler: string
        smea: boolean
        smeaDyn: boolean
        variety?: boolean
        qualityToggle?: boolean
        ucPreset?: number
        selectedResolution: Resolution
    }) => void

    generate: () => Promise<void>
    cancelGeneration: () => void
    addToHistory: (item: HistoryItem) => void
    clearHistory: () => void
    setPreviewImage: (url: string | null) => void
    setIsGenerating: (v: boolean) => void // Only for Main Mode use ideally
    setGeneratingMode: (mode: 'main' | 'scene' | null) => void
    setStreamProgress: (progress: number) => void
    
    // Memory cleanup - call when leaving main mode to release large Base64 data
    clearRuntimeData: () => void
}

export const useGenerationStore = create<GenerationState>()(
    persist(
        (set, get) => ({
            // Initial state
            basePrompt: '',
            additionalPrompt: '',
            detailPrompt: '',
            negativePrompt: '',
            inpaintingPrompt: '',

            model: 'nai-diffusion-4-5-full',

            steps: 28,
            cfgScale: 5.0,
            cfgRescale: 0.0,
            sampler: 'k_euler_ancestral',
            scheduler: 'karras',
            smea: true,
            smeaDyn: true,
            variety: false,

            seed: Math.floor(Math.random() * 4294967295),
            previewSeed: null,
            seedLocked: false,
            selectedResolution: { label: 'Portrait', width: 832, height: 1216 },

            qualityToggle: true,
            ucPreset: 0,

            batchCount: 1,
            currentBatch: 0,

            // I2I Init
            sourceImage: null,
            strength: 0.7,
            noise: 0.0,
            mask: null,
            i2iMode: null,

            lastGenerationTime: null,
            estimatedTime: null,

            isGenerating: false,
            generatingMode: null,
            isCancelled: false,
            previewImage: null,
            history: [],
            abortController: null,
            generationSessionId: 0,
            streamProgress: 0,

            // Actions
            setBasePrompt: (prompt) => set({ basePrompt: prompt }),
            setAdditionalPrompt: (prompt) => set({ additionalPrompt: prompt }),
            setDetailPrompt: (prompt) => set({ detailPrompt: prompt }),
            setNegativePrompt: (prompt) => set({ negativePrompt: prompt }),
            setInpaintingPrompt: (prompt) => set({ inpaintingPrompt: prompt }),

            setModel: (model) => set({ model }),
            setSteps: (steps) => set({ steps }),
            setCfgScale: (cfgScale) => set({ cfgScale }),
            setCfgRescale: (cfgRescale) => set({ cfgRescale }),
            setSampler: (sampler) => set({ sampler }),

            // Batch update - single IndexedDB write instead of 16 separate writes
            applyPreset: (preset) => set({
                basePrompt: preset.basePrompt,
                additionalPrompt: preset.additionalPrompt,
                detailPrompt: preset.detailPrompt,
                negativePrompt: preset.negativePrompt,
                model: preset.model,
                steps: preset.steps,
                cfgScale: preset.cfgScale,
                cfgRescale: preset.cfgRescale,
                sampler: preset.sampler,
                scheduler: preset.scheduler,
                smea: preset.smea,
                smeaDyn: preset.smeaDyn,
                variety: preset.variety ?? false,
                qualityToggle: preset.qualityToggle ?? true,
                ucPreset: preset.ucPreset ?? 0,
                selectedResolution: preset.selectedResolution,
            }),
            setScheduler: (scheduler) => set({ scheduler }),
            setSmea: (smea) => set({ smea }),
            setSmeaDyn: (smeaDyn) => set({ smeaDyn }),
            setVariety: (variety) => set({ variety }),

            setSeed: (seed) => set({ seed }),
            setPreviewSeed: (previewSeed) => set({ previewSeed }),
            setSeedLocked: (locked) => set({ seedLocked: locked }),
            setSelectedResolution: (resolution) => set({ selectedResolution: resolution }),
            setQualityToggle: (qualityToggle) => set({ qualityToggle }),
            setUcPreset: (ucPreset) => set({ ucPreset }),

            setBatchCount: (count) => set({ batchCount: count }),

            setSourceImage: (img) => set({ sourceImage: img }),
            setReferenceImage: (img) => set({ sourceImage: img }), // Alias for now
            setStrength: (v) => set({ strength: v }),
            setNoise: (v) => set({ noise: v }),
            setMask: (mask) => set({ mask }),
            setI2IMode: (mode) => set({ i2iMode: mode }),
            resetI2IParams: () => set({ sourceImage: null, mask: null, strength: 0.7, noise: 0.0, inpaintingPrompt: '', i2iMode: null }),

            // Memory cleanup - release large runtime data (previewImage, sourceImage, mask)
            // Call this when leaving main mode to prevent OOM
            clearRuntimeData: () => {
                console.log('[GenerationStore] Clearing runtime data to free memory')
                set({ 
                    previewImage: null, 
                    sourceImage: null, 
                    mask: null,
                    streamProgress: 0
                })
            },

            cancelGeneration: () => {
                const { abortController, seedLocked } = get()
                if (abortController) {
                    abortController.abort()
                }
                // Generate new seed if not locked (same as successful generation)
                const newSeed = seedLocked ? undefined : Math.floor(Math.random() * 4294967295)
                // Keep isGenerating=true until current request completes (prevents 429 errors)
                // The finally block in generate() will set isGenerating=false
                set({ 
                    isCancelled: true, 
                    // isGenerating stays true - button remains locked until API response arrives
                    currentBatch: 0,
                    ...(newSeed !== undefined && { seed: newSeed })
                })
                toast({
                    title: i18n.t('toast.generationCancelled.title'),
                    description: i18n.t('toast.generationCancelled.desc'),
                })
            },

            generate: async () => {
                const {
                    basePrompt, additionalPrompt, detailPrompt, negativePrompt, inpaintingPrompt,
                    model, steps, cfgScale, cfgRescale, sampler, scheduler, smea, smeaDyn, variety,
                    selectedResolution, batchCount, lastGenerationTime,
                    sourceImage, strength, noise, mask
                } = get()

                const token = useAuthStore.getState().token
                const isVerified = useAuthStore.getState().isVerified

                if (!token || !isVerified) {
                    toast({
                        title: i18n.t('toast.tokenRequired.title'),
                        description: i18n.t('toast.tokenRequired.desc'),
                        variant: 'destructive',
                    })
                    return
                }

                // Check for cross-mode conflict
                if (get().generatingMode === 'scene') {
                    toast({
                        title: i18n.t('common.error'),
                        description: i18n.t('generate.conflictScene', '씬 모드에서 생성 중입니다.'),
                        variant: 'destructive',
                    })
                    return
                }

                // Create new AbortController and session ID
                const abortController = new AbortController()
                const sessionId = Date.now()
                
                // MEMORY: Clear previous preview image before starting new generation
                // This helps GC reclaim the previous base64 data (~3-5MB per image)
                set({
                    isGenerating: true,
                    generatingMode: 'main',
                    isCancelled: false,
                    abortController,
                    generationSessionId: sessionId,
                    estimatedTime: lastGenerationTime ? lastGenerationTime * batchCount : null,
                    previewImage: null, // Clear previous preview to free memory
                    streamProgress: 0,  // Reset streaming progress
                })

                try {
                    for (let i = 0; i < batchCount; i++) {
                        // Check if cancelled or session changed (race condition protection)
                        if (get().isCancelled || get().generationSessionId !== sessionId) {
                            console.log('[Generate] Session invalidated, stopping batch loop')
                            break
                        }

                        set({ currentBatch: i + 1 })

                        const startTime = Date.now()
                        
                        // Helper to remove comment lines (lines starting with #)
                        const removeComments = (text: string) => text
                            .split('\n')
                            .filter(line => !line.trimStart().startsWith('#'))
                            .join('\n')
                        
                        let finalPrompt = [
                            removeComments(basePrompt),
                            removeComments(inpaintingPrompt),
                            removeComments(additionalPrompt),
                            removeComments(detailPrompt)
                        ].filter(Boolean).join(', ')

                        // Fragment Substitution - use processWildcards which handles <filename> syntax
                        // Wildcard Processing (handles both <filename> fragments and (a/b/c) random selection) - async
                        finalPrompt = await processWildcards(finalPrompt)

                        // Get current seed for this generation
                        // Use the current store seed, then immediately set next seed
                        let currentSeed = get().seed
                        if (currentSeed === 0) {
                            currentSeed = Math.floor(Math.random() * 4294967295)
                        }

                        // Immediately advance seed so UI shows next seed at generation start
                        if (!get().seedLocked) {
                            set({ seed: Math.floor(Math.random() * 4294967295) })
                        }

                        // Character & Vibe Data (활성화된 이미지만 필터링)
                        // Ensure base64 data is loaded from files before generation
                        await useCharacterStore.getState().ensureImagesLoaded()
                        const { characterImages: allCharImages, vibeImages: allVibeImages } = useCharacterStore.getState()
                        const characterImages = allCharImages.filter(img => img.enabled !== false && img.base64)
                        const vibeImages = allVibeImages.filter(img => img.enabled !== false && img.base64)

                        // Character Prompts (Position-based)
                        const { characters: characterPrompts, positionEnabled } = useCharacterPromptStore.getState()

                        // Apply fragment/wildcard substitution to character prompts (async)
                        const processedCharacterPrompts = await Promise.all(
                            characterPrompts.filter(c => c.enabled).map(async c => {
                                const processedPrompt = await processWildcards(c.prompt)
                                const processedNegative = await processWildcards(c.negative)
                                return {
                                    ...c,
                                    prompt: processedPrompt,
                                    negative: processedNegative
                                }
                            })
                        )

                        // Check if streaming is enabled and get image format
                        const { useStreaming, imageFormat } = useSettingsStore.getState()

                        // Helper function to round to nearest multiple of 64 (NovelAI requirement)
                        const roundTo64 = (value: number): number => Math.round(value / 64) * 64

                        // For I2I and Inpainting, use source image dimensions instead of global resolution
                        let finalWidth = roundTo64(selectedResolution.width)
                        let finalHeight = roundTo64(selectedResolution.height)

                        if (sourceImage) {
                            // Extract dimensions from base64 image
                            try {
                                const img = new Image()
                                await new Promise<void>((resolve, reject) => {
                                    img.onload = () => resolve()
                                    img.onerror = () => reject(new Error('Failed to load source image'))
                                    img.src = sourceImage
                                })
                                // Round source image dimensions to multiples of 64
                                finalWidth = roundTo64(img.width)
                                finalHeight = roundTo64(img.height)
                                console.log(`[Generate] Using source image dimensions: ${img.width}x${img.height} → ${finalWidth}x${finalHeight}`)
                                // MEMORY: Clear image reference
                                img.src = ''
                            } catch (e) {
                                console.warn('[Generate] Failed to get source image dimensions, using global resolution')
                            }
                        }

                        const generationParams = {
                            prompt: finalPrompt,
                            negative_prompt: removeComments(negativePrompt),
                            model,
                            width: finalWidth,
                            height: finalHeight,
                            steps,
                            cfg_scale: cfgScale,
                            cfg_rescale: cfgRescale,
                            sampler,
                            scheduler,
                            smea,
                            smea_dyn: smeaDyn,
                            variety,
                            seed: currentSeed,

                            // I2I & Inpainting
                            sourceImage: sourceImage || undefined,
                            strength,
                            noise,
                            mask: mask || undefined,

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

                            // Character Prompts (V4 char_captions with positions)
                            characterPrompts: processedCharacterPrompts,
                            characterPositionEnabled: positionEnabled,

                            // Image format (PNG or WebP)
                            imageFormat,

                            // NAI UI options (Quality Tags & UC Preset)
                            qualityToggle: get().qualityToggle,
                            ucPreset: get().ucPreset,

                            // Original prompt parts (pre-merge). Embedded into the image
                            // as nais2-params so re-importing restores each section instead
                            // of dumping everything into basePrompt.
                            promptParts: {
                                base: basePrompt,
                                additional: additionalPrompt,
                                detail: detailPrompt,
                                negative: negativePrompt,
                                inpainting: inpaintingPrompt,
                            },
                        }

                        // Reset progress
                        set({ streamProgress: 0 })

                        // Use streaming or non-streaming based on settings
                        // Streaming API supports I2I/Inpainting (same ImageGenerationRequest schema)
                        const canUseStreaming = useStreaming

                        let result
                        const streamMimeType = imageFormat === 'webp' ? 'image/webp' : 'image/png'
                        if (canUseStreaming) {
                            console.log('[Generate] Using streaming API...')
                            result = await generateImageStream(token, generationParams, (progress, partialImage) => {
                                // Update preview image directly (no null clearing - causes flicker)
                                if (partialImage) {
                                    set({ streamProgress: progress, previewImage: `data:${streamMimeType};base64,${partialImage}` })
                                } else {
                                    set({ streamProgress: progress })
                                }
                            })
                            set({ streamProgress: 0 })
                        } else {
                            console.log('[Generate] Using standard API...')
                            result = await generateImage(token, generationParams)
                        }

                        // Check if cancelled or session changed after API call
                        if (get().isCancelled || get().generationSessionId !== sessionId) {
                            console.log('[Generate] Session invalidated after API call, discarding result')
                            break
                        }

                        const generationTime = Date.now() - startTime
                        set({ lastGenerationTime: generationTime })

                        if (result.success && result.imageData) {
                            const mimeType = imageFormat === 'webp' ? 'image/webp' : 'image/png'
                            const imageUrl = `data:${mimeType};base64,${result.imageData}`
                            set({ previewImage: imageUrl })

                            // Cache newly encoded vibes back to character store for reuse
                            if (result.encodedVibes && result.encodedVibes.length > 0) {
                                const { vibeImages, updateVibeImage } = useCharacterStore.getState()
                                let encodedIndex = 0
                                for (let vi = 0; vi < vibeImages.length && encodedIndex < result.encodedVibes.length; vi++) {
                                    // Only update vibes that didn't have encoding before
                                    if (!vibeImages[vi].encodedVibe) {
                                        updateVibeImage(vibeImages[vi].id, { encodedVibe: result.encodedVibes[encodedIndex] })
                                        encodedIndex++
                                    }
                                }
                            }

                            // Create thumbnail for history (reduces memory from ~3MB to ~20KB per image)
                            const thumbnail = await createThumbnail(imageUrl)

                            const historyItem: HistoryItem = {
                                id: Date.now().toString(),
                                url: thumbnail, // Store thumbnail instead of full image
                                prompt: finalPrompt,
                                seed: currentSeed,
                                timestamp: new Date(),
                            }

                            // Save Image: Try Tauri FS first, fallback to browser
                            const { savePath, autoSave, useAbsolutePath } = useSettingsStore.getState()

                            if (autoSave) {
                                try {
                                    const binaryString = atob(result.imageData)
                                    const bytes = new Uint8Array(binaryString.length)
                                    for (let j = 0; j < binaryString.length; j++) {
                                        bytes[j] = binaryString.charCodeAt(j)
                                    }

                                    // Determine generation type prefix
                                    let typePrefix = ''
                                    if (mask) {
                                        typePrefix = 'INPAINT_'
                                    } else if (sourceImage) {
                                        typePrefix = 'I2I_'
                                    }
                                    const fileExt = imageFormat === 'webp' ? 'webp' : 'png'
                                    const fileName = `NAIS_${typePrefix}${Date.now()}.${fileExt}`
                                    const outputDir = savePath || 'NAIS_Output'

                                    let fullPath: string

                                    if (useAbsolutePath) {
                                        // Save to absolute path directly
                                        const dirExists = await exists(outputDir)
                                        if (!dirExists) {
                                            await mkdir(outputDir, { recursive: true })
                                        }
                                        fullPath = await join(outputDir, fileName)
                                        await writeFile(fullPath, bytes)
                                    } else {
                                        // Save relative to Pictures directory
                                        const dirExists = await exists(outputDir, { baseDir: BaseDirectory.Picture })
                                        if (!dirExists) {
                                            await mkdir(outputDir, { baseDir: BaseDirectory.Picture })
                                        }
                                        await writeFile(`${outputDir}/${fileName}`, bytes, { baseDir: BaseDirectory.Picture })
                                        const picPath = await pictureDir()
                                        fullPath = await join(picPath, outputDir, fileName)
                                    }

                                    // Notify HistoryPanel (file path only — HistoryPanel uses
                                    // convertFileSrc for file-based images, no base64 needed)
                                    try {
                                        window.dispatchEvent(new CustomEvent('newImageGenerated', {
                                            detail: { path: fullPath }
                                        }))
                                    } catch (e) {
                                        console.warn('Failed to dispatch newImageGenerated event:', e)
                                    }
                                } catch (e) {
                                    console.warn('Tauri FS save failed, using download fallback:', e)
                                    const link = document.createElement('a')
                                    link.href = imageUrl
                                    const fallbackExt = imageFormat === 'webp' ? 'webp' : 'png'
                                    link.download = `NAIS_${Date.now()}.${fallbackExt}`
                                    document.body.appendChild(link)
                                    link.click()
                                    document.body.removeChild(link)
                                }
                            } else {
                                // Auto-save is OFF: Still notify HistoryPanel with memory-based path
                                // This allows viewing the generated image in history without saving to disk
                                try {
                                    const memExt = imageFormat === 'webp' ? 'webp' : 'png'
                                    const memoryPath = `memory://NAIS_${Date.now()}.${memExt}`
                                    window.dispatchEvent(new CustomEvent('newImageGenerated', {
                                        detail: { path: memoryPath, data: imageUrl }
                                    }))
                                } catch (e) {
                                    console.warn('Failed to dispatch newImageGenerated event:', e)
                                }
                            }

                            set(state => ({
                                history: [historyItem, ...state.history].slice(0, 20)
                            }))

                            // Refresh Anlas balance
                            useAuthStore.getState().refreshAnlas()

                            // Seed already advanced at generation start

                            // Apply generation delay between batches (not after the last one)
                            const { generationDelay } = useSettingsStore.getState()
                            if (i < batchCount - 1 && generationDelay > 0) {
                                await new Promise(resolve => setTimeout(resolve, generationDelay))
                            }
                        } else {
                            toast({
                                title: i18n.t('toast.generationFailed.title'),
                                description: result.error || i18n.t('toast.unknownError'),
                                variant: 'destructive',
                            })
                            break
                        }
                    }

                    // Show completion toast for batch
                    if (!get().isCancelled && batchCount > 1) {
                        toast({
                            title: i18n.t('toast.batchComplete.title'),
                            description: i18n.t('toast.batchComplete.desc', { count: batchCount }),
                            variant: 'success',
                        })
                    }

                } catch (error) {
                    if (get().isCancelled) {
                        return
                    }
                    console.error('Generation failed:', error)
                    toast({
                        title: i18n.t('toast.errorOccurred.title'),
                        description: i18n.t('toast.errorOccurred.desc'),
                        variant: 'destructive',
                    })
                } finally {
                    set({ isGenerating: false, generatingMode: null, currentBatch: 0, abortController: null })
                    // Release character/vibe base64 from memory after generation (~30-60MB)
                    // They will be reloaded from files on next generation
                    useCharacterStore.getState().releaseImageData()
                }
            },

            addToHistory: (item) => set(state => ({
                history: [item, ...state.history].slice(0, 20)
            })),

            clearHistory: () => set({ history: [] }),

            setPreviewImage: (url) => set({ previewImage: url }),
            setIsGenerating: (v) => set({ isGenerating: v, generatingMode: v ? 'main' : null }),
            setGeneratingMode: (mode) => set({ generatingMode: mode }),
            setStreamProgress: (progress) => set({ streamProgress: progress }),
        }),
        {
            name: 'nais2-generation',
            storage: createJSONStorage(() => indexedDBStorage),
            partialize: (state) => ({
                // Prompts
                basePrompt: state.basePrompt,
                additionalPrompt: state.additionalPrompt,
                detailPrompt: state.detailPrompt,
                negativePrompt: state.negativePrompt,
                // Model & Parameters
                model: state.model,
                steps: state.steps,
                cfgScale: state.cfgScale,
                cfgRescale: state.cfgRescale,
                sampler: state.sampler,
                scheduler: state.scheduler,
                smea: state.smea,
                smeaDyn: state.smeaDyn,
                variety: state.variety,
                qualityToggle: state.qualityToggle,
                ucPreset: state.ucPreset,
                // Seed - only save if locked
                ...(state.seedLocked ? { seed: state.seed } : {}),
                seedLocked: state.seedLocked,
                selectedResolution: state.selectedResolution,
                // Batch
                batchCount: state.batchCount,
                // Timing (for estimated time)
                lastGenerationTime: state.lastGenerationTime,
                // I2I & Inpainting state - DO NOT persist sourceImage/mask (large Base64 data, 1MB+ each)
                // Only persist lightweight settings
                i2iMode: state.i2iMode,
                strength: state.strength,
                noise: state.noise,
                inpaintingPrompt: state.inpaintingPrompt,
                // History - limit to 20 items to prevent memory issues
                history: state.history.slice(0, 20),
            }),
            onRehydrateStorage: () => (state, error) => {
                if (error) {
                    console.error('[GenerationStore] Hydration failed:', error)
                    return
                }
                // Trim history to 20 items on load to prevent OOM
                if (state && state.history && state.history.length > 20) {
                    console.log(`[GenerationStore] Trimming history from ${state.history.length} to 20 items`)
                    state.history = state.history.slice(0, 20)
                }
                if (state) {
                    console.log('[GenerationStore] Hydrated successfully')
                }
            },
        }
    )
)
