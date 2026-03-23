"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { useCommandMode } from "./command-mode-context";
import {
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconQuizzes,
  IconSettings,
} from "./sidebar-icons";

const SIDEBAR_COLLAPSED_KEY = "recall:sidebarCollapsed:v1";

function navLinkActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/quizzes" && pathname.startsWith("/quiz")) return true;
  return false;
}

function NavLink({
  href,
  label,
  icon,
  collapsed,
  pathname,
  badgeCount,
  badgeAriaDetail,
  commandHotkey,
  showCommandHotkey,
  linkTitle,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  collapsed: boolean;
  pathname: string;
  /** Shown when > 0 (e.g. incomplete scheduled quizzes). */
  badgeCount?: number;
  /** Appended to aria-label / title when badge is shown (collapsed nav). */
  badgeAriaDetail?: string;
  /** Digit shown to the right of the row when ⌘/Ctrl is held (e.g. nav shortcut). */
  commandHotkey?: string;
  showCommandHotkey?: boolean;
  linkTitle?: string;
}) {
  const active = navLinkActive(pathname, href);
  const showBadge = badgeCount != null && badgeCount > 0;
  const collapsedLabel =
    collapsed && showBadge && badgeAriaDetail
      ? `${label}, ${badgeAriaDetail}`
      : collapsed
        ? label
        : undefined;
  const titleAttr = linkTitle ?? collapsedLabel;
  return (
    <span className="app-sidebar-link-hint-anchor">
      <Link
        href={href}
        className={`app-sidebar-link${active ? " app-sidebar-link--active" : ""}${showBadge ? " app-sidebar-link--badged" : ""}`}
        aria-label={collapsedLabel}
        title={titleAttr}
      >
        <span className="app-sidebar-icon">{icon}</span>
        {collapsed ? null : (
          <span className="app-sidebar-link-label">{label}</span>
        )}
        {showBadge ? (
          <span className="app-sidebar-badge" aria-hidden>
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </Link>
      {showCommandHotkey && commandHotkey ? (
        <span className="app-sidebar-nav-hotkey-hint" aria-hidden>
          {commandHotkey}
        </span>
      ) : null}
    </span>
  );
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const commandMode = useCommandMode();
  const { data: session } = authClient.useSession();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.repeat) return;

      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
        return;
      }

      const d = e.key;
      const c = e.code;
      if (d === "1" || c === "Digit1" || c === "Numpad1") {
        e.preventDefault();
        router.push("/dashboard");
        return;
      }
      if (d === "2" || c === "Digit2" || c === "Numpad2") {
        e.preventDefault();
        router.push("/quizzes");
        return;
      }
      if (d === "3" || c === "Digit3" || c === "Numpad3") {
        e.preventDefault();
        router.push("/settings");
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed, router]);

  const user = session?.user;

  const { data: incompleteScheduledCount } =
    trpc.quiz.incompleteScheduledCount.useQuery(undefined, {
      enabled: !!user,
    });

  return (
    <aside
      className={`app-sidebar${collapsed ? " app-sidebar--collapsed" : ""}`}
      aria-label="Main navigation"
    >
      <div className="app-sidebar-top">
        <div className="app-sidebar-link-hint-anchor">
          <button
            type="button"
            className="app-sidebar-collapse-btn"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-keyshortcuts="Meta+B Control+B"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title="⌘B / Ctrl+B"
          >
            {collapsed ? (
              <IconChevronRight className="app-sidebar-collapse-icon" />
            ) : (
              <IconChevronLeft className="app-sidebar-collapse-icon" />
            )}
          </button>
          {commandMode ? (
            <span className="app-sidebar-nav-hotkey-hint" aria-hidden>
              B
            </span>
          ) : null}
        </div>
      </div>

      <nav className="app-sidebar-nav">
        <NavLink
          href="/dashboard"
          label="Dashboard"
          icon={<IconHome />}
          collapsed={collapsed}
          pathname={pathname}
          commandHotkey="1"
          showCommandHotkey={commandMode}
        />
        <NavLink
          href="/quizzes"
          label="Quizzes"
          icon={<IconQuizzes />}
          collapsed={collapsed}
          pathname={pathname}
          badgeCount={incompleteScheduledCount}
          badgeAriaDetail={
            incompleteScheduledCount
              ? `${incompleteScheduledCount} incomplete scheduled quiz${incompleteScheduledCount === 1 ? "" : "zes"}`
              : undefined
          }
          commandHotkey="2"
          showCommandHotkey={commandMode}
        />
        <NavLink
          href="/settings"
          label="Settings"
          icon={<IconSettings />}
          collapsed={collapsed}
          pathname={pathname}
          commandHotkey="3"
          showCommandHotkey={commandMode}
          linkTitle="Settings (⌘3)"
        />
      </nav>
    </aside>
  );
}
