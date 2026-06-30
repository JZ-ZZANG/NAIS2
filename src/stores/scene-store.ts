import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import { rename, exists} from '@tauri-apps/plugin-fs'
import { pictureDir, join } from '@tauri-apps/api/path'
import { useSettingsStore } from './settings-store'

export interface SceneImage {
    id: string
    url: string  // data:image/png;base64,... format
    timestamp: number
    isFavorite: boolean
}

export interface SceneCard {
    id: string
    name: string
    scenePrompt: string
    queueCount: number  // Number of images to generate
    images: SceneImage[]  // Generated images for this scene
    width?: number
    height?: number
    createdAt: number
}

export interface ScenePreset {
    id: string
    name: string
    scenes: SceneCard[]
    createdAt: number
}

export interface SceneCharacterSequenceEntry {
    id: string
    name: string
    characterPromptIds: string[]
    characterReferenceIds: string[]
    vibeReferenceIds: string[]
    enabled: boolean
}

export interface SceneCharacterSequenceQueueItem {
    sceneId: string
    entryId: string
}

export interface SceneCharacterAddition {
    characterPromptIds: string[]
    characterReferenceIds: string[]
    vibeReferenceIds: string[]
}

type SceneGenerationSource = 'queue' | 'detail'

interface SceneState {
    presets: ScenePreset[]
    activePresetId: string | null

    // Actions - Presets
    addPreset: (name: string) => void
    deletePreset: (id: string) => void
    renamePreset: (id: string, name: string) => void
    reorderPresets: (oldIndex: number, newIndex: number) => void
    setActivePreset: (id: string) => void
    getActivePreset: () => ScenePreset | undefined

    // Actions - Scenes
    addScene: (presetId: string, name?: string) => void
    deleteScene: (presetId: string, sceneId: string) => void
    duplicateScene: (presetId: string, sceneId: string) => void
    renameScene: (presetId: string, sceneId: string, name: string) => Promise<void>
    updateScenePrompt: (presetId: string, sceneId: string, prompt: string) => void
    updateSceneSettings: (presetId: string, sceneId: string, settings: { width?: number, height?: number }) => void
    updateAllScenesResolution: (presetId: string, width: number, height: number) => void
    reorderScenes: (presetId: string, scenes: SceneCard[]) => void
    getScene: (presetId: string, sceneId: string) => SceneCard | undefined

    // Actions - Queue
    setQueueCount: (presetId: string, sceneId: string, count: number) => void
    incrementQueue: (presetId: string, sceneId: string, count?: number) => void
    decrementQueue: (presetId: string, sceneId: string) => void
    addAllToQueue: (presetId: string, count?: number) => void
    clearAllQueue: (presetId: string) => void
    getTotalQueueCount: (presetId: string) => number
    getQueuedScenes: (presetId: string) => SceneCard[]

    // Actions - Images
    addImageToScene: (presetId: string, sceneId: string, imageUrl: string) => void
    toggleFavorite: (presetId: string, sceneId: string, imageId: string) => void
    deleteImage: (presetId: string, sceneId: string, imageId: string) => void
    deleteNonFavoriteImages: (presetId: string, sceneId: string) => { count: number; paths: string[] }
    clearAllFavorites: (presetId: string, sceneId: string) => number
    deleteAllImages: (presetId: string, sceneId: string) => { count: number; paths: string[] }
    getSceneThumbnail: (scene: SceneCard) => string | undefined

    // Actions - Generation
    decrementFirstQueuedScene: (presetId: string) => SceneCard | null
    getNextCharacterSequenceScene: (presetId: string) => { scene: SceneCard; entry: SceneCharacterSequenceEntry | null } | null
    getHasMoreSceneGeneration: (presetId: string) => boolean

    // Character/Reference Sequence
    characterSequenceEnabled: boolean
    characterSequenceEntries: SceneCharacterSequenceEntry[]
    characterSequenceQueue: SceneCharacterSequenceQueueItem[]
    activeCharacterSequenceEntryId: string | null
    setCharacterSequenceEnabled: (enabled: boolean) => void
    addCharacterSequenceEntry: (entry?: Partial<SceneCharacterSequenceEntry>) => void
    updateCharacterSequenceEntry: (id: string, updates: Partial<SceneCharacterSequenceEntry>) => void
    deleteCharacterSequenceEntry: (id: string) => void
    clearCharacterSequenceEntries: () => void
    reorderCharacterSequenceEntries: (oldIndex: number, newIndex: number) => void
    getActiveCharacterSequenceEntry: () => SceneCharacterSequenceEntry | null

    // Scene-specific Character/Reference Additions
    sceneCharacterAdditionsEnabled: boolean
    sceneCharacterAdditions: Record<string, Record<string, SceneCharacterAddition>>
    setSceneCharacterAdditionsEnabled: (enabled: boolean) => void
    getSceneCharacterAddition: (presetId: string, sceneId: string) => SceneCharacterAddition | null
    updateSceneCharacterAddition: (presetId: string, sceneId: string, addition: SceneCharacterAddition) => void
    clearSceneCharacterAddition: (presetId: string, sceneId: string) => void

