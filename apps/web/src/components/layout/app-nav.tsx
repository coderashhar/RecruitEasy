"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { activeHref, type NavItem, type NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export interface ShellIdentity {
  name: string;
  detail: string;
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-[11px]">
      <span aria-hidden="true" className="size-[13px] rotate-45 bg-foreground" />
      <span className="text-[15.5px] font-semibold tracking-[-0.02em]">InterviewHub</span>
    </span>
  );
}

const COUNT_TONE: Record<NonNullable<NavItem["countTone"]>, string> = {
  muted: "text-muted-foreground",
  warning: "text-warning",
  danger: "text-danger",
};

function NavLink({
  item,
  active,
  size,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  size: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center justify-between transition-colors outline-none focus-visible:bg-muted",
        size === "desktop" ? "px-[26px] py-[9px] text-[14.5px]" : "px-[22px] py-3 text-[15.5px]",
        active ? "font-semibold text-foreground" : "font-[450] text-muted-foreground hover:text-foreground",
      )}
    >
      {/* The 2px bar is the only mark of the current page; the label's weight backs it up. */}
      {active && (
        <span
          aria-hidden="true"
          className={cn("absolute left-0 w-0.5 bg-primary", size === "desktop" ? "inset-y-[7px]" : "inset-y-[9px]")}
        />
      )}
      {item.label}
      {item.count !== undefined && (
        <span className={cn("font-mono text-[11.5px] tabular-nums", COUNT_TONE[item.countTone ?? "muted"])}>
          {item.count}
        </span>
      )}
    </Link>
  );
}

function NavSections({
  sections,
  size,
  onNavigate,
}: {
  sections: NavSection[];
  size: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const current = activeHref(sections, pathname);
  const pad = size === "desktop" ? "px-[26px]" : "px-[22px]";

  return (
    <nav aria-label="Main" className="flex flex-col">
      {sections.map((section, index) => (
        <div key={section.label ?? index} className={cn(index > 0 && "pt-[30px]")}>
          {section.label && (
            <div
              className={cn(
                "pb-2.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/90 uppercase",
                pad,
              )}
            >
              {section.label}
            </div>
          )}
          <div className="flex flex-col">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={item.href === current}
                size={size}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function IdentityFooter({ identity, className }: { identity: ShellIdentity; className?: string }) {
  return (
    <div className={cn("mt-auto border-t pt-[18px]", className)}>
      <div className="text-[13.5px] font-medium">{identity.name}</div>
      <div className="mt-0.5 text-[12.5px] text-muted-foreground">{identity.detail}</div>
      <ThemeToggle className="mt-3" />
    </div>
  );
}

/** Text-only sidebar: no icons, no fills, a 2px ink bar on the current item. */
export function AppSidebar({ sections, identity }: { sections: NavSection[]; identity: ShellIdentity }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-r py-[26px] pb-5 lg:flex">
      <Link href={sections[0]?.items[0]?.href ?? "/"} className="px-[26px] pb-[34px]">
        <Wordmark />
      </Link>
      <NavSections sections={sections} size="desktop" />
      <IdentityFooter identity={identity} className="px-[26px]" />
    </aside>
  );
}

/** The 390px shell: the current page's name, and the nav in a drawer. */
export function MobileNav({ sections, identity }: { sections: NavSection[]; identity: ShellIdentity }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = activeHref(sections, pathname);
  const title =
    sections.flatMap((section) => section.items).find((item) => item.href === current)?.label ?? "InterviewHub";

  return (
    <div className="flex min-w-0 items-center gap-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Open navigation"
          className="-m-2 flex flex-col gap-1 p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="h-[1.5px] w-[17px] bg-foreground" />
          <span className="h-[1.5px] w-[17px] bg-foreground" />
          <span className="h-[1.5px] w-[17px] bg-foreground" />
        </SheetTrigger>
        <SheetContent className="py-[22px]">
          <SheetTitle className="px-[22px] pb-[26px]">
            <Wordmark />
          </SheetTitle>
          <NavSections sections={sections} size="mobile" onNavigate={() => setOpen(false)} />
          <IdentityFooter identity={identity} className="px-[22px]" />
        </SheetContent>
      </Sheet>
      <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">{title}</span>
    </div>
  );
}
