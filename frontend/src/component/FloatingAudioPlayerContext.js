import { createContext, useContext } from 'react'

export const FloatingAudioPlayerContext = createContext(null)

export function useFloatingAudioPlayer() {
  const context = useContext(FloatingAudioPlayerContext)

  if (!context) {
    throw new Error('useFloatingAudioPlayer 必须在 FloatingAudioPlayerProvider 内使用')
  }

  return context
}