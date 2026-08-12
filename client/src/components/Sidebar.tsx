/* ============================================================
   Sidebar — INFINIX navigation

   The active indicator is one shared pill that travels between
   items rather than a background that cross-fades in place: the
   destination is visible for the whole move, which is what makes
   the selection feel like an object instead of a repaint.
   ============================================================ */

import { useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useApp, Screen } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fadeOnly, springMove } from "@/lib/motion";
import Wordmark from "@/components/Wordmark";
import {
  Home, BookOpen, User, Settings, LogOut,
  ChevronRight, ChevronLeft, Sun, Moon, Shield
} from "lucide-react";

interface NavItem {
  id: Screen;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  managerOnly?: boolean;
}

/* Labels name what is behind them rather than reaching for a safe
   umbrella term — "בית" is where you are, not a category. */
const NAV_ITEMS: NavItem[] = [
  { id: "hub", label: "בית", icon: Home },
  { id: "wizard", label: "אימון חדש", icon: BookOpen },
  { id: "profile", label: "הביצועים שלי", icon: User },
  { id: "settings", label: "הגדרות", icon: Settings },
  { id: "manager", label: "ניהול", icon: Shield, managerOnly: true },
];

export default function Sidebar() {
  const { currentScreen, setScreen, user, logout } = useApp();
  const { theme, toggleTheme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.managerOnly || user?.role === "manager"
  );

  const pillTransition = reduceMotion ? fadeOnly : springMove;

  return (
    <aside
      className={`app-sidebar ${expanded ? "expanded" : ""}`}
      style={{ direction: "rtl" }}
      aria-label="ניווט ראשי"
    >
      {/* Masthead of the rail. Collapsed it is the mark alone; opened
          it gains the descriptor underneath, on the same baseline
          grid as the nav below it. */}
      <div className={`mb-6 ${expanded ? "w-full px-3" : "px-1"}`}>
        <Wordmark size={expanded ? "md" : "sm"} />
        {expanded && (
          <div className="eyebrow mt-1">Simulator</div>
        )}
      </div>

      {/* Nav items */}
      <LayoutGroup id="sidebar-nav">
        <nav className="flex flex-col gap-1 flex-1 w-full">
          {visibleItems.map(item => {
            const isActive = currentScreen === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`nav-item ${isActive ? "nav-item-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={!expanded ? item.label : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="nav-pill"
                    transition={pillTransition}
                  />
                )}
                <Icon size={19} />
                {expanded && (
                  <span className="text-sm font-bold whitespace-nowrap">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>
      </LayoutGroup>

      {/* Bottom actions */}
      <div className="flex flex-col gap-1 w-full mt-auto">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="nav-item"
          style={{ color: "var(--muted-foreground)" }}
          title={!expanded ? (theme === "dark" ? "מצב בהיר" : "מצב כהה") : undefined}
          aria-label={theme === "dark" ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
        >
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          {expanded && <span className="text-sm font-bold whitespace-nowrap">{theme === "dark" ? "מצב בהיר" : "מצב כהה"}</span>}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="nav-item"
          style={{ color: "var(--muted-foreground)" }}
          title={!expanded ? "התנתק" : undefined}
        >
          <LogOut size={19} />
          {expanded && <span className="text-sm font-bold whitespace-nowrap">התנתק</span>}
        </button>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="nav-item mt-2"
          style={{
            background: "var(--sidebar-accent)",
            color: "var(--sidebar-accent-foreground)",
          }}
          aria-expanded={expanded}
          aria-label={expanded ? "כווץ תפריט" : "הרחב תפריט"}
        >
          {expanded ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          {expanded && <span className="text-xs font-bold whitespace-nowrap">כווץ</span>}
        </button>
      </div>
    </aside>
  );
}