    // Generation Status
    isGenerating: boolean
    isCancelling: boolean  // True when cancel requested but API call still in progress
    setIsGenerating: (isGenerating: boolean) => void
    cancelSceneGeneration: () => void  // Request cancel (keeps button locked until API completes)
    generationSessionId: number  // Incremented on each new generation session to invalidate old ones
    generationSource: SceneGenerationSource
    startNewGenerationSession: (source?: SceneGenerationSource) => number  // Returns new session ID

    // Streaming State
    streamingSceneId: string | null
    streamingImage: string | null
    streamingProgress: number
    setStreamingData: (sceneId: string | null, image: string | null, progress: number) => void
    
    // Memory cleanup - call when leaving scene mode to release streaming data
    clearRuntimeData: () => void

    // History Refresh Trigger
    historyRefreshTrigger: number
    triggerHistoryRefresh: () => void

    // File Management
    importPreset: (preset: ScenePreset) => void
    validateSceneImages: (presetId: string, sceneId: string, validImageIds: string[]) => void

    // Multi-Select / Edit Mode
    isEditMode: boolean
    selectedSceneIds: string[]
    setEditMode: (isEdit: boolean) => void
    toggleSceneSelection: (sceneId: string, clearOthers?: boolean) => void
    selectSceneRange: (fromId: string, toId: string) => void
    selectAllScenes: () => void
    clearSelection: () => void
    deleteSelectedScenes: () => void
    moveSelectedScenesToPreset: (targetPresetId: string) => void
    updateSelectedScenesResolution: (width: number, height: number) => void
    lastSelectedSceneId: string | null
    setLastSelectedSceneId: (id: string | null) => void

    // Generation Progress
    completedCount: number
    totalQueuedCount: number
    setGenerationProgress: (completed: number, total: number) => void
    initGenerationProgress: () => void

    // Grid Layout
    gridColumns: number
    setGridColumns: (columns: number) => void
    thumbnailLayout: 'vertical' | 'horizontal'
    setThumbnailLayout: (layout: 'vertical' | 'horizontal') => void

    // Scroll Position (for returning from detail page)
    scrollPosition: number
    setScrollPosition: (position: number) => void
}

const DEFAULT_PRESET_ID = 'scene-default'

const createDefaultPreset = (): ScenePreset => ({
    id: DEFAULT_PRESET_ID,
    name: '기본',
    scenes: [],
    createdAt: Date.now(),
})

