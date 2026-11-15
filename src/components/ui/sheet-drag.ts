"use client"

import * as React from "react"

// Drag a bottom sheet down to close it, the way iOS sheets work. The sheet follows
// the finger; letting go past a quarter of its height, or with a quick flick down,
// closes it, otherwise it springs back. A drag from the grab handle always moves the
// sheet; a drag anywhere else moves it only while the content under the finger is
// scrolled to the top, so scrolling the content keeps working.

/** Share of the sheet's height to drag past before letting go closes it. */
export const DISMISS_FRACTION = 0.25
/** The least distance that closes a short sheet, in px. */
export const MIN_DISMISS_PX = 48
/** A flick at least this fast (px per ms) closes the sheet... */
export const FLICK_VELOCITY = 0.5
/** ...once it has moved at least this far, in px. */
export const MIN_FLICK_PX = 20
/** Movement before a press counts as a drag, in px. */
const SLOP_PX = 6
/** A release this long after the last move is a stop, not a flick, in ms. */
const STALE_MS = 100
const SPRING = "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)"

/** Whether letting go after dragging `distance` px at `velocity` px/ms closes a sheet `height` px tall. */
export function shouldDismiss(distance: number, height: number, velocity: number): boolean {
  if (velocity >= FLICK_VELOCITY && distance >= MIN_FLICK_PX) return true
  // Moving back up at the end means the user changed their mind.
  if (velocity <= -FLICK_VELOCITY) return false
  return distance >= Math.max(height * DISMISS_FRACTION, MIN_DISMISS_PX)
}

/** True when any scroll box from `target` up to `root` is scrolled away from its top. */
function scrolledFromTop(target: Element | null, root: HTMLElement): boolean {
  for (let el = target; el; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0) return true
    if (el === root) break
  }
  return false
}

const NO_DRAG = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-sheet-no-drag]"

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  fromHandle: boolean
  target: Element | null
  active: boolean
  offset: number
  lastY: number
  lastT: number
  velocity: number
}

export interface SheetDrag {
  /** Ref for the sheet's content element. */
  contentRef: (el: HTMLElement | null) => void
  /** Ref for the handle, a close button: clicking it closes the sheet. */
  handleRef: React.RefObject<HTMLButtonElement | null>
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
}

export function useSheetDrag(): SheetDrag {
  const content = React.useRef<HTMLElement | null>(null)
  const handleRef = React.useRef<HTMLButtonElement | null>(null)
  const drag = React.useRef<DragState | null>(null)
  // The click that ends a drag must not also press whatever is under the finger.
  const swallowClickUntil = React.useRef(0)
  const cleanups = React.useRef<(() => void) | null>(null)

  const setOffset = (el: HTMLElement, offset: number) => {
    el.style.transform = offset > 0 ? `translateY(${offset}px)` : ""
  }

  const springBack = (el: HTMLElement) => {
    if (prefersReducedMotion()) {
      el.style.transition = ""
      setOffset(el, 0)
      return
    }
    el.style.transition = SPRING
    setOffset(el, 0)
    const done = () => {
      el.style.transition = ""
      el.removeEventListener("transitionend", done)
    }
    el.addEventListener("transitionend", done)
    window.setTimeout(done, 300)
  }

  const contentRef = React.useCallback((el: HTMLElement | null) => {
    cleanups.current?.()
    cleanups.current = null
    content.current = el
    if (!el) return

    // Touch: stop the page from scrolling (or bouncing) while the sheet is moved.
    // Needs a listener that is not passive, which React's onTouchMove is not.
    const onTouchMove = (event: TouchEvent) => {
      const state = drag.current
      if (!state || !event.cancelable) return
      const touch = event.touches[0]
      if (!touch) return
      const down = touch.clientY - state.startY
      const sideways = Math.abs(touch.clientX - state.startX)
      if (state.active || (down > 0 && down >= sideways && (state.fromHandle || !scrolledFromTop(state.target, el)))) {
        event.preventDefault()
      }
    }
    const onClickCapture = (event: MouseEvent) => {
      if (performance.now() > swallowClickUntil.current) return
      swallowClickUntil.current = 0
      event.preventDefault()
      event.stopPropagation()
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("click", onClickCapture, true)
    cleanups.current = () => {
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("click", onClickCapture, true)
    }
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const el = content.current
    if (!el || (event.pointerType === "mouse" && event.button !== 0)) return
    const target = event.target as Element | null
    const fromHandle = !!handleRef.current && !!target && handleRef.current.contains(target)
    if (!fromHandle && target?.closest(NO_DRAG)) return
    swallowClickUntil.current = 0
    const now = performance.now()
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fromHandle,
      target,
      active: false,
      offset: 0,
      lastY: event.clientY,
      lastT: now,
      velocity: 0,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const state = drag.current
    const el = content.current
    if (!state || !el || event.pointerId !== state.pointerId) return
    const down = event.clientY - state.startY
    const now = performance.now()

    if (!state.active) {
      const sideways = Math.abs(event.clientX - state.startX)
      if (Math.abs(down) < SLOP_PX && sideways < SLOP_PX) return
      // Up or sideways is a scroll or another gesture; so is down in scrolled content.
      if (down <= 0 || sideways > down || (!state.fromHandle && scrolledFromTop(state.target, el))) {
        drag.current = null
        return
      }
      state.active = true
      el.dataset.dragging = ""
      el.style.transition = "none"
      el.style.userSelect = "none"
      window.getSelection?.()?.removeAllRanges()
      try {
        el.setPointerCapture(event.pointerId)
      } catch {
        // Not every pointer can be captured; the drag still follows it.
      }
    }

    state.offset = Math.max(0, down)
    const dt = now - state.lastT
    if (dt > 0) {
      const instant = (event.clientY - state.lastY) / dt
      state.velocity = state.velocity * 0.2 + instant * 0.8
    }
    state.lastY = event.clientY
    state.lastT = now
    setOffset(el, state.offset)
  }

  const finish = (event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const state = drag.current
    const el = content.current
    if (!state || event.pointerId !== state.pointerId) return
    drag.current = null
    if (!state.active || !el) return

    delete el.dataset.dragging
    el.style.userSelect = ""
    try {
      el.releasePointerCapture(event.pointerId)
    } catch {
      // Already released.
    }
    const now = performance.now()
    swallowClickUntil.current = now + 400
    const velocity = now - state.lastT > STALE_MS ? 0 : state.velocity
    const height = el.getBoundingClientRect().height

    if (!cancelled && shouldDismiss(state.offset, height, velocity)) {
      el.style.transition = ""
      // After this gesture's own click (swallowed above), close through the
      // sheet's close button, which calls onOpenChange(false).
      window.setTimeout(() => {
        swallowClickUntil.current = 0
        handleRef.current?.click()
        // A caller that keeps the sheet open gets it back in place.
        window.setTimeout(() => {
          if (el.isConnected && el.dataset.state === "open") springBack(el)
        }, 50)
      }, 0)
      return
    }
    springBack(el)
  }

  return {
    contentRef,
    handleRef,
    onPointerDown,
    onPointerMove,
    onPointerUp: (event) => finish(event, false),
    onPointerCancel: (event) => finish(event, true),
  }
}
