"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useSheetDrag } from "./sheet-drag"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-scrim",
        className
      )}
      {...props}
    />
  )
}

function compose<E>(theirs: ((event: E) => void) | undefined, ours: (event: E) => void) {
  return (event: E) => {
    theirs?.(event)
    ours(event)
  }
}

/**
 * The grab bar at the top of a bottom sheet. It is the sheet's close button for
 * pointer and screen-reader users (a tap closes, as does a drag down; see
 * useSheetDrag), but it is left out of the tab order: keyboard users have Escape
 * and the close button, and the sheet's first focus stays where it was.
 */
function SheetHandle({ ref }: { ref: React.Ref<HTMLButtonElement> }) {
  return (
    <SheetPrimitive.Close
      ref={ref}
      data-slot="sheet-handle"
      tabIndex={-1}
      aria-label="Drag down to close"
      className="absolute inset-x-0 top-0 z-10 mx-auto flex h-11 w-28 cursor-grab touch-none items-start justify-center pt-1.5 outline-none select-none active:cursor-grabbing"
    >
      <span aria-hidden="true" className="h-[5px] w-9 rounded-full bg-muted-foreground/40" />
    </SheetPrimitive.Close>
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ref,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const bottom = side === "bottom"
  const drag = useSheetDrag()
  const contentRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      if (bottom) drag.contentRef(el)
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    // drag.contentRef is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bottom, ref]
  )
  // Only a bottom sheet is dragged; the other sides keep their handlers as given.
  const pointer = bottom
    ? {
        onPointerDown: compose(onPointerDown, drag.onPointerDown),
        onPointerMove: compose(onPointerMove, drag.onPointerMove),
        onPointerUp: compose(onPointerUp, drag.onPointerUp),
        onPointerCancel: compose(onPointerCancel, drag.onPointerCancel),
      }
    : { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={contentRef}
        data-slot="sheet-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 motion-reduce:animate-none motion-reduce:transition-none",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
        {...pointer}
      >
        {bottom && <SheetHandle ref={drag.handleRef} />}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
