import { describe, expect, it } from 'vitest'
import { formatNativeChatImagePathNote } from '@/components/native-chat/native-chat-file-reference-display'
import { chatUserMessageParts } from './chat-user-message-parts'

describe('chatUserMessageParts', () => {
  it('lifts images, files and task references out of the bubble text', () => {
    const text = `Check @"/site/a b.scss" for AC#77\n\n${formatNativeChatImagePathNote('/tmp/shot.png')}`
    expect(chatUserMessageParts(text)).toMatchObject({
      images: ['/tmp/shot.png'],
      files: ['/site/a b.scss'],
      taskIds: [77]
    })
    expect(chatUserMessageParts(text).body).not.toMatch(/@|attached image|AC#77/)
  })

  it('leaves plain text alone', () => {
    expect(chatUserMessageParts('Fix the menu')).toEqual({
      typed: 'Fix the menu',
      images: [],
      files: [],
      taskIds: [],
      body: 'Fix the menu'
    })
  })
})
