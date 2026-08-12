import { useEffect, useMemo, useRef, useState, type ChangeEventHandler, type RefObject } from "react";
import { useApp, type QuestionBankData, type QuestionBankEntry } from "@/contexts/AppContext";
import { Users, BarChart2, BookOpen, TrendingUp, Award, Clock, Search, Shield, ShieldAlert, Upload, Download, Trash2, Save, PlusCircle } from "lucide-react";
import { toast } from "sonner";

type Tab = "team" | "reports" | "content";

export default function ManagerScreen() {
  const {
    user,
    sessions,
    importQuestionBank,
    importQuestionBankCategories,
    questionBankLoaded,
    questionBankData,
    replaceQuestionBank,
    deleteQuestionBankCategory,
    resetQuestionBankContent,
    authUsers,
    createAuthUser,
    updateAuthUserRole,
    deleteAuthUser,
  } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>("team");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"trainee" | "manager">("trainee");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  if (user?.role !== "manager") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6" style={{ direction: "rtl" }}>
        <Shield size={48} style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
        <h2 className="t-title" style={{ color: "var(--foreground)" }}>
          גישה מוגבלת
        </h2>
        <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>
          מסך זה זמין למנהלים בלבד
        </p>
      </div>
    );
  }

  const filteredMembers = authUsers.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  const stats = useMemo(() => {
    const totalMembers = authUsers.length;
    const activeThisWeek = authUsers.length;
    const avgTeamScore = sessions.length > 0 ? Math.round(sessions.reduce((s, x) => s + x.score, 0) / sessions.length) : 0;
    const totalSessions = sessions.length;
    return { totalMembers, activeThisWeek, avgTeamScore, totalSessions };
  }, [authUsers, sessions]);

  const addMember = async () => {
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name || !email || !newPassword) {
      toast.error("נא להזין שם, מייל וסיסמה");
      return;
    }
    setIsAddingMember(true);
    try {
      await createAuthUser({ name, email, password: newPassword, role: newRole });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("trainee");
      toast.success("משתמש נוסף בהצלחה");
    } catch (err) {
      toast.error((err as Error)?.message || "יצירת המשתמש נכשלה");
    } finally {
      setIsAddingMember(false);
    }
  };

  const exportReportCsv = () => {
    // Quote every field: names and arena titles routinely contain
    // commas and quotes, which would otherwise shift columns.
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const row = (...cells: unknown[]) => cells.map(cell).join(",");

    const rows = [
      row("member_name", "email", "role"),
      ...authUsers.map(m => row(m.name, m.email, m.role)),
      "",
      row("session_id", "arena", "mode", "score", "is_demo", "start_time", "end_time"),
      ...sessions.map(s =>
        row(
          s.id,
          s.arenaName,
          s.mode,
          s.score,
          s.isDemo ? "yes" : "no",
          new Date(s.startTime).toISOString(),
          s.endTime ? new Date(s.endTime).toISOString() : ""
        )
      ),
    ];

    // Excel needs a BOM to read UTF-8 Hebrew correctly.
    const blob = new Blob(["﻿", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "infinitycloser-manager-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("דוח CSV יוצא בהצלחה");
  };

  const handleImportJson: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await importQuestionBank(f);
      toast.success("מאגר השאלות עודכן");
    } catch (err) {
      toast.error(`ייבוא JSON נכשל: ${(err as Error)?.message || "שגיאה לא ידועה"}`);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ direction: "rtl" }}>
      <div className="flex-shrink-0 masthead px-4 sm:px-6 pt-6 pb-0">
        <div className="screen-body-wide">
          <p className="eyebrow mb-2">ניהול צוות, דוחות ותוכן</p>
          <h1 className="t-title mb-5">מרכז פיקוד</h1>

          {/* Tabs sit on the masthead rule: the live one is marked by
              an ink underline rather than a raised pill. */}
          <div className="flex gap-6" style={{ marginBottom: "-2px" }}>
            {([
              { id: "team" as Tab, label: "צוות", icon: Users },
              { id: "reports" as Tab, label: "דוחות", icon: BarChart2 },
              { id: "content" as Tab, label: "תוכן", icon: BookOpen },
            ]).map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  aria-current={isActive ? "page" : undefined}
                  className="flex items-center gap-1.5 pb-2.5 text-sm font-semibold"
                  style={{
                    color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                    borderBottom: `2px solid ${isActive ? "var(--foreground)" : "transparent"}`,
                    transition: "color var(--dur-fast) var(--ease-settle)",
                  }}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:px-6 screen-body-wide">
        {activeTab === "team" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "חברי צוות", value: stats.totalMembers.toString(), icon: Users, color: "var(--primary)" },
                { label: "פעילים", value: stats.activeThisWeek.toString(), icon: TrendingUp, color: "var(--success)" },
                { label: "ממוצע צוות", value: `${stats.avgTeamScore}%`, icon: Award, color: "var(--warning)" },
                { label: "סה\"כ מפגשים", value: stats.totalSessions.toString(), icon: Clock, color: "var(--destructive)" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="stat-card">
                  <div className="flex items-center gap-2 mb-2"><Icon size={14} style={{ color }} /><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</span></div>
                  <div className="t-numeric text-2xl font-black" style={{ color: "var(--foreground)" }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-2" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
              <input className="tf-input" placeholder="שם מלא" value={newName} onChange={e => setNewName(e.target.value)} />
              <input className="tf-input" placeholder="מייל" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              <input className="tf-input" placeholder="סיסמה" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <select className="tf-input" value={newRole} onChange={e => setNewRole(e.target.value as "trainee" | "manager")}>
                <option value="trainee">סטודנט</option>
                <option value="manager">מנהל</option>
              </select>
              <button
                onClick={addMember}
                disabled={isAddingMember}
                className="rounded-xl px-3 py-2 font-semibold text-sm"
                style={{
                  background: isAddingMember ? "var(--muted)" : "var(--primary)",
                  color: isAddingMember ? "var(--muted-foreground)" : "var(--primary-foreground)",
                }}
              >
                {isAddingMember ? "מוסיף..." : "הוסף משתמש"}
              </button>
            </div>

            {/* Be explicit about what this account system is and isn't. */}
            <div
              className="rounded-xl p-3 flex items-start gap-2"
              style={{ background: "var(--tint-primary-weak)", border: "1px solid var(--line-primary)" }}
            >
              <ShieldAlert size={16} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                המשתמשים נשמרים בדפדפן הזה בלבד (סיסמאות מגובבות, לא בטקסט גלוי) ואינם
                מסתנכרנים בין מכשירים. זהו שער תצוגה — אל תאחסן מאחוריו מידע רגיש.
              </p>
            </div>

            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
              <input className="tf-input" placeholder="חיפוש לפי שם או מייל" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: "2.5rem" }} />
            </div>

            <div className="flex flex-col gap-2">
              {filteredMembers.map(m => (
                <div key={m.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
                  <div className="w-9 h-9 flex items-center justify-center text-sm flex-shrink-0" style={{ background: "var(--foreground)", color: "var(--background)", fontFamily: "var(--font-display)", fontWeight: 700 }}>{m.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{m.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{m.email} • {m.role === "manager" ? "מנהל" : "סטודנט"}</div>
                  </div>
                  <select
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
                    onClick={() => {
                      try {
                        deleteAuthUser(m.id);
                        toast.success("משתמש נמחק");
                      } catch (err) {
                        toast.error((err as Error)?.message || "מחיקת המשתמש נכשלה");
                      }
                    }}
                    className="p-2 rounded-lg"
                    style={{ background: "var(--tint-danger-weak)", color: "var(--destructive)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
              <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>סקירת סשנים</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="stat-card"><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>סה\"כ סשנים</span><span className="t-numeric text-2xl font-black" style={{ color: "var(--foreground)" }}>{sessions.length}</span></div>
                <div className="stat-card"><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>ציון ממוצע</span><span className="t-numeric text-2xl font-black" style={{ color: "var(--foreground)" }}>{sessions.length ? Math.round(sessions.reduce((s, x) => s + x.score, 0) / sessions.length) : 0}%</span></div>
                <div className="stat-card"><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>זירות פעילות</span><span className="t-numeric text-2xl font-black" style={{ color: "var(--foreground)" }}>{new Set(sessions.map(s => s.arenaName)).size}</span></div>
              </div>
            </div>
            <button onClick={exportReportCsv} className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}>
              <Download size={15} /> ייצוא דוח CSV
            </button>
          </div>
        )}

        {activeTab === "content" && (
          <ContentTab
            questionBankLoaded={questionBankLoaded}
            questionBankData={questionBankData}
            replaceQuestionBank={replaceQuestionBank}
            importQuestionBankCategories={importQuestionBankCategories}
            deleteQuestionBankCategory={deleteQuestionBankCategory}
            resetQuestionBankContent={resetQuestionBankContent}
            importInputRef={importInputRef}
            onImportJson={handleImportJson}
          />
        )}
      </div>
    </div>
  );
}

function ContentTab({
  questionBankLoaded,
  questionBankData,
  replaceQuestionBank,
  importQuestionBankCategories,
  deleteQuestionBankCategory,
  resetQuestionBankContent,
  importInputRef,
  onImportJson,
}: {
  questionBankLoaded: boolean;
  questionBankData: QuestionBankData | null;
  replaceQuestionBank: (data: QuestionBankData) => void;
  importQuestionBankCategories: (file: File) => Promise<void>;
  deleteQuestionBankCategory: (categoryName: string) => void;
  resetQuestionBankContent: () => Promise<void>;
  importInputRef: RefObject<HTMLInputElement | null>;
  onImportJson: ChangeEventHandler<HTMLInputElement>;
}) {
  const categoryNames = useMemo(
    () => Object.keys(questionBankData?.categories || {}).sort((a, b) => a.localeCompare(b, "he")),
    [questionBankData]
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number>(0);
  const [draft, setDraft] = useState<QuestionBankEntry | null>(null);
  const categoryImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!categoryNames.length) {
      setSelectedCategory("");
      return;
    }
    if (!selectedCategory || !categoryNames.includes(selectedCategory)) {
      setSelectedCategory(categoryNames[0]);
    }
  }, [categoryNames, selectedCategory]);

  const selectedQuestions = (questionBankData?.categories?.[selectedCategory]?.questions || []) as QuestionBankEntry[];
  const selectedQuestion = selectedQuestions[selectedQuestionIndex] || null;

  useEffect(() => {
    if (!selectedQuestion) {
      setDraft(null);
      return;
    }
    setDraft({
      ...selectedQuestion,
      options: Array.isArray(selectedQuestion.options) ? selectedQuestion.options.slice(0, 4) : ["", "", "", ""],
    });
  }, [selectedQuestion, selectedCategory, selectedQuestionIndex]);

  const writeBank = (mutator: (copy: QuestionBankData) => void) => {
    if (!questionBankData) return;
    const copy: QuestionBankData = JSON.parse(JSON.stringify(questionBankData));
    mutator(copy);
    replaceQuestionBank(copy);
  };

  const addQuestion = () => {
    if (!selectedCategory) return;
    writeBank(copy => {
      const cat = copy.categories?.[selectedCategory];
      if (!cat) return;
      const nextId = `${selectedCategory}-${Date.now()}`;
      if (!Array.isArray(cat.questions)) cat.questions = [];
      cat.questions.unshift({
        id: nextId,
        question: "שאלה חדשה",
        options: ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
        correctIndex: 0,
        explanation: "",
        coachNote: "",
        difficulty: "medium",
        status: "active",
      });
    });
    setSelectedQuestionIndex(0);
    toast.success("שאלה חדשה נוספה");
  };

  const deleteQuestion = () => {
    if (!selectedCategory) return;
    writeBank(copy => {
      const cat = copy.categories?.[selectedCategory];
      if (!cat?.questions?.length) return;
      cat.questions.splice(selectedQuestionIndex, 1);
    });
    setSelectedQuestionIndex(0);
    toast.success("השאלה נמחקה");
  };

  const saveDraft = () => {
    if (!selectedCategory || !draft) return;
    const options = (draft.options || []).map(o => String(o || "").trim()).filter(Boolean);
    if (!draft.question || options.length < 2) {
      toast.error("יש להזין שאלה ולפחות 2 אפשרויות");
      return;
    }
    writeBank(copy => {
      const cat = copy.categories?.[selectedCategory];
      if (!cat?.questions) return;
      const safeCorrect = Math.max(0, Math.min(options.length - 1, Number(draft.correctIndex) || 0));
      cat.questions[selectedQuestionIndex] = {
        ...cat.questions[selectedQuestionIndex],
        ...draft,
        options,
        correctIndex: safeCorrect,
        status: draft.status || "active",
      };
    });
    toast.success("השאלה נשמרה");
  };

  const exportJson = () => {
    if (!questionBankData) return;
    const blob = new Blob([JSON.stringify(questionBankData, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "question_bank_infinitycloser.updated.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("קובץ JSON מעודכן יוצא");
  };

  const handleCategoryImport: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await importQuestionBankCategories(f);
      toast.success("הקטגוריות נוספו ונשמרו קבוע");
    } catch (err) {
      toast.error(`ייבוא קטגוריה נכשל: ${(err as Error)?.message || "שגיאה לא ידועה"}`);
    } finally {
      e.target.value = "";
    }
  };

  const handleDeleteCategory = () => {
    if (!selectedCategory) return;
    const ok = window.confirm(`למחוק את הקטגוריה "${selectedCategory}"?`);
    if (!ok) return;
    deleteQuestionBankCategory(selectedCategory);
    setSelectedQuestionIndex(0);
    toast.success("הקטגוריה נמחקה");
  };

  const handleResetAll = async () => {
    const ok = window.confirm("לאפס את כל תוכן המאגר? הפעולה תסיר שינויים שנשמרו מקומית.");
    if (!ok) return;
    await resetQuestionBankContent();
    setSelectedQuestionIndex(0);
    toast.success("תוכן המאגר אופס");
  };

  return (
    <div className="flex flex-col gap-8">
      <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportJson} />
      <input ref={categoryImportInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleCategoryImport} />

      <PublishPanel />

      <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-sm" style={{ color: "var(--foreground)" }}>עריכת JSON</h3>
          <span className="text-xs font-semibold" style={{ color: questionBankLoaded ? "var(--success)" : "var(--warning)" }}>
            {questionBankLoaded ? "מאגר פעיל" : "מצב דמו"}
          </span>
        </div>

        {!questionBankData || !categoryNames.length ? (
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            אין מאגר JSON לעריכה. ייבא קובץ כדי להתחיל.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-3">
            <div className="rounded-xl p-3 max-h-[460px] overflow-y-auto" style={{ background: "var(--background)", border: "1px solid var(--tf-border)" }}>
              <div className="text-xs font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>קטגוריות</div>
              <select className="tf-input mb-2" value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSelectedQuestionIndex(0); }}>
                {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="text-xs font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>
                שאלות ({selectedQuestions.length})
              </div>
              <div className="flex gap-1 mb-2">
                <button onClick={handleDeleteCategory} className="px-2 py-1 rounded-lg text-[11px] font-bold" style={{ background: "var(--tint-danger-weak)", color: "var(--destructive)" }}>
                  מחק קטגוריה
                </button>
                <button onClick={handleResetAll} className="px-2 py-1 rounded-lg text-[11px] font-bold" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}>
                  איפוס מלא
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {selectedQuestions.map((q, idx) => (
                  <button
                    key={q.id || idx}
                    onClick={() => setSelectedQuestionIndex(idx)}
                    className="text-right p-2 rounded-lg text-xs"
                    style={{
                      background: idx === selectedQuestionIndex ? "var(--accent)" : "transparent",
                      color: idx === selectedQuestionIndex ? "var(--accent-foreground)" : "var(--foreground)",
                      border: "1px solid var(--tf-border)",
                    }}
                  >
                    {(q.question || `שאלה ${idx + 1}`).slice(0, 70)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-3" style={{ background: "var(--background)", border: "1px solid var(--tf-border)" }}>
              {draft ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>נוסח שאלה</label>
                  <textarea className="tf-input min-h-[88px]" value={draft.question || ""} onChange={e => setDraft({ ...draft, question: e.target.value })} />

                  {(draft.options || []).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs w-5" style={{ color: "var(--muted-foreground)" }}>{i + 1}</span>
                      <input
                        className="tf-input"
                        value={opt || ""}
                        onChange={e => {
                          const next = [...(draft.options || ["", "", "", ""])];
                          next[i] = e.target.value;
                          setDraft({ ...draft, options: next });
                        }}
                      />
                    </div>
                  ))}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      תשובה נכונה
                      <select className="tf-input mt-1" value={Number(draft.correctIndex) || 0} onChange={e => setDraft({ ...draft, correctIndex: Number(e.target.value) })}>
                        {[0, 1, 2, 3].map(v => <option key={v} value={v}>{`אפשרות ${v + 1}`}</option>)}
                      </select>
                    </label>
                    <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      רמת קושי
                      <select className="tf-input mt-1" value={(draft.difficulty as string) || "medium"} onChange={e => setDraft({ ...draft, difficulty: e.target.value })}>
                        <option value="easy">easy</option>
                        <option value="medium">medium</option>
                        <option value="hard">hard</option>
                      </select>
                    </label>
                  </div>

                  <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>הסבר</label>
                  <textarea className="tf-input min-h-[82px]" value={draft.explanation || ""} onChange={e => setDraft({ ...draft, explanation: e.target.value })} />
                  <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>הערת מאמן</label>
                  <textarea className="tf-input min-h-[72px]" value={draft.coachNote || ""} onChange={e => setDraft({ ...draft, coachNote: e.target.value })} />

                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={saveDraft} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                      <Save size={13} /> שמור שאלה
                    </button>
                    <button onClick={addQuestion} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}>
                      <PlusCircle size={13} /> הוסף שאלה
                    </button>
                    <button onClick={deleteQuestion} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1" style={{ background: "var(--tint-danger-weak)", color: "var(--destructive)" }}>
                      <Trash2 size={13} /> מחק שאלה
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>בחר שאלה מהרשימה כדי לערוך.</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <button onClick={() => importInputRef.current?.click()} className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
          <Upload size={15} /> ייבוא JSON חדש
        </button>
        <button onClick={exportJson} className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}>
          <Download size={15} /> ייצוא JSON מעודכן
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* The old inline #b7924f was the pre-rebrand gold; it survived
            two palette changes because it was never a token. */}
        <button onClick={() => categoryImportInputRef.current?.click()} className="py-3 font-bold text-sm flex items-center justify-center gap-2" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>
          <Upload size={15} /> ייבוא קטגוריה ושמירה קבועה
        </button>
        <button onClick={handleResetAll} className="py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2" style={{ background: "var(--tint-danger-weak)", color: "var(--destructive)", border: "1px solid var(--line-danger)" }}>
          <Trash2 size={15} /> מחיקה ואיפוס תוכן
        </button>
      </div>
    </div>
  );
}

// ── Publish panel ─────────────────────────────────────────────
/**
 * Publishing is what makes an upload reach the students. Everything
 * else on this screen edits a copy that lives in this browser only,
 * which is exactly the confusion this panel exists to remove: it
 * states which bank is live, and gives the two verbs that change it.
 *
 * The token is checked on the server (api/question-bank.ts). Holding
 * it here is a convenience so it isn't retyped on every publish.
 */
function PublishPanel() {
  const {
    bankSource,
    sharedBankExists,
    adminToken,
    setAdminToken,
    publishQuestionBank,
    unpublishQuestionBank,
    clearImportedQuestionBank,
  } = useApp();

  const publishInputRef = useRef<HTMLInputElement | null>(null);
  const [tokenDraft, setTokenDraft] = useState(adminToken);
  const [busy, setBusy] = useState<"publish" | "unpublish" | null>(null);

  const SOURCE_LABEL: Record<typeof bankSource, string> = {
    shared: "מאגר משותף — פעיל לכל התלמידים",
    local: "מאגר מקומי — רק בדפדפן הזה",
    bundled: "מאגר מובנה — נבנה יחד עם האתר",
    none: "אין מאגר — תוכן הדגמה",
  };

  const onPublish: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("publish");
    try {
      await publishQuestionBank(file);
      toast.success("המאגר פורסם — כל התלמידים יראו אותו");
    } catch (err) {
      toast.error((err as Error)?.message || "פרסום נכשל");
    } finally {
      setBusy(null);
    }
  };

  const onUnpublish = async () => {
    setBusy("unpublish");
    try {
      await unpublishQuestionBank();
      toast.success("הפרסום בוטל — חוזרים למאגר המובנה");
    } catch (err) {
      toast.error((err as Error)?.message || "ביטול הפרסום נכשל");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <div className="section-head">
        <span className="section-head-index">01</span>
        <h3 className="section-head-title">פרסום לכל התלמידים</h3>
        <span
          className="section-head-tail eyebrow"
          style={{ color: bankSource === "shared" ? "var(--success)" : "var(--muted-foreground)" }}
        >
          {bankSource === "shared" ? "פעיל" : sharedBankExists ? "מוסתר" : "לא פורסם"}
        </span>
      </div>

      <input
        ref={publishInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onPublish}
      />

      <div className="data-list mb-4">
        <div className="data-row">
          <span className="data-row-label">המאגר שמוצג כרגע</span>
          <span className="data-row-value">{SOURCE_LABEL[bankSource]}</span>
        </div>
      </div>

      {/* A local import silently shadows the published bank for the
          person who set it — the one case where the manager and the
          students are looking at different questions. */}
      {bankSource === "local" && sharedBankExists && (
        <div
          role="status"
          className="p-4 mb-4 flex items-start gap-3"
          style={{ background: "var(--tint-primary-weak)", borderInlineStart: "3px solid var(--accent)" }}
        >
          <ShieldAlert size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm mb-3" style={{ color: "var(--foreground)" }}>
              קיים מאגר מקומי בדפדפן הזה שמסתיר את המאגר המשותף. התלמידים רואים משהו אחר ממה שאתה רואה.
            </p>
            <button onClick={clearImportedQuestionBank} className="btn-chip">
              הצג את המאגר המשותף
            </button>
          </div>
        </div>
      )}

      <label className="block text-sm mb-4">
        <span className="eyebrow">טוקן ניהול</span>
        <div className="flex gap-2 mt-1">
          <input
            className="tf-input"
            type="password"
            autoComplete="off"
            placeholder={adminToken ? "•••••••• (נשמר)" : "ADMIN_UPLOAD_TOKEN"}
            value={tokenDraft}
            onChange={e => setTokenDraft(e.target.value)}
            style={{ direction: "ltr", textAlign: "left" }}
          />
          <button
            onClick={() => {
              setAdminToken(tokenDraft);
              toast.success(tokenDraft.trim() ? "הטוקן נשמר בדפדפן הזה" : "הטוקן נמחק");
            }}
            className="btn-chip flex-shrink-0"
          >
            שמור
          </button>
        </div>
        <p className="t-caption mt-1.5" style={{ color: "var(--muted-foreground)" }}>
          מוגדר כמשתנה סביבה ADMIN_UPLOAD_TOKEN ב-Vercel. הבדיקה רצה בשרת.
        </p>
      </label>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => publishInputRef.current?.click()}
          disabled={!adminToken || busy !== null}
          className="btn-primary text-sm"
        >
          <Upload size={15} />
          {busy === "publish" ? "מפרסם..." : "פרסם קובץ JSON"}
        </button>
        {sharedBankExists && (
          <button
            onClick={onUnpublish}
            disabled={!adminToken || busy !== null}
            className="btn-secondary text-sm"
          >
            {busy === "unpublish" ? "מבטל..." : "בטל פרסום"}
          </button>
        )}
      </div>
    </section>
  );
}
