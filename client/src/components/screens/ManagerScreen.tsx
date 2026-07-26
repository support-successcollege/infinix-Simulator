/* ============================================================
   ManagerScreen — content health, content editing, accounts

   What changed and why:

   • The "team" stats were not measurements. `activeThisWeek` was
     `authUsers.length`; `avgTeamScore` and `totalSessions` were the
     *manager's own* in-memory sessions presented as the team's; the
     CSV export wrote a literal `active,0,0,` for every member.
     Without a backend a manager cannot see anyone else's results, so
     the panel now says that instead of inventing numbers.

   • "ייבוא קטגוריה ושמירה קבועה" saved to the manager's own
     localStorage and reached nobody. It is now labelled as a local
     preview, and publishing means exporting the file and committing
     it — git is what makes content reach other users.

   • The role guard used to sit above a useMemo, so changing role
     mid-session changed the hook count and crashed the render.
     Hooks now run unconditionally and the guard follows them.
   ============================================================ */

import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from "react";
import { useApp } from "@/contexts/AppContext";
import { useContent } from "@/content/ContentProvider";
import { SubjectFileSchema, formatIssues } from "@/content/schema";
import { getExplanationState } from "@/content/completeness";
import { optionLabel } from "@/lib/hebrew";
import { downloadBlob, toCsv } from "@/lib/download";
import type { Question, SubjectFile } from "@/content/types";
import {
  Users,
  BookOpen,
  Shield,
  Upload,
  Download,
  Trash2,
  Save,
  PlusCircle,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

type Tab = "content" | "accounts";

export default function ManagerScreen() {
  const { user, authUsers, createAuthUser, updateAuthUserRole, deleteAuthUser } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>("content");

  const isManager = user?.role === "manager";

  if (!isManager) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6" style={{ direction: "rtl" }}>
        <Shield size={48} style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
        <h2 className="text-xl font-black" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
          גישה מוגבלת
        </h2>
        <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>
          מסך זה זמין למנהלים בלבד
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ direction: "rtl" }}>
      <div
        className="flex-shrink-0 px-4 pt-5 pb-4"
        style={{ borderBottom: "1px solid var(--tf-border)", background: "var(--tf-surface)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(183, 146, 79, 0.2)", border: "1px solid rgba(183, 146, 79, 0.35)" }}
          >
            <Shield size={20} style={{ color: "var(--warning)" }} />
          </div>
          <div>
            <h1 className="text-xl font-black" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
              מרכז פיקוד
            </h1>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>ניהול תוכן וחשבונות</p>
          </div>
        </div>

        <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--muted)" }} role="tablist">
          {(
            [
              { id: "content" as Tab, label: "תוכן", icon: BookOpen },
              { id: "accounts" as Tab, label: "חשבונות", icon: Users },
            ]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: activeTab === id ? "var(--card)" : "transparent",
                color: activeTab === id ? "var(--foreground)" : "var(--muted-foreground)",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "content" && <ContentTab />}
        {activeTab === "accounts" && (
          <AccountsTab
            authUsers={authUsers}
            createAuthUser={createAuthUser}
            updateAuthUserRole={updateAuthUserRole}
            deleteAuthUser={deleteAuthUser}
          />
        )}
      </div>
    </div>
  );
}

/* ── Content health + editor ─────────────────────────────────── */

const pct = (n: number) => `${Math.round(n * 100)}%`;

