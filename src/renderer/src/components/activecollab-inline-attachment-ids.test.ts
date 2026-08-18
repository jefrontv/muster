import { describe, expect, it } from 'vitest'
import {
  attachmentsNotInlinedInBody,
  inlineActiveCollabAttachmentIds
} from './activecollab-inline-attachment-ids'

describe('inlineActiveCollabAttachmentIds', () => {
  it('reads attachment ids from inline attachment images', () => {
    const html =
      '<p>before</p><img src="/x?intent=--PREVIEW-TOKEN--" image-type="attachment" object-id="249086" alt="shot.png">' +
      "<img object-id='7' image-type='attachment'>"
    expect([...inlineActiveCollabAttachmentIds(html)].sort((a, b) => a - b)).toEqual([7, 249086])
  })

  it('ignores non-attachment images and junk ids', () => {
    const html =
      '<img src="https://elsewhere.example/a.png">' +
      '<img image-type="avatar" object-id="4">' +
      '<img image-type="attachment" object-id="-2">' +
      '<img image-type="attachment">'
    expect(inlineActiveCollabAttachmentIds(html).size).toBe(0)
  })
})

describe('attachmentsNotInlinedInBody', () => {
  it('drops attachments the body already renders inline', () => {
    const attachments = [
      { id: 249086, name: 'shot.png' },
      { id: 3, name: 'spec.pdf' }
    ]
    expect(
      attachmentsNotInlinedInBody(
        attachments,
        '<img image-type="attachment" object-id="249086">'
      ).map((attachment) => attachment.id)
    ).toEqual([3])
  })

  it('keeps everything when nothing is inlined', () => {
    const attachments = [{ id: 1, name: 'a' }]
    expect(attachmentsNotInlinedInBody(attachments, '<p>plain</p>')).toEqual(attachments)
  })
})
