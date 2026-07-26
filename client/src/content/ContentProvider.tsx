/* ============================================================
   ContentProvider

   Owns content loading and exposes it through `useContent()`.
   Consumers never learn which ContentSource is behind it.

   Note the explicit `status`. The old code exposed only
   `questionBankLoaded = !!questionBank`, so "still loading" and
   "failed, silently showing demo questions" were indistinguishable —
   to the UI and to the user.
   ============================================================ */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { BundledContentSource } from "./BundledContentSource";
import {
  EMPTY_OVERLAY,
  OverlayContentSource,
  isOverlayActive,
  type OverlayStore,
} from "./OverlayContentSource";
import { SubjectFileSchema } from "./schema";
import type { ContentSource, QuestionQuery } from "./ContentSource";
import type {
  ContentManifest,
  ExamBlueprint,
  Question,
  SubjectFile,
  SubjectSummary,
} from "./types";
import { globalKey, readVersioned, removeKey, writeVersioned } from "@/lib/storage";

const OVERLAY_KEY = globalKey("content-overlay");
const OVERLAY_VERSION = 1;

export type ContentStatus = "loading" | "ready" | "error";

interface ContentContextValue {
  status: ContentStatus;
  error: string | null;
  /** How the current content should be described to the user. */
  sourceLabel: string;
  overlayActive: boolean;

  manifest: ContentManifest | null;
  subjects: SubjectSummary[];

  loadSubject: (subjectId: string) => Promise<SubjectFile>;
  getQuestions: (query: QuestionQuery) => Promise<Question[]>;
  getBlueprint: (subjectId: string) => Promise<ExamBlueprint | null>;

  /** Manager-only local draft layer. Not published; visible on this device only. */
  applyOverlaySubject: (file: SubjectFile) => void;
  clearOverlay: () => void;
  reload: () => void;
}

const ContentContext = createContext<ContentContextValue | null>(null);

function readOverlay(): OverlayStore {
  const stored = readVersioned<OverlayStore>(OVERLAY_KEY, {
    currentVersion: OVERLAY_VERSION,
    validate: data => {
      if (!data || typeof data !== "object") return null;
      const subjects = (data as OverlayStore).subjects;
      if (!subjects || typeof subjects !== "object") return null;
      const validated: Record<string, SubjectFile> = {};
      for (const [id, file] of Object.entries(subjects)) {
        const parsed = SubjectFileSchema.safeParse(file);
        if (parsed.success) validated[id] = parsed.data as SubjectFile;
      }
      return { subjects: validated };
    },
  });
  return stored ?? EMPTY_OVERLAY;
}

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlay] = useState<OverlayStore>(readOverlay);
  const [status, setStatus] = useState<ContentStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ContentManifest | null>(null);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const source: ContentSource = useMemo(() => {
    const base = new BundledContentSource();
    return isOverlayActive(overlay) ? new OverlayContentSource(base, overlay) : base;
  }, [overlay]);

  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    Promise.all([source.getManifest(), source.listSubjects()])
      .then(([m, s]) => {
        if (cancelled) return;
        setManifest(m);
        setSubjects(s);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Surface the failure. The old loader swallowed it and served demo data.
        setError(err instanceof Error ? err.message : "טעינת התוכן נכשלה");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [source, reloadToken]);

  const loadSubject = useCallback((subjectId: string) => {
    return sourceRef.current.loadSubject(subjectId);
  }, []);

  const getQuestions = useCallback((query: QuestionQuery) => {
    return sourceRef.current.getQuestions(query);
  }, []);

  const getBlueprint = useCallback((subjectId: string) => {
    return sourceRef.current.getBlueprint(subjectId);
  }, []);

  const applyOverlaySubject = useCallback((file: SubjectFile) => {
    setOverlay(prev => {
      const next: OverlayStore = {
        subjects: { ...prev.subjects, [file.subject.id]: file },
      };
      writeVersioned(OVERLAY_KEY, OVERLAY_VERSION, next);
      return next;
    });
  }, []);

  const clearOverlay = useCallback(() => {
    removeKey(OVERLAY_KEY);
    setOverlay(EMPTY_OVERLAY);
  }, []);

  const reload = useCallback(() => setReloadToken(n => n + 1), []);

  const value = useMemo<ContentContextValue>(
    () => ({
      status,
      error,
      sourceLabel: source.capabilities.label,
      overlayActive: isOverlayActive(overlay),
      manifest,
      subjects,
      loadSubject,
      getQuestions,
      getBlueprint,
      applyOverlaySubject,
      clearOverlay,
      reload,
    }),
    [
      status,
      error,
      source,
      overlay,
      manifest,
      subjects,
      loadSubject,
      getQuestions,
      getBlueprint,
      applyOverlaySubject,
      clearOverlay,
      reload,
    ]
  );

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentContextValue {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error("useContent must be used within ContentProvider");
  return ctx;
}
