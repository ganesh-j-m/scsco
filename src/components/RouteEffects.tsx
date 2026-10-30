import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { adminNav } from "@/routes/adminNav";

const SITE = "SCSCO - Shri Chatrapati Shivaji College";
const titles: Record<string, string> = Object.fromEntries(adminNav.flatMap((g) => g.items.map((i) => [i.to, i.label])));
const words = (s: string) => s.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());

function titleFor(path: string) {
  if (path === "/") return SITE;
  const clean = path.replace(/\/+$/, "");
  const base = titles[clean] ?? titles[clean.split("/").slice(0, 3).join("/")] ?? words(clean.split("/").filter(Boolean).slice(0, 2).pop() ?? "");
  return `${base} | SCSCO`;
}

/**
 * On every client-side navigation: update the tab title, move keyboard/screen-reader focus to the
 * main content, and offer a "skip to content" link first thing in the tab order.
 */
export function RouteEffects() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    document.title = titleFor(pathname);
    if (first.current) { first.current = false; return; }
    const main = document.getElementById("main-content");
    if (main) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
  }, [pathname]);

  return (
    <a
      href="#main-content"
      onClick={(e) => { e.preventDefault(); document.getElementById("main-content")?.focus(); }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-700 focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}
