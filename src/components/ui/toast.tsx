"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ToastOptions {
  message: string
  action?: { label: string; onAction: () => void | Promise<void> }
  /** Auto-dismiss delay in milliseconds. Default 6000. */
  durationMs?: number
}

interface ToastState extends ToastOptions {
  id: number
}

const DEFAULT_DURATION_MS = 6000

let current: ToastState | null = null
let nextId = 1
const listeners = new Set<() => void>()

function emit(next: ToastState | null) {
  current = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => current
const getServerSnapshot = () => null

/** Show a toast, replacing any toast already visible. Callable from anywhere on the client. */
export function toast(options: ToastOptions): void {
  emit({ ...options, id: nextId++ })
}

export function dismissToast(): void {
  if (current !== null) emit(null)
}

function ToastView({ item }: { item: ToastState }) {
  const [hovered, setHovered] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const paused = hovered || focused
  const used = React.useRef(false)
  const remaining = React.useRef(item.durationMs ?? DEFAULT_DURATION_MS)

  React.useEffect(() => {
    if (paused) return
    const startedAt = Date.now()
    const timer = setTimeout(() => {
      if (current?.id === item.id) dismissToast()
    }, remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt))
    }
  }, [paused, item.id])

  function handleAction() {
    if (used.current || !item.action) return
    used.current = true
    const { onAction } = item.action
    dismissToast()
    void onAction()
  }

  return (
    <div
      data-slot="toast"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground shadow-lg",
        "animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
      )}
    >
      <p data-slot="toast-message" className="min-w-0 flex-1 text-sm text-foreground">
        {item.message}
      </p>
      {item.action && (
        <button
          type="button"
          onClick={handleAction}
          className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismissToast}
        className="shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Renders the current toast. Mount once, in AppChrome. */
export function Toaster() {
  const item = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (!item) return null
  return (
    <div
      data-slot="toaster"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] mx-auto w-full max-w-lg px-4"
    >
      <ToastView key={item.id} item={item} />
    </div>
  )
}