function ContentTab() {
  const {
    manifest,
    subjects,
    status,
    sourceLabel,
    overlayActive,
    loadSubject,
    applyOverlaySubject,
    clearOverlay,
  } = useContent();

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [file, setFile] = useState<SubjectFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draft, setDraft] = useState<Question | null>(null);
  const [filter, setFilter] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);

  const allSubjectIds = useMemo(
    () => (manifest?.subjects ?? []).map(s => s.subjectId),
    [manifest]
  );

  useEffect(() => {
    if (allSubjectIds.length === 0) return;
    if (!selectedSubjectId || !allSubjectIds.includes(selectedSubjectId)) {
      setSelectedSubjectId(allSubjectIds[0]);
    }
  }, [allSubjectIds, selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    let cancelled = false;
    setLoadError(null);
    loadSubject(selectedSubjectId)
      .then(f => {
        if (cancelled) return;
        setFile(f);
        setSelectedIndex(0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFile(null);
        setLoadError(err instanceof Error ? err.message : "טעינת המקצוע נכשלה");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSubjectId, loadSubject, overlayActive]);

  const questions = file?.questions ?? [];
  const visible = useMemo(() => {
    const q = filter.trim();
    if (!q) return questions.map((question, index) => ({ question, index }));
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question.stem.includes(q) || question.id.includes(q));
  }, [questions, filter]);

  const selected = questions[selectedIndex] ?? null;

  useEffect(() => {
    setDraft(selected ? { ...selected, options: [...selected.options] } : null);
  }, [selected]);

  const subjectEntry = manifest?.subjects.find(s => s.subjectId === selectedSubjectId) ?? null;

  const writeFile = (mutate: (copy: SubjectFile) => void) => {
    if (!file) return;
    const copy: SubjectFile = structuredClone(file);
    mutate(copy);
    const parsed = SubjectFileSchema.safeParse(copy);
    if (!parsed.success) {
      toast.error(formatIssues(parsed.error)[0] ?? "השינוי אינו תקין");
      return;
    }
    const next = parsed.data as SubjectFile;
    setFile(next);
    applyOverlaySubject(next);
  };

  const saveDraft = () => {
    if (!draft) return;
    const options = draft.options.map(o => o.trim()).filter(Boolean);
    if (!draft.stem.trim() || options.length < 2) {
      toast.error("יש להזין נוסח שאלה ולפחות 2 אפשרויות");
      return;
    }
    writeFile(copy => {
      copy.questions[selectedIndex] = {
        ...draft,
        options,
        correctIndex: Math.max(0, Math.min(options.length - 1, draft.correctIndex)),
        updatedAt: new Date().toISOString().slice(0, 10),
      };
    });
    toast.success("השינוי נשמר בטיוטה המקומית");
  };

  const addQuestion = () => {
    if (!file) return;
    const topicId = file.topics[0]?.id;
    if (!topicId) {
      toast.error("יש להגדיר נושא אחד לפחות במקצוע לפני הוספת שאלה");
      return;
    }
    writeFile(copy => {
      copy.questions.unshift({
        id: `${copy.subject.id}.new.${Date.now()}`,
        stem: "שאלה חדשה",
        options: ["אפשרות א", "אפשרות ב", "אפשרות ג", "אפשרות ד"],
        correctIndex: 0,
        explanation: "",
        coachNote: "",
        legalRefs: [],
        subjectId: copy.subject.id,
        topicId,
        difficulty: "medium",
        tags: [],
        status: "draft",
        source: {},
        updatedAt: new Date().toISOString().slice(0, 10),
      });
    });
    setSelectedIndex(0);
    toast.success("שאלה חדשה נוספה");
  };

  const deleteQuestion = () => {
    if (!selected) return;
    if (!window.confirm(`למחוק את השאלה "${selected.stem.slice(0, 50)}"?`)) return;
    writeFile(copy => {
      copy.questions.splice(selectedIndex, 1);
    });
    setSelectedIndex(0);
    toast.success("השאלה נמחקה מהטיוטה המקומית");
  };

  const exportSubject = () => {
    if (!file) return;
    const parsed = SubjectFileSchema.safeParse(file);
    if (!parsed.success) {
      toast.error(`הקובץ אינו תקין: ${formatIssues(parsed.error)[0]}`);
      return;
    }
    downloadBlob(
      `${file.subject.id}.json`,
      JSON.stringify(parsed.data, null, 2),
      "application/json;charset=utf-8"
    );
    toast.success("הקובץ אומת והורד");
  };

  const handleImport: ChangeEventHandler<HTMLInputElement> = async e => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    try {
      const parsed = SubjectFileSchema.safeParse(JSON.parse(await picked.text()));
      if (!parsed.success) {
        toast.error(`הקובץ אינו תקין: ${formatIssues(parsed.error)[0]}`);
        return;
      }
      const next = parsed.data as SubjectFile;
      applyOverlaySubject(next);
      setSelectedSubjectId(next.subject.id);
      toast.success("נטען לתצוגה מקדימה מקומית — לא פורסם");
    } catch (err) {
      toast.error(`טעינת הקובץ נכשלה: ${(err as Error)?.message ?? "קובץ לא תקין"}`);
    } finally {
      e.target.value = "";
    }
  };

  if (status === "loading") {
    return <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>טוען תוכן…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImport}
      />

      {overlayActive && (
        <div
          className="rounded-xl p-3 flex items-start gap-3"
          style={{ background: "rgba(255, 165, 0, 0.12)", border: "1px solid rgba(255, 165, 0, 0.35)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            <div className="text-sm font-bold" style={{ color: "var(--warning)" }}>
              תצוגה מקדימה מקומית — לא פורסם
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              השינויים נשמרים בדפדפן הזה בלבד ואינם נראים לאף לומד. כדי לפרסם: ייצא את הקובץ,
              שמור אותו ב־<code>client/src/content/subjects/</code> והעלה לריפו.
            </div>
          </div>
          <button
            onClick={() => {
              clearOverlay();
              toast.success("הטיוטה המקומית נמחקה");
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
          >
            בטל טיוטה
          </button>
        </div>
      )}

      {/* Content health — every number here is measured */}
      <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-sm" style={{ color: "var(--foreground)" }}>בריאות המאגר</h3>
          <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
            {sourceLabel}
          </span>
        </div>

        {manifest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "מפורסמות", value: String(manifest.totals.byStatus.published) },
              { label: "בבדיקה", value: String(manifest.totals.byStatus.review) },
              { label: "טיוטה", value: String(manifest.totals.byStatus.draft) },
              { label: "כיסוי הסברים", value: pct(manifest.totals.explanationCoverage) },
            ].map(({ label, value }) => (
              <div key={label} className="stat-card">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</span>
                <span className="text-2xl font-black" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: "var(--foreground)" }}>
            <thead>
              <tr style={{ color: "var(--muted-foreground)" }}>
                <th className="text-right py-2">מקצוע</th>
                <th className="text-right py-2">מפורסמות</th>
                <th className="text-right py-2">בבדיקה</th>
                <th className="text-right py-2">הסברים</th>
                <th className="text-right py-2">מקורות</th>
                <th className="text-right py-2">סימולציית בחינה</th>
              </tr>
            </thead>
            <tbody>
              {(manifest?.subjects ?? []).map(s => (
                <tr key={s.subjectId} style={{ borderTop: "1px solid var(--tf-border)" }}>
                  <td className="py-2">{s.icon} {s.title}</td>
                  <td className="py-2">{s.byStatus.published}</td>
                  <td className="py-2">{s.byStatus.review}</td>
                  <td className="py-2">{pct(s.explanationCoverage)}</td>
                  <td className="py-2">{pct(s.legalRefCoverage)}</td>
                  <td className="py-2">
                    {!s.examReadiness ? (
                      <span style={{ color: "var(--muted-foreground)" }}>—</span>
                    ) : s.examReadiness.ready ? (
                      <span style={{ color: "var(--success)" }}>מוכנה</span>
                    ) : (
                      <span style={{ color: "var(--warning)" }}>
                        חסומה · {s.examReadiness.blockers
                          .map(b => `${b.title} ${b.available}/${b.required}`)
                          .join(", ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {subjects.length === 0 && (
          <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>
            אין מקצועות עם שאלות מפורסמות. לומדים לא יראו תוכן עד שיפורסמו שאלות.
          </p>
        )}
      </div>

      {/* Editor */}
      <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
        <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>עריכת שאלות</h3>

        {loadError && (
          <p className="text-sm mb-3" style={{ color: "var(--destructive)" }}>{loadError}</p>
        )}

        {!file ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>אין מקצוע לעריכה.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-3">
            <div
              className="rounded-xl p-3 max-h-[460px] overflow-y-auto"
              style={{ background: "var(--background)", border: "1px solid var(--tf-border)" }}
            >
              <label htmlFor="mgr-subject" className="block text-xs font-bold mb-1" style={{ color: "var(--muted-foreground)" }}>
                מקצוע
              </label>
              <select
                id="mgr-subject"
                className="tf-input mb-2"
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
              >
                {(manifest?.subjects ?? []).map(s => (
                  <option key={s.subjectId} value={s.subjectId}>{s.title}</option>
                ))}
              </select>

              <label htmlFor="mgr-filter" className="sr-only">חיפוש שאלה</label>
              <div className="relative mb-2">
                <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
                <input
                  id="mgr-filter"
                  className="tf-input"
                  placeholder="חיפוש בנוסח או במזהה"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  style={{ paddingRight: "2rem" }}
                />
              </div>

              <div className="text-xs font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>
                שאלות ({visible.length} מתוך {questions.length})
              </div>

              <div className="flex flex-col gap-1">
                {visible.map(({ question, index }) => {
                  const state = getExplanationState(question);
                  return (
                    <button
                      key={question.id}
                      onClick={() => setSelectedIndex(index)}
                      className="text-right p-2 rounded-lg text-xs"
                      style={{
                        background: index === selectedIndex ? "var(--accent)" : "transparent",
                        color: index === selectedIndex ? "var(--accent-foreground)" : "var(--foreground)",
                        border: "1px solid var(--tf-border)",
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        {state === "missing" ? (
                          <AlertTriangle size={11} style={{ color: "var(--warning)", flexShrink: 0 }} />
                        ) : (
                          <CheckCircle2 size={11} style={{ color: "var(--success)", flexShrink: 0 }} />
                        )}
                        <span className="flex-1 min-w-0">{question.stem.slice(0, 60)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl p-3" style={{ background: "var(--background)", border: "1px solid var(--tf-border)" }}>
              {!draft ? (
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>בחר שאלה מהרשימה כדי לערוך.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <label htmlFor="q-stem" className="text-xs" style={{ color: "var(--muted-foreground)" }}>נוסח שאלה</label>
                  <textarea
                    id="q-stem"
                    className="tf-input min-h-[88px]"
                    value={draft.stem}
                    onChange={e => setDraft({ ...draft, stem: e.target.value })}
                  />

                  {draft.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs w-5 font-bold" style={{ color: "var(--muted-foreground)" }}>
                        {optionLabel(i)}
                      </span>
                      <label htmlFor={`q-opt-${i}`} className="sr-only">{`אפשרות ${optionLabel(i)}`}</label>
                      <input
                        id={`q-opt-${i}`}
                        className="tf-input"
                        value={opt}
                        onChange={e => {
                          const next = [...draft.options];
                          next[i] = e.target.value;
                          setDraft({ ...draft, options: next });
                        }}
                      />
                    </div>
                  ))}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label htmlFor="q-correct" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      תשובה נכונה
                      <select
                        id="q-correct"
                        className="tf-input mt-1"
                        value={draft.correctIndex}
                        onChange={e => setDraft({ ...draft, correctIndex: Number(e.target.value) })}
                      >
                        {draft.options.map((_, i) => (
                          <option key={i} value={i}>{optionLabel(i)}</option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor="q-difficulty" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      רמת קושי
                      <select
                        id="q-difficulty"
                        className="tf-input mt-1"
                        value={draft.difficulty}
                        onChange={e =>
                          setDraft({ ...draft, difficulty: e.target.value as Question["difficulty"] })
                        }
                      >
                        <option value="easy">קל</option>
                        <option value="medium">בינוני</option>
                        <option value="hard">קשה</option>
                      </select>
                    </label>
                    <label htmlFor="q-status" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      סטטוס
                      <select
                        id="q-status"
                        className="tf-input mt-1"
                        value={draft.status}
                        onChange={e => setDraft({ ...draft, status: e.target.value as Question["status"] })}
                      >
                        <option value="draft">טיוטה</option>
                        <option value="review">בבדיקה</option>
                        <option value="published">מפורסמת</option>
                        <option value="archived">בארכיון</option>
                      </select>
                    </label>
                  </div>

                  <label htmlFor="q-topic" className="text-xs" style={{ color: "var(--muted-foreground)" }}>נושא</label>
                  <select
                    id="q-topic"
                    className="tf-input"
                    value={draft.topicId}
                    onChange={e => setDraft({ ...draft, topicId: e.target.value })}
                  >
                    {file.topics.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>

                  <label htmlFor="q-explanation" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    הסבר — חובה כדי לפרסם
                  </label>
                  <textarea
                    id="q-explanation"
                    className="tf-input min-h-[82px]"
                    value={draft.explanation}
                    onChange={e => setDraft({ ...draft, explanation: e.target.value })}
                  />

                  <label htmlFor="q-coach" className="text-xs" style={{ color: "var(--muted-foreground)" }}>טיפ לבחינה</label>
                  <textarea
                    id="q-coach"
                    className="tf-input min-h-[60px]"
                    value={draft.coachNote}
                    onChange={e => setDraft({ ...draft, coachNote: e.target.value })}
                  />

                  <LegalRefsEditor draft={draft} setDraft={setDraft} />

                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={saveDraft}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
                      style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      <Save size={13} /> שמור בטיוטה
                    </button>
                    <button
                      onClick={addQuestion}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
                      style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
                    >
                      <PlusCircle size={13} /> הוסף שאלה
                    </button>
                    <button
                      onClick={deleteQuestion}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
                      style={{ background: "rgba(220, 38, 38, 0.12)", color: "var(--destructive)" }}
                    >
                      <Trash2 size={13} /> מחק שאלה
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <button
          onClick={() => importRef.current?.click()}
          className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
        >
          <Upload size={15} /> טעינה מקומית לתצוגה מקדימה
        </button>
        <button
          onClick={exportSubject}
          className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          <Download size={15} /> ייצוא חבילת תוכן לפרסום
        </button>
      </div>
    </div>
  );
}

function LegalRefsEditor({
  draft,
  setDraft,
}: {
  draft: Question;
  setDraft: (q: Question) => void;
}) {
  const update = (i: number, patch: Partial<Question["legalRefs"][number]>) => {
    const next = draft.legalRefs.map((ref, idx) => (idx === i ? { ...ref, ...patch } : ref));
    setDraft({ ...draft, legalRefs: next });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>מקורות (חוק / סעיף)</span>
      {draft.legalRefs.map((ref, i) => (
        <div key={i} className="flex items-center gap-2">
          <label htmlFor={`q-law-${i}`} className="sr-only">שם החוק</label>
          <input
            id={`q-law-${i}`}
            className="tf-input"
            placeholder="שם החוק"
            value={ref.law}
            onChange={e => update(i, { law: e.target.value })}
          />
          <label htmlFor={`q-section-${i}`} className="sr-only">סעיף</label>
          <input
            id={`q-section-${i}`}
            className="tf-input"
            placeholder="סעיף"
            value={ref.section ?? ""}
            onChange={e => update(i, { section: e.target.value })}
          />
          <button
            type="button"
            aria-label={`הסר מקור ${i + 1}`}
            onClick={() => setDraft({ ...draft, legalRefs: draft.legalRefs.filter((_, idx) => idx !== i) })}
            className="p-2 rounded-lg flex-shrink-0"
            style={{ background: "rgba(220, 38, 38, 0.12)", color: "var(--destructive)" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDraft({ ...draft, legalRefs: [...draft.legalRefs, { law: "", section: "" }] })}
        className="self-start text-xs font-semibold px-2 py-1 rounded-lg"
        style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
      >
        + הוסף מקור
      </button>
    </div>
  );
}

/* ── Accounts ────────────────────────────────────────────────── */

type AuthUsers = ReturnType<typeof useApp>["authUsers"];

function AccountsTab({
  authUsers,
  createAuthUser,
  updateAuthUserRole,
  deleteAuthUser,
}: {
  authUsers: AuthUsers;
  createAuthUser: ReturnType<typeof useApp>["createAuthUser"];
  updateAuthUserRole: ReturnType<typeof useApp>["updateAuthUserRole"];
  deleteAuthUser: ReturnType<typeof useApp>["deleteAuthUser"];
}) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"trainee" | "manager">("trainee");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return authUsers.filter(
      m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [authUsers, search]);

  const addMember = () => {
    try {
      createAuthUser({
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
      });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("trainee");
      toast.success("משתמש נוסף בהצלחה");
    } catch (err) {
      toast.error((err as Error)?.message || "יצירת המשתמש נכשלה");
    }
  };

  // Only fields that are actually known are exported. The previous version
  // wrote a literal `active,0,0,` for sessions and average score.
  const exportRoster = () => {
    downloadBlob(
      "infinix-accounts.csv",
      toCsv(
        ["name", "email", "role"],
        filtered.map(m => [m.name, m.email, m.role])
      ),
      "text/csv;charset=utf-8"
    );
    toast.success("רשימת החשבונות יוצאה");
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-xl p-3 flex items-start gap-3"
        style={{ background: "var(--tf-surface-soft)", border: "1px solid var(--tf-border)" }}
      >
        <AlertTriangle size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }} />
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          נתוני ביצועים נשמרים במכשיר של כל לומד ואינם נגישים מכאן. גם החשבונות נוצרים
          מקומית בדפדפן זה — כדי שחשבונות ותוצאות יהיו משותפים לכל המשתמשים נדרש שרת.
        </p>
      </div>

      <div
        className="rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-2"
        style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}
      >
        <label htmlFor="acc-name" className="sr-only">שם מלא</label>
        <input id="acc-name" className="tf-input" placeholder="שם מלא" value={newName} onChange={e => setNewName(e.target.value)} />
        <label htmlFor="acc-email" className="sr-only">מייל</label>
        <input id="acc-email" className="tf-input" placeholder="מייל" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
        <label htmlFor="acc-password" className="sr-only">סיסמה</label>
        <input id="acc-password" className="tf-input" placeholder="סיסמה" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        <label htmlFor="acc-role" className="sr-only">תפקיד</label>
        <select id="acc-role" className="tf-input" value={newRole} onChange={e => setNewRole(e.target.value as "trainee" | "manager")}>
          <option value="trainee">סטודנט</option>
          <option value="manager">מנהל</option>
        </select>
        <button
          onClick={addMember}
          className="rounded-xl px-3 py-2 font-semibold text-sm"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          הוסף משתמש
        </button>
      </div>

      <div className="relative">
        <label htmlFor="acc-search" className="sr-only">חיפוש לפי שם או מייל</label>
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
        <input
          id="acc-search"
          className="tf-input"
          placeholder="חיפוש לפי שם או מייל"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingRight: "2.5rem" }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map(m => (
          <div
            key={m.id}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm"
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              {m.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{m.name}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {m.email} • {m.role === "manager" ? "מנהל" : "סטודנט"}
              </div>
            </div>
            <label htmlFor={`role-${m.id}`} className="sr-only">{`תפקיד עבור ${m.name}`}</label>
            <select
              id={`role-${m.id}`}
              className="tf-input !w-auto text-xs"
              value={m.role}
              onChange={e => {
                try {
                  updateAuthUserRole(m.id, e.target.value as "trainee" | "manager");
                  toast.success("תפקיד עודכן");
                } catch (err) {
                  toast.error((err as Error)?.message || "עדכון תפקיד נכשל");
                }
              }}
            >
              <option value="trainee">סטודנט</option>
              <option value="manager">מנהל</option>
            </select>
            <button
              aria-label={`מחק את ${m.name}`}
              onClick={() => {
                try {
                  deleteAuthUser(m.id);
                  toast.success("משתמש נמחק");
                } catch (err) {
                  toast.error((err as Error)?.message || "מחיקת המשתמש נכשלה");
                }
              }}
              className="p-2 rounded-lg"
              style={{ background: "rgba(220, 38, 38, 0.12)", color: "var(--destructive)" }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={exportRoster}
        className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
        style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
      >
        <Download size={15} /> ייצוא רשימת חשבונות
      </button>
    </div>
  );
}
