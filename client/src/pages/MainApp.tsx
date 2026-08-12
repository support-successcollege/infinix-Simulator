/* ============================================================
   MainApp — INFINIX app shell
   Sidebar + main content area, full-viewport, no body scroll, RTL.

   Screen changes are spring transitions rather than a keyframe on
   a remount: the outgoing and incoming views overlap, so input is
   never locked out mid-transition and a screen that is re-entered
   while it is still leaving simply reverses.
   ============================================================ */

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { fadeOnly, screenDepth, springMove, SCREEN_TRAVEL } from "@/lib/motion";
import Sidebar from "@/components/Sidebar";
import HubScreen from "@/components/screens/HubScreen";
import WizardScreen from "@/components/screens/WizardScreen";
import QuizScreen from "@/components/screens/QuizScreen";
import ResultsScreen from "@/components/screens/ResultsScreen";
import ProfileScreen from "@/components/screens/ProfileScreen";
import ManagerScreen from "@/components/screens/ManagerScreen";
import SettingsScreen from "@/components/screens/SettingsScreen";

export default function MainApp() {
  const { isAuthenticated, currentScreen } = useApp();
  const [, setLocation] = useLocation();
  const reduceMotion = useReducedMotion();

  // Which way the stack moved. Read during render of the new screen,
  // then updated — so the incoming and outgoing views agree on the
  // direction and travel along one shared path.
  const previousScreen = useRef(currentScreen);
  const depthDelta = screenDepth(currentScreen) - screenDepth(previousScreen.current);
  const direction = Math.sign(depthDelta);

  useEffect(() => {
    previousScreen.current = currentScreen;
  }, [currentScreen]);

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  const renderScreen = () => {
    switch (currentScreen) {
      case "hub": return <HubScreen />;
      case "wizard": return <WizardScreen />;
      case "quiz": return <QuizScreen />;
      case "results": return <ResultsScreen />;
      case "profile": return <ProfileScreen />;
      case "manager": return <ManagerScreen />;
      case "settings": return <SettingsScreen />;
      default: return <HubScreen />;
    }
  };

  // The quiz takes the full viewport — the sidebar is navigation
  // away from a timed task, and it does not belong on screen while
  // one is running.
  const isFullscreen = currentScreen === "quiz";

  // Going deeper: the new screen enters from the leading edge, the
  // old one leaves toward the trailing edge. Going back mirrors it.
  // Sideways moves between siblings get no travel at all.
  const travel = direction === 0 ? 0 : direction * SCREEN_TRAVEL * -1;

  const variants = reduceMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: { opacity: 0, x: travel, scale: 0.995 },
        center: { opacity: 1, x: 0, scale: 1 },
        exit: { opacity: 0, x: -travel, scale: 0.995 },
      };

  return (
    <div className="app-shell">
      {!isFullscreen && <Sidebar />}
      <main className="app-main">
        <div className="arena relative">
          <AnimatePresence initial={false}>
            <motion.div
              key={currentScreen}
              className="absolute inset-0 flex flex-col"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={reduceMotion ? fadeOnly : springMove}
              style={{
                // Absolute insets resolve against the padding box, so
                // the safe-area padding on `.arena` would be painted
                // over. It belongs on the screen itself.
                paddingTop: "var(--safe-top)",
                paddingBottom: "var(--safe-bottom)",
                willChange: "transform, opacity",
              }}
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
