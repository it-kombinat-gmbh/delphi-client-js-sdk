'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { useDelphiClientContext } from './context'
import { logger } from '../core/utils/sdkLogger'

function getCurrentSelectedText(): string {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        const start = activeElement.selectionStart
        const end = activeElement.selectionEnd
        if (start !== null && end !== null && start !== end) {
            return activeElement.value.slice(Math.min(start, end), Math.max(start, end)).trim()
        }
    }

    return window.getSelection()?.toString().trim() ?? ''
}

/**
 * Tracks text selection on the page and exposes a handler to send the
 * selected text as a "read aloud" request to the AI.
 *
 * Requires a `<DelphiClientProvider>` in the tree.
 *
 * @param sendReadAloud - Callback to send selected text (e.g. from `useDelphiSession().sendReadAloud`).
 * @param channelConnected - Whether the underlying session WS is connected.
 * @param forceEnable - When `true`, ignore the in-call check (use for pure TTS sessions).
 *
 * @example
 * ```tsx
 * const { session, sendReadAloud, connected } = useDelphiSession({
 *   endpointId: 'ext-100',
 *   mode: 'audio_playback',
 * })
 * const { selectedText, handleReadAloudSelected, showReadAloudFab } =
 *   useSelectionTracking({ sendReadAloud, channelConnected: connected, forceEnable: true })
 * ```
 */
export function useSelectionTracking({
    sendReadAloud,
    channelConnected,
    forceEnable = false,
}: {
    sendReadAloud: (text: string) => void
    channelConnected: boolean
    forceEnable?: boolean
}) {
    const client = useDelphiClientContext()
    const subscribe = useCallback((cb: () => void) => client.subscribe(cb), [client])
    const getSnapshot = useCallback(() => client.getState(), [client])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const inCall = state.voiceCall.inCall
    const { selectedText } = state

    const isEnabled = forceEnable || (inCall && channelConnected)

    // Track document text selection → update client state
    useEffect(() => {
        if (!isEnabled) {
            logger.info('[SelectionTracking] Disabled', {
                inCall,
                channelConnected,
                forceEnable,
            })
            client.setSelectedText('')
            return
        }

        logger.info('[SelectionTracking] Enabled', {
            inCall,
            channelConnected,
            forceEnable,
        })

        const expandSelectionToSentence = () => {
            const sel = window.getSelection()
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return

            const originalRange = sel.getRangeAt(0)
            let container = originalRange.commonAncestorContainer
            while (container && container.nodeType !== Node.ELEMENT_NODE) {
                container = container.parentNode!
            }
            const element = container as HTMLElement
            if (!element) return

            const textNodes: { node: Node; start: number; end: number }[] = []
            let totalLength = 0
            let fullText = ''

            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
            let currentNode = walker.nextNode()
            while (currentNode) {
                const text = currentNode.nodeValue || ''
                textNodes.push({
                    node: currentNode,
                    start: totalLength,
                    end: totalLength + text.length,
                })
                fullText += text
                totalLength += text.length
                currentNode = walker.nextNode()
            }

            if (totalLength === 0) return

            let absStart = -1
            let absEnd = -1

            for (const info of textNodes) {
                if (info.node === originalRange.startContainer) {
                    absStart = info.start + originalRange.startOffset
                }
                if (info.node === originalRange.endContainer) {
                    absEnd = info.start + originalRange.endOffset
                }
            }

            if (absStart === -1 || absEnd === -1) return
            if (absStart > absEnd) {
                const temp = absStart
                absStart = absEnd
                absEnd = temp
            }

            let sentenceStart = 0
            let sentenceEnd = fullText.length

            const rxRev = /([.?!])(\s+)/g
            let matchRev
            while ((matchRev = rxRev.exec(fullText)) !== null) {
                const matchEndIndex = matchRev.index + matchRev[0].length
                if (matchEndIndex <= absStart) {
                    sentenceStart = matchEndIndex
                } else {
                    break
                }
            }

            const rxFwd = /([.?!])(\s+|$)/g
            rxFwd.lastIndex = sentenceStart
            let matchFwd
            let found = false
            while ((matchFwd = rxFwd.exec(fullText)) !== null) {
                if (matchFwd.index + 1 >= absEnd) {
                    sentenceEnd = matchFwd.index + 1
                    found = true
                    break
                }
            }
            if (!found) sentenceEnd = fullText.length

            if (sentenceStart === absStart && sentenceEnd === absEnd) return

            let startContainer: Node | null = null
            let startOffset = 0
            let endContainer: Node | null = null
            let endOffset = 0

            for (const info of textNodes) {
                if (sentenceStart >= info.start && sentenceStart < info.end) {
                    startContainer = info.node
                    startOffset = sentenceStart - info.start
                } else if (sentenceStart === info.end) {
                    startContainer = info.node
                    startOffset = info.end - info.start
                }

                if (sentenceEnd > info.start && sentenceEnd <= info.end) {
                    endContainer = info.node
                    endOffset = sentenceEnd - info.start
                } else if (sentenceEnd === info.start) {
                    endContainer = info.node
                    endOffset = 0
                }
            }

            if (!startContainer && textNodes.length > 0) {
                startContainer = textNodes[0]!.node
                startOffset = 0
            }
            if (!endContainer && textNodes.length > 0) {
                const lastNode = textNodes[textNodes.length - 1]!
                endContainer = lastNode.node
                endOffset = lastNode.end - lastNode.start
            }

            if (startContainer && endContainer) {
                const newRange = document.createRange()
                newRange.setStart(startContainer, startOffset)
                newRange.setEnd(endContainer, endOffset)
                sel.removeAllRanges()
                sel.addRange(newRange)
            }
        }

        const handleSelectionChange = (source: string) => {
            const text = getCurrentSelectedText()
            const previousText = client.getState().selectedText
            if (text && text !== previousText) {
                logger.info('[SelectionTracking] Captured selected text', {
                    source,
                    textLength: text.length,
                    preview: text.slice(0, 120),
                })
            } else if (!text && previousText) {
                logger.info('[SelectionTracking] Cleared selected text', { source })
            }
            client.setSelectedText(text)
        }

        const handleMouseUp = () => {
            expandSelectionToSentence()
            handleSelectionChange('mouseup')
        }

        const handleDocumentSelectionChange = () => handleSelectionChange('selectionchange')
        const handleSelect = () => handleSelectionChange('select')
        const handleKeyUp = () => handleSelectionChange('keyup')

        document.addEventListener('selectionchange', handleDocumentSelectionChange)
        document.addEventListener('select', handleSelect, true)
        document.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('keyup', handleKeyUp)

        return () => {
            document.removeEventListener('selectionchange', handleDocumentSelectionChange)
            document.removeEventListener('select', handleSelect, true)
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('keyup', handleKeyUp)
        }
    }, [channelConnected, client, forceEnable, inCall, isEnabled])

    const handleReadAloudSelected = useCallback(() => {
        if (selectedText && isEnabled) {
            sendReadAloud(selectedText)
            window.getSelection()?.removeAllRanges()
            client.setSelectedText('')
        }
    }, [selectedText, isEnabled, sendReadAloud, client])

    return {
        selectedText,
        handleReadAloudSelected,
        showReadAloudFab: selectedText.length > 0 && isEnabled,
    }
}
