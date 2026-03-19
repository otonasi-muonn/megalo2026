import type { Size2D, StageGimmick, StageGimmickKind } from '@shared/types'
import { FAN_DEFAULT_SIZE } from './stageEditorConstants'
import type { AlphaMask } from './useKAPLAY.types'

export const toCanvasX = (stageX: number, stageWidth: number, canvasWidth: number): number =>
  (stageX / stageWidth) * canvasWidth

export const toCanvasY = (stageY: number, stageHeight: number, canvasHeight: number): number =>
  (stageY / stageHeight) * canvasHeight

export const getGimmickSize = (gimmick: StageGimmick): Size2D =>
  'size' in gimmick && gimmick.size ? gimmick.size : FAN_DEFAULT_SIZE

export const toItemKind = (kind: StageGimmickKind): string | null => {
  switch (kind) {
    case 'spring':
      return 'bane'
    case 'wall':
      return 'block'
    case 'fan':
      return 'souhuuki'
    case 'spike':
      return 'toge'
    default:
      return null
  }
}

export const buildAlphaMask = (img: HTMLImageElement): AlphaMask => {
  const offscreen = document.createElement('canvas')
  offscreen.width = img.naturalWidth
  offscreen.height = img.naturalHeight
  const ctx = offscreen.getContext('2d')
  if (!ctx) {
    return { data: new Uint8Array(0), width: 0, height: 0 }
  }

  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
  const alpha = new Uint8Array(img.naturalWidth * img.naturalHeight)
  for (let i = 0; i < alpha.length; i += 1) {
    alpha[i] = imageData.data[i * 4 + 3]
  }
  return { data: alpha, width: img.naturalWidth, height: img.naturalHeight }
}

export const pixelCollision = (
  mask1: AlphaMask,
  pos1x: number,
  pos1y: number,
  size1w: number,
  size1h: number,
  mask2: AlphaMask,
  pos2x: number,
  pos2y: number,
  size2w: number,
  size2h: number,
): boolean => {
  const ix = Math.max(pos1x, pos2x)
  const iy = Math.max(pos1y, pos2y)
  const iRight = Math.min(pos1x + size1w, pos2x + size2w)
  const iBottom = Math.min(pos1y + size1h, pos2y + size2h)
  if (ix >= iRight || iy >= iBottom) return false

  const step = 4
  for (let sy = iy; sy < iBottom; sy += step) {
    for (let sx = ix; sx < iRight; sx += step) {
      const px1 = Math.min(Math.floor(((sx - pos1x) / size1w) * mask1.width), mask1.width - 1)
      const py1 = Math.min(Math.floor(((sy - pos1y) / size1h) * mask1.height), mask1.height - 1)
      if (mask1.data[py1 * mask1.width + px1] === 0) continue

      const px2 = Math.min(Math.floor(((sx - pos2x) / size2w) * mask2.width), mask2.width - 1)
      const py2 = Math.min(Math.floor(((sy - pos2y) / size2h) * mask2.height), mask2.height - 1)
      if (mask2.data[py2 * mask2.width + px2] > 0) return true
    }
  }

  return false
}

export const getMaskHit = (
  mask: AlphaMask | null | undefined,
  localX: number,
  localY: number,
  width: number,
  height: number,
): boolean => {
  if (!mask) {
    return true
  }
  if (mask.width <= 0 || mask.height <= 0) {
    return false
  }
  const x = Math.min(Math.max(Math.floor((localX / width) * mask.width), 0), mask.width - 1)
  const y = Math.min(Math.max(Math.floor((localY / height) * mask.height), 0), mask.height - 1)
  return mask.data[y * mask.width + x] > 0
}
