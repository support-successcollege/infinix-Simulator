/* ============================================================
   motion.ts — shared motion vocabulary

   Apple describes springs with two designer-facing numbers rather
   than mass/stiffness/damping:

     damping ratio — how much overshoot. 1.0 settles without any
                     bounce; below 1.0 it overshoots.
     response      — how quickly the value reaches the target, in
                     seconds. Not a duration: a spring has no fixed
                     runtime, its settle time falls out of the
                     parameters.

   Motion's `{ bounce, duration }` spring API maps onto those
   directly — bounce 0 is critically damped, and `duration` is the
   perceptual response, not a hard cutoff.

   House rule: critically damped everywhere by default. Overshoot
   is reserved for motion that follows a gesture carrying momentum
   (a flick, a drag release) or a value that lands after
   accelerating. Bounce on a panel that merely faded in reads as
   decoration.
   ============================================================ */

import type { Transition } from "framer-motion";

/** Reposition / move. Apple ships damping 1.0, response 0.4. */
export const springMove: Transition = { type: "spring", bounce: 0, duration: 0.4 };

/** Default UI settle — snappier than a reposition, still no bounce. */
export const springSettle: Transition = { type: "spring", bounce: 0, duration: 0.3 };

/** Drawer / sheet. Apple ships damping 0.8, response 0.3. */
export const springSheet: Transition = { type: "spring", bounce: 0.2, duration: 0.3 };

/** Momentum landing — something that arrived carrying speed. */
export const springMomentum: Transition = { type: "spring", bounce: 0.25, duration: 0.4 };

/** Opacity-only fallback used whenever motion is reduced. */
export const fadeOnly: Transition = { duration: 0.18, ease: "easeOut" };

/**
 * Screen depth. Navigating to a deeper screen pushes the incoming
 * view in along one axis; going back retraces the same path in
 * reverse, so a screen always leaves the way it arrived.
 *
 * Everything that hangs directly off the hub shares depth 1 — those
 * are siblings, and a sideways move between them should not
 * pretend to be a push.
 */
const SCREEN_DEPTH: Record<string, number> = {
  hub: 0,
  wizard: 1,
  profile: 1,
  manager: 1,
  settings: 1,
  quiz: 2,
  results: 3,
};

export function screenDepth(screen: string): number {
  return SCREEN_DEPTH[screen] ?? 1;
}

/**
 * Horizontal travel for a push, in pixels.
 *
 * The layout is RTL, so navigation is mirrored the way iOS mirrors
 * it: a deeper screen enters from the leading (left) edge and the
 * outgoing screen leaves toward the trailing (right) edge.
 *
 * The distance is deliberately short. A full-width slide between
 * two dashboards is travel for its own sake; a few percent of the
 * viewport is enough to say which direction the stack moved.
 */
export const SCREEN_TRAVEL = 28;
