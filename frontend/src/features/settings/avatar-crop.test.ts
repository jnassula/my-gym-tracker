import { describe, expect, it } from 'vitest'

import { clampCrop, cropRect, initialCrop, MAX_ZOOM, panBy, turn, zoomTo } from './avatar-crop'

const LANDSCAPE = { width: 2000, height: 1200 }
const PORTRAIT = { width: 1080, height: 1920 }

describe('where a picture starts', () => {
  it('is the centred square, as large as fits', () => {
    expect(cropRect(LANDSCAPE, initialCrop(LANDSCAPE))).toEqual({ x: 400, y: 0, side: 1200 })
    expect(cropRect(PORTRAIT, initialCrop(PORTRAIT))).toEqual({ x: 0, y: 420, side: 1080 })
  })
})

describe('dragging', () => {
  it('moves the window against the finger: dragging right shows more of the left', () => {
    const dragged = panBy(LANDSCAPE, initialCrop(LANDSCAPE), 0.25, 0)

    expect(cropRect(LANDSCAPE, dragged)).toEqual({ x: 100, y: 0, side: 1200 })
  })

  it('stops at the edge of the picture', () => {
    const start = initialCrop(LANDSCAPE)

    expect(cropRect(LANDSCAPE, panBy(LANDSCAPE, start, 5, 0)).x).toBe(0)
    expect(cropRect(LANDSCAPE, panBy(LANDSCAPE, start, -5, 0)).x).toBe(800)
    // Nothing to see above or below while the window is as tall as the picture.
    expect(cropRect(LANDSCAPE, panBy(LANDSCAPE, start, 0, 1)).y).toBe(0)
  })

  it('moves less of the picture the further it is zoomed in', () => {
    const zoomed = zoomTo(LANDSCAPE, initialCrop(LANDSCAPE), 2)

    expect(panBy(LANDSCAPE, zoomed, 0.5, 0).x).toBe(zoomed.x - 300) // half of a 600 px window
  })
})

describe('zooming', () => {
  it('shrinks the window around its middle', () => {
    const zoomed = zoomTo(LANDSCAPE, initialCrop(LANDSCAPE), 2)

    expect(cropRect(LANDSCAPE, zoomed)).toEqual({ x: 700, y: 300, side: 600 })
  })

  it('keeps what is under the finger where it is', () => {
    // The top-left corner of the window shows picture point (400, 0), before and after.
    const zoomed = zoomTo(LANDSCAPE, initialCrop(LANDSCAPE), 2, { x: 0, y: 0 })

    expect(cropRect(LANDSCAPE, zoomed)).toEqual({ x: 400, y: 0, side: 600 })
  })

  it('stays between the whole short side and a quarter of it', () => {
    const start = initialCrop(LANDSCAPE)

    expect(zoomTo(LANDSCAPE, start, 0.2).zoom).toBe(1)
    expect(zoomTo(LANDSCAPE, start, 40).zoom).toBe(MAX_ZOOM)
    expect(cropRect(LANDSCAPE, zoomTo(LANDSCAPE, start, 40)).side).toBe(300)
  })

  it('pulls the window back inside when zooming out near an edge', () => {
    const corner = panBy(LANDSCAPE, zoomTo(LANDSCAPE, initialCrop(LANDSCAPE), 4), 9, 9)
    expect(cropRect(LANDSCAPE, corner)).toEqual({ x: 0, y: 0, side: 300 })

    expect(cropRect(LANDSCAPE, zoomTo(LANDSCAPE, corner, 1))).toEqual({ x: 0, y: 0, side: 1200 })
  })
})

describe('turning', () => {
  it('swaps the sides and keeps the window on the same part of the picture', () => {
    // Zoomed on the top-left corner of a landscape picture.
    const corner = clampCrop(LANDSCAPE, { x: 150, y: 150, zoom: 4 })

    const clockwise = turn(LANDSCAPE, corner, 1)
    const back = turn(clockwise.picture, clockwise.crop, -1)

    expect(clockwise.picture).toEqual({ width: 1200, height: 2000 })
    // Turned clockwise, the old top-left corner is the new top-right one.
    expect(cropRect(clockwise.picture, clockwise.crop)).toEqual({ x: 900, y: 0, side: 300 })
    expect(back).toEqual({ picture: LANDSCAPE, crop: corner })
  })

  it('comes back to where it started after four quarter turns', () => {
    const start = clampCrop(PORTRAIT, { x: 300, y: 700, zoom: 2.5 })
    let state = { picture: PORTRAIT, crop: start }

    for (let quarter = 0; quarter < 4; quarter++) state = turn(state.picture, state.crop, 1)

    expect(state).toEqual({ picture: PORTRAIT, crop: start })
  })
})