export const useSceneStore = create<SceneState>()(
    persist(
        (set, get) => ({
            presets: [createDefaultPreset()],
            activePresetId: DEFAULT_PRESET_ID,

            // Preset Actions
            addPreset: (name) => {
                const newPreset: ScenePreset = {
                    id: Date.now().toString(),
                    name,
                    scenes: [],
                    createdAt: Date.now(),
                }
                set(state => ({
                    presets: [...state.presets, newPreset],
                    activePresetId: newPreset.id,
                }))
            },

            deletePreset: (id) => {
                if (id === DEFAULT_PRESET_ID) return
                const wasActive = get().activePresetId === id
                set(state => ({
                    presets: state.presets.filter(p => p.id !== id),
                    activePresetId: wasActive ? DEFAULT_PRESET_ID : state.activePresetId,
                }))
            },

            renamePreset: (id, name) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === id ? { ...p, name } : p
                    ),
                }))
            },

            reorderPresets: (oldIndex, newIndex) => {
                set(state => {
                    const newPresets = [...state.presets]
                    const [removed] = newPresets.splice(oldIndex, 1)
                    newPresets.splice(newIndex, 0, removed)
                    return { presets: newPresets }
                })
            },

            setActivePreset: (id) => set({ activePresetId: id }),

            getActivePreset: () => {
                return get().presets.find(p => p.id === get().activePresetId)
            },

            // Scene Actions
            addScene: (presetId, name) => {
                set(state => ({
                    presets: state.presets.map(p => {
                        if (p.id !== presetId) return p
                        const newScene: SceneCard = {
                            id: Date.now().toString(),
                            name: name || `씬 ${p.scenes.length + 1}`,
                            scenePrompt: '',
                            queueCount: 0,
                            images: [],
                            createdAt: Date.now(),
                        }
                        return { ...p, scenes: [...p.scenes, newScene] }
                    }),
                }))
            },

            deleteScene: (presetId, sceneId) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? { ...p, scenes: p.scenes.filter(s => s.id !== sceneId) }
                            : p
                    ),
                }))
            },

            duplicateScene: (presetId, sceneId) => {
                set(state => ({
                    presets: state.presets.map(p => {
                        if (p.id !== presetId) return p
                        const scene = p.scenes.find(s => s.id === sceneId)
                        if (!scene) return p
                        const duplicated: SceneCard = {
                            ...scene,
                            id: Date.now().toString(),
                            name: `${scene.name} (복사본)`,
                            queueCount: 0,
                            images: [],
                            createdAt: Date.now(),
                        }
                        const index = p.scenes.findIndex(s => s.id === sceneId)
                        const newScenes = [...p.scenes]
                        newScenes.splice(index + 1, 0, duplicated)
                        return { ...p, scenes: newScenes }
                    }),
                }))
            },

            renameScene: async (presetId, sceneId, name) => {
                const state = get()
                const preset = state.presets.find(p => p.id === presetId)
                const scene = preset?.scenes.find(s => s.id === sceneId)
                
                if (!scene || scene.name === name) return
                
                const oldName = scene.name
                const safeOldName = oldName.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled_Scene'
                const safeNewName = name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled_Scene'
                const safePresetName = (preset?.name || 'Default').replace(/[<>:"/\\|?*]/g, '_').trim()
                
                // Try to rename the folder
                try {
                    const { savePath, useAbsolutePath } = useSettingsStore.getState()
                    let oldFolderPath: string
                    let newFolderPath: string
                    
                    if (useAbsolutePath && savePath) {
                        oldFolderPath = await join(savePath, 'NAIS_Scene', safePresetName, safeOldName)
                        newFolderPath = await join(savePath, 'NAIS_Scene', safePresetName, safeNewName)
                    } else {
                        const baseDir = await pictureDir()
                        oldFolderPath = await join(baseDir, 'NAIS_Scene', safePresetName, safeOldName)
                        newFolderPath = await join(baseDir, 'NAIS_Scene', safePresetName, safeNewName)
                    }
                    
                    // Only rename if old folder exists and new folder doesn't
                    if (await exists(oldFolderPath) && !(await exists(newFolderPath))) {
                        await rename(oldFolderPath, newFolderPath)
                        
                        // Update image paths in scene
                        set(state => ({
                            presets: state.presets.map(p =>
                                p.id === presetId
                                    ? {
                                        ...p,
                                        scenes: p.scenes.map(s =>
                                            s.id === sceneId 
                                                ? { 
                                                    ...s, 
                                                    name,
                                                    images: s.images.map(img => ({
                                                        ...img,
                                                        url: img.url.replace(oldFolderPath, newFolderPath)
                                                    }))
                                                } 
                                                : s
                                        ),
                                    }
                                    : p
                            ),
                        }))
                        return
                    }
                } catch (e) {
                    console.warn('Failed to rename scene folder:', e)
                }
                
                // Fallback: just update the name without folder rename
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId ? { ...s, name } : s
                                ),
                            }
                            : p
                    ),
                }))
            },

            updateScenePrompt: (presetId, sceneId, prompt) => set((state) => ({
                presets: state.presets.map((preset) =>
                    preset.id === presetId
                        ? {
                            ...preset,
                            scenes: preset.scenes.map((scene) =>
                                scene.id === sceneId ? { ...scene, scenePrompt: prompt } : scene
                            ),
                        }
                        : preset
                ),
            })),
            updateSceneSettings: (presetId, sceneId, settings) => set((state) => ({
                presets: state.presets.map((preset) =>
                    preset.id === presetId
                        ? {
                            ...preset,
                            scenes: preset.scenes.map((scene) =>
                                scene.id === sceneId ? { ...scene, ...settings } : scene
                            ),
                        }
                        : preset
                ),
            })),
            updateAllScenesResolution: (presetId, width, height) => set((state) => ({
                presets: state.presets.map((preset) =>
                    preset.id === presetId
                        ? {
                            ...preset,
                            scenes: preset.scenes.map((scene) => ({
                                ...scene,
                                width,
                                height
                            })),
                        }
                        : preset
                ),
            })),
            reorderScenes: (presetId, scenes) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId ? { ...p, scenes } : p
                    ),
                }))
            },

            getScene: (presetId, sceneId) => {
                const preset = get().presets.find(p => p.id === presetId)
                return preset?.scenes.find(s => s.id === sceneId)
            },

            // Queue Actions
            setQueueCount: (presetId, sceneId, count) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId ? { ...s, queueCount: Math.max(0, count) } : s
                                ),
                            }
                            : p
                    ),
                }))
            },

            incrementQueue: (presetId, sceneId, count = 1) => {
                const preset = get().presets.find(p => p.id === presetId)
                const scene = preset?.scenes.find(s => s.id === sceneId)
                if (scene) {
                    get().setQueueCount(presetId, sceneId, scene.queueCount + count)
                }
            },

            decrementQueue: (presetId, sceneId) => {
                const preset = get().presets.find(p => p.id === presetId)
                const scene = preset?.scenes.find(s => s.id === sceneId)
                if (scene && scene.queueCount > 0) {
                    get().setQueueCount(presetId, sceneId, scene.queueCount - 1)
                }
            },

            addAllToQueue: (presetId, count = 1) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s => ({ ...s, queueCount: s.queueCount + count })),
                            }
                            : p
                    ),
                }))
            },

            clearAllQueue: (presetId) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s => ({ ...s, queueCount: 0 })),
                            }
                            : p
                    ),
                }))
            },

            getTotalQueueCount: (presetId) => {
                const preset = get().presets.find(p => p.id === presetId)
                return preset?.scenes.reduce((sum, s) => sum + s.queueCount, 0) || 0
            },

            getQueuedScenes: (presetId) => {
                const preset = get().presets.find(p => p.id === presetId)
                return preset?.scenes.filter(s => s.queueCount > 0) || []
            },

            // Image Actions
            addImageToScene: (presetId, sceneId, imageUrl) => {
                const newImage: SceneImage = {
                    id: Date.now().toString(),
                    url: imageUrl,
                    timestamp: Date.now(),
                    isFavorite: false,
                }
                
                // MEMORY OPTIMIZATION: Increased limit for heavy users (was 100)
                const MAX_IMAGES_PER_SCENE = 2000
                
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s => {
                                    if (s.id !== sceneId) return s
                                    
                                    // Add new image at the beginning (newest first)
                                    let updatedImages = [newImage, ...s.images]
                                    
                                    // If over limit, remove oldest non-favorites
                                    if (updatedImages.length > MAX_IMAGES_PER_SCENE) {
                                        // Sort by timestamp descending to keep newest
                                        // Favorites are preserved separately
                                        const favorites = updatedImages.filter(img => img.isFavorite)
                                        const nonFavorites = updatedImages
                                            .filter(img => !img.isFavorite)
                                            .sort((a, b) => b.timestamp - a.timestamp)
                                        
                                        // Keep all favorites + newest non-favorites up to limit
                                        const keepCount = Math.max(0, MAX_IMAGES_PER_SCENE - favorites.length)
                                        // Merge back and sort by timestamp to maintain display order
                                        updatedImages = [...favorites, ...nonFavorites.slice(0, keepCount)]
                                            .sort((a, b) => b.timestamp - a.timestamp)
                                        
                                        console.warn(`[SceneStore] Scene ${s.name}: Trimmed to ${updatedImages.length} images (limit: ${MAX_IMAGES_PER_SCENE})`)
                                    }
                                    
                                    return { ...s, images: updatedImages }
                                }),
                            }
                            : p
                    ),
                }))
                // NOTE: Removed triggerHistoryRefresh() here.
                // HistoryPanel now uses instant event-based updates (newImageGenerated),
                // so triggering a full directory rescan per image is no longer needed.
            },

            toggleFavorite: (presetId, sceneId, imageId) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId
                                        ? {
                                            ...s,
                                            images: s.images.map(img =>
                                                img.id === imageId
                                                    ? { ...img, isFavorite: !img.isFavorite }
                                                    : img
                                            ),
                                        }
                                        : s
                                ),
                            }
                            : p
                    ),
                }))
            },

            deleteImage: (presetId, sceneId, imageId) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId
                                        ? { ...s, images: s.images.filter(img => img.id !== imageId) }
                                        : s
                                ),
                            }
                            : p
                    ),
                }))
            },

            deleteNonFavoriteImages: (presetId, sceneId) => {
                const preset = get().presets.find(p => p.id === presetId)
                const scene = preset?.scenes.find(s => s.id === sceneId)
                if (!scene) return { count: 0, paths: [] }
                
                const nonFavorites = scene.images.filter(img => !img.isFavorite)
                const nonFavoriteCount = nonFavorites.length
                // Collect file paths (non-base64 URLs) for deletion
                const filePaths = nonFavorites
                    .map(img => img.url)
                    .filter(url => !url.startsWith('data:'))
                
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId
                                        ? { ...s, images: s.images.filter(img => img.isFavorite) }
                                        : s
                                ),
                            }
                            : p
                    ),
                }))
                
                return { count: nonFavoriteCount, paths: filePaths }
            },

            clearAllFavorites: (presetId, sceneId) => {
                const preset = get().presets.find(p => p.id === presetId)
                const scene = preset?.scenes.find(s => s.id === sceneId)
                if (!scene) return 0
                
                const favoriteCount = scene.images.filter(img => img.isFavorite).length
                
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId
                                        ? {
                                            ...s,
                                            images: s.images.map(img => ({ ...img, isFavorite: false })),
                                        }
                                        : s
                                ),
                            }
                            : p
                    ),
                }))
                
                return favoriteCount
            },

            deleteAllImages: (presetId, sceneId) => {
                const preset = get().presets.find(p => p.id === presetId)
                const scene = preset?.scenes.find(s => s.id === sceneId)
                if (!scene) return { count: 0, paths: [] }
                
                const totalCount = scene.images.length
                const filePaths = scene.images
                    .map(img => img.url)
                    .filter(url => !url.startsWith('data:'))
                
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId
                                        ? { ...s, images: [] }
                                        : s
                                ),
                            }
                            : p
                    ),
                }))
                
                return { count: totalCount, paths: filePaths }
            },

            getSceneThumbnail: (scene) => {
                // Priority: favorite > newest
                const favorite = scene.images.find(img => img.isFavorite)
                if (favorite) return favorite.url
                if (scene.images.length > 0) return scene.images[0].url
                return undefined
            },

            // Generation Actions
            decrementFirstQueuedScene: (presetId) => {
                const preset = get().presets.find(p => p.id === presetId)
                if (!preset) return null

                const queuedScene = preset.scenes.find(s => s.queueCount > 0)
                if (!queuedScene) return null

                get().setQueueCount(presetId, queuedScene.id, queuedScene.queueCount - 1)
                return queuedScene
            },

            getNextCharacterSequenceScene: (presetId) => {
                const state = get()
                const preset = state.presets.find(p => p.id === presetId)
                if (!preset) return null

                const enabledEntries = state.characterSequenceEntries.filter(e => e.enabled)
                if (state.generationSource === 'detail' || !state.characterSequenceEnabled || enabledEntries.length === 0) {
                    const scene = state.decrementFirstQueuedScene(presetId)
                    set({ activeCharacterSequenceEntryId: null })
                    return scene ? { scene, entry: null } : null
                }

                let queue = state.characterSequenceQueue
                if (queue.length === 0) {
                    const queuedScenes = preset.scenes.filter(s => s.queueCount > 0)
                    if (queuedScenes.length === 0) {
                        set({ activeCharacterSequenceEntryId: null })
                        return null
                    }

                    queue = enabledEntries.flatMap(entry =>
                        queuedScenes.flatMap(scene =>
                            Array.from({ length: scene.queueCount }, () => ({
                                sceneId: scene.id,
                                entryId: entry.id,
                            }))
                        )
                    )

                    set(state => ({
                        characterSequenceQueue: queue,
                        presets: state.presets.map(p =>
                            p.id === presetId
                                ? { ...p, scenes: p.scenes.map(s => ({ ...s, queueCount: 0 })) }
                                : p
                        ),
                    }))
                }

                const [next, ...rest] = queue
                if (!next) {
                    set({ activeCharacterSequenceEntryId: null })
                    return null
                }

                const scene = preset.scenes.find(s => s.id === next.sceneId)
                const entry = enabledEntries.find(e => e.id === next.entryId) || null
                set({
                    characterSequenceQueue: rest,
                    activeCharacterSequenceEntryId: entry?.id ?? null,
                })

                return scene ? { scene, entry } : get().getNextCharacterSequenceScene(presetId)
            },

            getHasMoreSceneGeneration: (presetId) => {
                const state = get()
                if (state.generationSource !== 'detail' && state.characterSequenceEnabled && state.characterSequenceEntries.some(e => e.enabled)) {
                    return state.characterSequenceQueue.length > 0 || state.getQueuedScenes(presetId).length > 0
                }
                return state.getQueuedScenes(presetId).length > 0
            },

            // Character/Reference Sequence
            characterSequenceEnabled: false,
            characterSequenceEntries: [],
            characterSequenceQueue: [],
            activeCharacterSequenceEntryId: null,
            setCharacterSequenceEnabled: (enabled) => set({
                characterSequenceEnabled: enabled,
                characterSequenceQueue: [],
                activeCharacterSequenceEntryId: null,
            }),
            addCharacterSequenceEntry: (entry) => set(state => ({
                characterSequenceEntries: [
                    ...state.characterSequenceEntries,
                    {
                        id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
                        name: entry?.name || `Queue Repeat ${state.characterSequenceEntries.length + 1}`,
                        characterPromptIds: entry?.characterPromptIds || [],
                        characterReferenceIds: entry?.characterReferenceIds || [],
                        vibeReferenceIds: entry?.vibeReferenceIds || [],
                        enabled: entry?.enabled ?? true,
                    },
                ],
            })),
            updateCharacterSequenceEntry: (id, updates) => set(state => ({
                characterSequenceEntries: state.characterSequenceEntries.map(entry =>
                    entry.id === id ? { ...entry, ...updates } : entry
                ),
                characterSequenceQueue: [],
            })),
            deleteCharacterSequenceEntry: (id) => set(state => ({
                characterSequenceEntries: state.characterSequenceEntries.filter(entry => entry.id !== id),
                characterSequenceQueue: state.characterSequenceQueue.filter(item => item.entryId !== id),
                activeCharacterSequenceEntryId: state.activeCharacterSequenceEntryId === id ? null : state.activeCharacterSequenceEntryId,
            })),
            clearCharacterSequenceEntries: () => set({
                characterSequenceEntries: [],
                characterSequenceQueue: [],
                activeCharacterSequenceEntryId: null,
            }),
            reorderCharacterSequenceEntries: (oldIndex, newIndex) => set(state => {
                const entries = [...state.characterSequenceEntries]
                const [removed] = entries.splice(oldIndex, 1)
                entries.splice(newIndex, 0, removed)
                return { characterSequenceEntries: entries, characterSequenceQueue: [] }
            }),
            getActiveCharacterSequenceEntry: () => {
                const state = get()
                if (!state.characterSequenceEnabled || !state.activeCharacterSequenceEntryId) return null
                return state.characterSequenceEntries.find(e => e.id === state.activeCharacterSequenceEntryId) || null
            },

            // Scene-specific Character/Reference Additions
            sceneCharacterAdditionsEnabled: false,
            sceneCharacterAdditions: {},
            setSceneCharacterAdditionsEnabled: (enabled) => set({ sceneCharacterAdditionsEnabled: enabled }),
            getSceneCharacterAddition: (presetId, sceneId) => {
                const addition = get().sceneCharacterAdditions[presetId]?.[sceneId]
                if (!addition) return null
                const hasAny = addition.characterPromptIds.length > 0
                    || addition.characterReferenceIds.length > 0
                    || addition.vibeReferenceIds.length > 0
                return hasAny ? addition : null
            },
            updateSceneCharacterAddition: (presetId, sceneId, addition) => set(state => ({
                sceneCharacterAdditions: {
                    ...state.sceneCharacterAdditions,
                    [presetId]: {
                        ...(state.sceneCharacterAdditions[presetId] || {}),
                        [sceneId]: addition,
                    },
                },
            })),
            clearSceneCharacterAddition: (presetId, sceneId) => set(state => {
                const presetAdditions = { ...(state.sceneCharacterAdditions[presetId] || {}) }
                delete presetAdditions[sceneId]
                return {
                    sceneCharacterAdditions: {
                        ...state.sceneCharacterAdditions,
                        [presetId]: presetAdditions,
                    },
                }
            }),

            isGenerating: false,
            isCancelling: false,
            setIsGenerating: (isGenerating) => {
                // When stopping generation, increment session ID to invalidate any in-progress operations
                if (!isGenerating) {
                    set({ isGenerating: false, isCancelling: false, generationSessionId: Date.now(), generationSource: 'queue', characterSequenceQueue: [], activeCharacterSequenceEntryId: null })
                } else {
                    set({ isGenerating: true, isCancelling: false })
                }
            },
            cancelSceneGeneration: () => {
                // Request cancel but keep isGenerating=true until API completes
                // This prevents 429 errors from rapid cancel/restart
                set({ isCancelling: true, generationSessionId: Date.now(), generationSource: 'queue', characterSequenceQueue: [], activeCharacterSequenceEntryId: null })
            },
            generationSessionId: 0,
            generationSource: 'queue',
            startNewGenerationSession: (source = 'queue') => {
                const newSessionId = Date.now()
                set({ generationSessionId: newSessionId, generationSource: source, isGenerating: true, isCancelling: false, characterSequenceQueue: [], activeCharacterSequenceEntryId: null })
                return newSessionId
            },

            streamingSceneId: null,
            streamingImage: null,
            streamingProgress: 0,
            setStreamingData: (sceneId, image, progress) => {
                const currentSceneId = get().streamingSceneId
                // If sceneId changed, reset image to prevent showing previous scene's image
                if (sceneId !== currentSceneId) {
                    set({
                        streamingSceneId: sceneId,
                        streamingImage: image,
                        streamingProgress: progress
                    })
                } else {
                    // Same scene - if image is null, keep existing (progress-only update)
                    set({
                        streamingSceneId: sceneId,
                        streamingImage: image ?? get().streamingImage,
                        streamingProgress: progress
                    })
                }
            },

            // Memory cleanup - release streaming data when leaving scene mode
            // This prevents OOM when switching between modes (Issue #6)
            clearRuntimeData: () => {
                console.log('[SceneStore] Clearing runtime data to free memory')
                set({
                    streamingSceneId: null,
                    streamingImage: null,
                    streamingProgress: 0
                })
            },

            // History Refresh Trigger
            historyRefreshTrigger: 0,
            triggerHistoryRefresh: () => set(state => ({ historyRefreshTrigger: state.historyRefreshTrigger + 1 })),

            // File Management Actions
            importPreset: (jsonContent: any) => {
                set(state => {
                    let newName = "Imported Preset"
                    let newScenes: SceneCard[] = []

                    // 1. Detect Format

                    // Case A: Legacy Array Format (scene_preset_export.json)
                    if (Array.isArray(jsonContent)) {
                        newName = `Legacy Import ${new Date().toLocaleDateString()}`
                        newScenes = jsonContent.map((item: any) => ({
                            id: crypto.randomUUID(),
                            name: item.scene_name || "Untitled Scene",
                            scenePrompt: item.scene_prompt || "",
                            queueCount: 0,
                            images: [], // Legacy images not imported automatically
                            createdAt: Date.now()
                        }))
                    }
                    // Case B: Interaction Share Format (상호작용공유용.json) - New Logic
                    else if (jsonContent.scenes && !Array.isArray(jsonContent.scenes) && typeof jsonContent.scenes === 'object') {
                        newName = jsonContent.name || "Interaction Share"
                        const sceneMap = jsonContent.scenes

                        // Helper to generate prompt combinations
                        const generatePrompts = (slots: any[][]): string[] => {
                            if (slots.length === 0) return [""]

                            const firstSlot = slots[0] || []
                            // enabled 필드가 없으면 기본적으로 활성화된 것으로 간주
                            const enabledItems = firstSlot.filter((item: any) => item.enabled !== false)
                            const remainingPrompts = generatePrompts(slots.slice(1))

                            if (enabledItems.length === 0) return remainingPrompts

                            const results: string[] = []
                            for (const item of enabledItems) {
                                for (const nextPrompt of remainingPrompts) {
                                    const current = item.prompt || ""
                                    // simple join
                                    const combined = nextPrompt ? `${current}, ${nextPrompt}` : current
                                    results.push(combined)
                                }
                            }
                            return results
                        }

                        Object.values(sceneMap).forEach((sceneData: any) => {
                            if (sceneData.slots && Array.isArray(sceneData.slots)) {
                                const combinations = generatePrompts(sceneData.slots)
                                combinations.forEach((fullPrompt, index) => {
                                    // If there are multiple variations, append index to name
                                    const suffix = combinations.length > 1 ? `_${index + 1}` : ""

                                    newScenes.push({
                                        id: crypto.randomUUID(),
                                        name: (sceneData.name || "Untitled") + suffix,
                                        scenePrompt: fullPrompt,
                                        queueCount: 0,
                                        images: [],
                                        createdAt: Date.now()
                                    })
                                })
                            }
                        })
                    }
                    // Case C: SDImageGenEasy Presets (Fallback if 'scenes' object missing but has presets)
                    else if (jsonContent.presets && jsonContent.presets.SDImageGenEasy) {
                        // ... (Existing logic for SDImageGenEasy if needed, or remove if B covers it)
                        // Keeping it as fallback for files that might only have presets
                        newName = jsonContent.name || "Interaction Share (Presets)"
                        const presets = jsonContent.presets.SDImageGenEasy
                        if (Array.isArray(presets)) {
                            newScenes = presets.map((item: any) => {
                                const promptParts = []
                                if (item.frontPrompt) promptParts.push(item.frontPrompt)
                                if (item.backPrompt) promptParts.push(item.backPrompt)
                                return {
                                    id: crypto.randomUUID(),
                                    name: item.name || "Untitled",
                                    scenePrompt: promptParts.join(", "),
                                    queueCount: 0,
                                    images: [],
                                    createdAt: Date.now()
                                }
                            })
                        }
                    }
                    // Case D: Standard ScenePreset Format (NAIS2)
                    else if (jsonContent.scenes && Array.isArray(jsonContent.scenes)) {
                        newName = jsonContent.name || "Use Preset"
                        newScenes = jsonContent.scenes.map((s: any) => ({
                            ...s,
                            id: s.id || crypto.randomUUID(), // Ensure ID exists
                            images: s.images || []
                        }))
                        // If importing a full preset object, try to preserve its ID if unique, otherwise gen new
                        if (jsonContent.id && !state.presets.some(p => p.id === jsonContent.id)) {
                            // ID is unique, use it? No, safer to always generate new ID for imported stuff to avoid conflicts later
                        }
                    } else {
                        console.error("Unknown preset format", jsonContent)
                        return state // No change
                    }

                    if (newScenes.length === 0) {
                        console.warn("No scenes found in import")
                        return state
                    }

                    // Create the new preset
                    const newPreset: ScenePreset = {
                        id: Date.now().toString(), // Generate new ID
                        name: newName,
                        scenes: newScenes,
                        createdAt: Date.now()
                    }

                    // Check for name collision
                    let nameSuffix = 1
                    while (state.presets.some(p => p.name === newPreset.name)) {
                        newPreset.name = `${newName} (${nameSuffix++})`
                    }

                    return {
                        presets: [...state.presets, newPreset],
                        activePresetId: newPreset.id // Switch to imported preset
                    }
                })
            },

            exportPreset: () => {
                // Implementation moved to UI component (SceneMode.tsx) for file saving
            },

            validateSceneImages: (presetId, sceneId, validImageIds) => {
                set(state => ({
                    presets: state.presets.map(p =>
                        p.id === presetId
                            ? {
                                ...p,
                                scenes: p.scenes.map(s =>
                                    s.id === sceneId
                                        ? { ...s, images: s.images.filter(img => validImageIds.includes(img.id)) }
                                        : s
                                )
                            }
                            : p
                    )
                }))
            },

            // Multi-Select / Edit Mode Implementation
            isEditMode: false,
            selectedSceneIds: [],
            lastSelectedSceneId: null,

            setEditMode: (isEdit) => set({
                isEditMode: isEdit,
                selectedSceneIds: isEdit ? [] : [],
                lastSelectedSceneId: null
            }),

            toggleSceneSelection: (sceneId, clearOthers = true) => set(state => {
                const isSelected = state.selectedSceneIds.includes(sceneId)
                let newSelection: string[]

                if (clearOthers) {
                    // Single click - toggle single selection
                    newSelection = isSelected ? [] : [sceneId]
                } else {
                    // Ctrl+click - toggle in multi-select
                    newSelection = isSelected
                        ? state.selectedSceneIds.filter(id => id !== sceneId)
                        : [...state.selectedSceneIds, sceneId]
                }

                return {
                    selectedSceneIds: newSelection,
                    lastSelectedSceneId: sceneId
                }
            }),

            selectSceneRange: (fromId, toId) => set(state => {
                const preset = state.presets.find(p => p.id === state.activePresetId)
                if (!preset) return state

                const fromIndex = preset.scenes.findIndex(s => s.id === fromId)
                const toIndex = preset.scenes.findIndex(s => s.id === toId)

                if (fromIndex === -1 || toIndex === -1) return state

                const start = Math.min(fromIndex, toIndex)
                const end = Math.max(fromIndex, toIndex)

                const rangeIds = preset.scenes.slice(start, end + 1).map(s => s.id)

                // Merge with existing selection
                const newSelection = [...new Set([...state.selectedSceneIds, ...rangeIds])]

                return {
                    selectedSceneIds: newSelection,
                    lastSelectedSceneId: toId
                }
            }),

            selectAllScenes: () => set(state => {
                const preset = state.presets.find(p => p.id === state.activePresetId)
                if (!preset) return state
                return { selectedSceneIds: preset.scenes.map(s => s.id) }
            }),

            clearSelection: () => set({ selectedSceneIds: [], lastSelectedSceneId: null }),

            setLastSelectedSceneId: (id) => set({ lastSelectedSceneId: id }),

            deleteSelectedScenes: () => set(state => {
                const preset = state.presets.find(p => p.id === state.activePresetId)
                if (!preset) return state

                return {
                    presets: state.presets.map(p =>
                        p.id === state.activePresetId
                            ? { ...p, scenes: p.scenes.filter(s => !state.selectedSceneIds.includes(s.id)) }
                            : p
                    ),
                    selectedSceneIds: [],
                    lastSelectedSceneId: null
                }
            }),

            moveSelectedScenesToPreset: (targetPresetId) => set(state => {
                const sourcePreset = state.presets.find(p => p.id === state.activePresetId)
                if (!sourcePreset || targetPresetId === state.activePresetId) return state

                const scenesToMove = sourcePreset.scenes.filter(s => state.selectedSceneIds.includes(s.id))
                if (scenesToMove.length === 0) return state

                return {
                    presets: state.presets.map(p => {
                        if (p.id === state.activePresetId) {
                            // Remove from source
                            return { ...p, scenes: p.scenes.filter(s => !state.selectedSceneIds.includes(s.id)) }
                        }
                        if (p.id === targetPresetId) {
                            // Add to target
                            return { ...p, scenes: [...p.scenes, ...scenesToMove] }
                        }
                        return p
                    }),
                    selectedSceneIds: [],
                    lastSelectedSceneId: null
                }
            }),

            updateSelectedScenesResolution: (width, height) => set(state => ({
                presets: state.presets.map(p =>
                    p.id === state.activePresetId
                        ? {
                            ...p,
                            scenes: p.scenes.map(s =>
                                state.selectedSceneIds.includes(s.id)
                                    ? { ...s, width, height }
                                    : s
                            )
                        }
                        : p
                )
            })),

            // Generation Progress Implementation
            completedCount: 0,
            totalQueuedCount: 0,

            setGenerationProgress: (completed, total) => set({
                completedCount: completed,
                totalQueuedCount: total
            }),

            initGenerationProgress: () => set(state => {
                const queuedTotal = state.activePresetId ? state.presets.find(p => p.id === state.activePresetId)?.scenes.reduce((sum, s) => sum + s.queueCount, 0) || 0 : 0
                const sequenceMultiplier = state.generationSource !== 'detail' && state.characterSequenceEnabled
                    ? Math.max(1, state.characterSequenceEntries.filter(e => e.enabled).length)
                    : 1
                const total = queuedTotal * sequenceMultiplier
                return {
                    completedCount: 0,
                    totalQueuedCount: total
                }
            }),

            // Grid Layout
            gridColumns: 4,
            setGridColumns: (columns) => set({ gridColumns: columns }),
            thumbnailLayout: 'vertical' as const,
            setThumbnailLayout: (layout) => set({ thumbnailLayout: layout }),

            // Scroll Position
            scrollPosition: 0,
            setScrollPosition: (position) => set({ scrollPosition: position }),
        }),
        {
            name: 'nais2-scenes',
            storage: createJSONStorage(() => indexedDBStorage),
            partialize: (state) => {
                // Images are stored as file paths, not base64 - storage is minimal per entry
                const MAX_IMAGES_PERSIST = 2000

                return {
                    presets: state.presets.map(p => ({
                        ...p,
                        scenes: p.scenes.map(s => {
                            // Fast path: skip expensive sorting if under limit
                            if (s.images.length <= MAX_IMAGES_PERSIST) {
                                return { ...s, queueCount: 0 }
                            }
                            // Over limit: keep favorites + newest non-favorites
                            const favorites = s.images.filter(img => img.isFavorite)
                            const nonFavorites = s.images
                                .filter(img => !img.isFavorite)
                                .sort((a, b) => b.timestamp - a.timestamp)
                            const keepCount = Math.max(0, MAX_IMAGES_PERSIST - favorites.length)
                            return {
                                ...s,
                                queueCount: 0,
                                images: [...favorites, ...nonFavorites.slice(0, keepCount)]
                                    .sort((a, b) => b.timestamp - a.timestamp)
                            }
                        })
                    })),
                    activePresetId: state.activePresetId,
                    characterSequenceEnabled: state.characterSequenceEnabled,
                    characterSequenceEntries: state.characterSequenceEntries,
                    sceneCharacterAdditionsEnabled: state.sceneCharacterAdditionsEnabled,
                    sceneCharacterAdditions: state.sceneCharacterAdditions,
                    gridColumns: state.gridColumns,
                    thumbnailLayout: state.thumbnailLayout,
                }
            },
            onRehydrateStorage: () => (state, error) => {
                if (error) {
                    console.error('[SceneStore] Hydration failed:', error)
                    return
                }
                
                if (state) {
                    // 복원 로그
                    const presetCount = state.presets?.length || 0
                    const totalScenes = state.presets?.reduce((sum, p) => sum + (p.scenes?.length || 0), 0) || 0
                    const totalImages = state.presets?.reduce((sum, p) => 
                        sum + p.scenes?.reduce((sSum, s) => sSum + (s.images?.length || 0), 0) || 0, 0) || 0
                    console.log(`[SceneStore] Hydrated: ${presetCount} presets, ${totalScenes} scenes, ${totalImages} images`)
                    
                    // MEMORY WARNING: Log if too many images
                    if (totalImages > 500) {
                        console.warn(`[SceneStore] Warning: ${totalImages} images loaded - consider clearing old images`)
                    }
                    
                    // 기본 프리셋 보장
                    if (!state.presets.find(p => p.id === DEFAULT_PRESET_ID)) {
                        console.log('[SceneStore] Adding default preset')
                        state.presets = [createDefaultPreset(), ...state.presets]
                    }
                    if (!state.activePresetId) {
                        state.activePresetId = DEFAULT_PRESET_ID
                    }
                    
                    // 씬 데이터 손실 경고
                    if (presetCount === 1 && totalScenes === 0) {
                        console.warn('[SceneStore] Warning: Only default preset with no scenes - possible data loss')
                    }
                }
            },
        }
    )
)
