"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, FlaskConical, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { GLOSSARY, type TermId } from "@/lib/glossary";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** The bottom sheet explaining one glossary term; "See also" switches it in place. */
function TermSheet({
  id,
  open,
  onOpenChange,
  hideLinks = false,
}: {
  id: TermId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hide the research and glossary links (use during an active workout). */
  hideLinks?: boolean;
}) {
  const [current, setCurrent] = React.useState<TermId>(id);
  // Closing goes back to the term that was tapped, for next time.
  const handleOpenChange = (next: boolean) => {
    if (!next) setCurrent(id);
    onOpenChange(next);
  };
  const shownId = current;
  const entry = GLOSSARY[shownId];

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-lg rounded-t-3xl border-border bg-card pb-6"
      >
        <SheetHeader className="gap-2 px-5 pt-5 pb-0">
          <SheetTitle className="pr-8 text-lg">{entry.term}</SheetTitle>
          <SheetDescription className="text-[15px] text-foreground">
            {entry.short}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-5">
          <p className="text-sm text-muted-foreground">{entry.long}</p>
          {entry.seeAlso && entry.seeAlso.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                See also
              </p>
              <div className="flex flex-wrap gap-2">
                {entry.seeAlso.map((other) => (
                  <button
                    key={other}
                    type="button"
                    onClick={() => setCurrent(other)}
                    className="min-h-9 rounded-full bg-muted px-3 text-sm font-medium text-foreground transition-colors hover:bg-card-raised"
                  >
                    {GLOSSARY[other].term}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!hideLinks && (
            <div className="flex flex-col border-t border-border pt-2 text-sm font-medium">
              {entry.ruleId && (
                <Link
                  href={`/research#${entry.ruleId}`}
                  className="flex min-h-11 items-center gap-2 text-accent-primary"
                >
                  <FlaskConical className="size-4" aria-hidden="true" />
                  The research
                </Link>
              )}
              <Link
                href={`/more/glossary#${shownId}`}
                className="flex min-h-11 items-center gap-2 text-accent-primary"
              >
                <BookOpen className="size-4" aria-hidden="true" />
                All terms
              </Link>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useTermSheet() {
  const [open, setOpen] = React.useState(false);
  const handleClick = (event: React.MouseEvent) => {
    // Terms often sit inside a clickable row or label.
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };
  return { open, setOpen, handleClick };
}

/**
 * A word with a dotted underline that opens its glossary entry:
 * `<Term id="amrap">AMRAP</Term>`. `label` overrides the word used in the
 * accessible name when the children are not plain text.
 */
function Term({
  id,
  children,
  label,
  hideLinks,
  className,
}: {
  id: TermId;
  children?: React.ReactNode;
  label?: string;
  hideLinks?: boolean;
  className?: string;
}) {
  const { open, setOpen, handleClick } = useTermSheet();
  const word =
    label ?? (typeof children === "string" ? children : GLOSSARY[id].term);
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`What does ${word} mean?`}
        data-term={id}
        className={cn(
          "inline cursor-help rounded-sm underline decoration-dotted decoration-from-font underline-offset-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className,
        )}
      >
        {children ?? GLOSSARY[id].term}
      </button>
      <TermSheet
        id={id}
        open={open}
        onOpenChange={setOpen}
        hideLinks={hideLinks}
      />
    </>
  );
}

/** A small info icon that opens a glossary entry, for tight spots. */
function TermIcon({
  id,
  label,
  hideLinks,
  className,
}: {
  id: TermId;
  label?: string;
  hideLinks?: boolean;
  className?: string;
}) {
  const { open, setOpen, handleClick } = useTermSheet();
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`What does ${label ?? GLOSSARY[id].term} mean?`}
        data-term={id}
        className={cn(
          "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "after:absolute after:-inset-2.5 after:content-['']",
          className,
        )}
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      <TermSheet
        id={id}
        open={open}
        onOpenChange={setOpen}
        hideLinks={hideLinks}
      />
    </>
  );
}

export { Term, TermIcon, TermSheet };
