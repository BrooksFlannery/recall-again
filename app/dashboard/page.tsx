"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { MIN_FACTS_FOR_QUIZ } from "@/constants/quiz";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
import { useCommandMode } from "../components/command-mode-context";
import { CommandJumpHint } from "../components/command-jump-hint";
import { Copy, Plus, Save, Trash2 } from "lucide-react";

const DASHBOARD_ADD_HINT_ID = "__add__";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const utils = trpc.useUtils();

  const { data: facts, isLoading: factsLoading } = trpc.fact.list.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  const createMutation = trpc.fact.create.useMutation({
    onSuccess: () => {
      utils.fact.list.invalidate();
    },
  });
  const updateMutation = trpc.fact.update.useMutation({
    onSuccess: () => {
      utils.fact.list.invalidate();
    },
  });
  const deleteMutation = trpc.fact.delete.useMutation({
    onSuccess: () => {
      utils.fact.list.invalidate();
    },
  });

  const createManualQuizMutation = trpc.quiz.createManual.useMutation({
    onSuccess: (quiz) => {
      router.push(`/quiz/${quiz.id}`);
    },
  });

  const commandMode = useCommandMode();
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [focusedContainer, setFocusedContainer] = useState<
    "add" | string | null
  >(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const addFactTextareaRef = useRef<HTMLTextAreaElement>(null);
  const addFormRef = useRef<HTMLFormElement>(null);
  const factFormRefs = useRef<Record<string, HTMLFormElement | null>>({});
  const factTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>(
    {},
  );
  const hasFocusedAddFactRef = useRef(false);

  const canStartQuiz = (facts?.length ?? 0) >= MIN_FACTS_FOR_QUIZ;

  const dashboardJumpHints = useMemo(() => {
    if (!commandMode || !facts?.length) {
      return {} as Record<string, ("J" | "K")[]>;
    }
    const hints: Record<string, ("J" | "K")[]> = {};
    const push = (id: string, k: "J" | "K") => {
      const arr = hints[id] ?? (hints[id] = []);
      if (!arr.includes(k)) arr.push(k);
    };

    const n = facts.length;

    /** Nothing focused: same idea as quizzes — J on top (add), K on bottom (last fact). */
    if (focusedContainer == null) {
      push(DASHBOARD_ADD_HINT_ID, "J");
      push(facts[n - 1].id, "K");
      return hints;
    }

    if (focusedContainer === "add") {
      push(facts[0].id, "J");
      return hints;
    }

    const idx = facts.findIndex((f) => f.id === focusedContainer);
    if (idx < 0) {
      push(facts[0].id, "J");
      push(facts[n - 1].id, "K");
      return hints;
    }

    if (idx === 0) {
      push(DASHBOARD_ADD_HINT_ID, "K");
    } else {
      push(facts[idx - 1].id, "K");
    }
    if (idx < n - 1) {
      push(facts[idx + 1].id, "J");
    }
    return hints;
  }, [commandMode, facts, focusedContainer]);

  useLayoutEffect(() => {
    const el = addFactTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [newContent]);

  useLayoutEffect(() => {
    if (!editingId) return;
    const el = editTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [editingId, editContent]);

  useLayoutEffect(() => {
    if (!facts) return;
    const minHeight = 72;
    for (const fact of facts) {
      if (fact.id === editingId) continue;
      const el = factTextareaRefs.current[fact.id];
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
    }
  }, [facts, editingId]);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.replace("/");
    }
  }, [session, sessionPending, router]);

  useEffect(() => {
    if (sessionPending || !session?.user || hasFocusedAddFactRef.current)
      return;
    hasFocusedAddFactRef.current = true;
    addFactTextareaRef.current?.focus();
  }, [sessionPending, session?.user]);

  useEffect(() => {
    if (editingId) editTextareaRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (
        e.key === "Backspace" &&
        focusedContainer &&
        focusedContainer !== "add"
      ) {
        e.preventDefault();
        handleDelete(focusedContainer);
        return;
      }

      if (e.key === "j" || e.key === "J") {
        if (focusedContainer == null) {
          e.preventDefault();
          addFactTextareaRef.current?.focus();
          setFocusedContainer("add");
          return;
        }
        if (!facts?.length) return;
        e.preventDefault();
        if (focusedContainer === "add") {
          factTextareaRefs.current[facts[0].id]?.focus();
          setFocusedContainer(facts[0].id);
          return;
        }
        const idx = facts.findIndex((f) => f.id === focusedContainer);
        if (idx < 0) {
          factTextareaRefs.current[facts[0].id]?.focus();
          setFocusedContainer(facts[0].id);
          return;
        }
        if (idx < facts.length - 1) {
          const nextId = facts[idx + 1].id;
          factTextareaRefs.current[nextId]?.focus();
          setFocusedContainer(nextId);
        }
        return;
      }

      if (e.key === "k" || e.key === "K") {
        if (focusedContainer == null) {
          e.preventDefault();
          if (facts?.length) {
            const lastId = facts[facts.length - 1].id;
            factTextareaRefs.current[lastId]?.focus();
            setFocusedContainer(lastId);
          } else {
            addFactTextareaRef.current?.focus();
            setFocusedContainer("add");
          }
          return;
        }
        if (!facts?.length) return;
        e.preventDefault();
        if (focusedContainer === "add") {
          addFactTextareaRef.current?.focus();
          setFocusedContainer("add");
          return;
        }
        const idx = facts.findIndex((f) => f.id === focusedContainer);
        if (idx < 0) {
          const lastId = facts[facts.length - 1].id;
          factTextareaRefs.current[lastId]?.focus();
          setFocusedContainer(lastId);
          return;
        }
        if (idx === 0) {
          addFactTextareaRef.current?.focus();
          setFocusedContainer("add");
          return;
        }
        const prevId = facts[idx - 1].id;
        factTextareaRefs.current[prevId]?.focus();
        setFocusedContainer(prevId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [focusedContainer, facts]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const content = newContent.trim();
    if (!content) return;
    createMutation.mutate(
      { content },
      {
        onSuccess: () => setNewContent(""),
      },
    );
  }

  function startEdit(id: string, content: string) {
    setEditingId(id);
    setEditContent(content);
  }

  function handleUpdate(e: React.FormEvent, id: string) {
    e.preventDefault();
    const content = editContent.trim();
    if (!content) return;
    updateMutation.mutate(
      { id, content },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditContent("");
        },
      },
    );
  }

  function handleDelete(id: string) {
    const index = facts?.findIndex((f) => f.id === id) ?? -1;
    const focusTarget: "add" | string =
      index >= 0 && facts
        ? (facts[index + 1]?.id ?? facts[index - 1]?.id ?? "add")
        : "add";

    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          if (editingId === id) {
            setEditingId(null);
            setEditContent("");
          }
          utils.fact.list.invalidate();
          requestAnimationFrame(() => {
            if (focusTarget === "add") {
              addFactTextareaRef.current?.focus();
              setFocusedContainer("add");
            } else {
              factTextareaRefs.current[focusTarget]?.focus();
              setFocusedContainer(focusTarget);
            }
          });
        },
      },
    );
  }

  function isModEnter(e: React.KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey)) return false;
    return (
      e.key === "Enter" ||
      e.key === "NumpadEnter" ||
      e.code === "Enter" ||
      e.code === "NumpadEnter"
    );
  }

  /** Cmd/Ctrl+Enter must not use requestSubmit: fact rows often have no submit button (copy/delete only). */
  function handleAddFactTextareaKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (!isModEnter(e)) return;
    e.preventDefault();
    const content = newContent.trim();
    if (!content || createMutation.isPending) return;
    createMutation.mutate({ content }, { onSuccess: () => setNewContent("") });
  }

  function handleFactTextareaKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    factId: string,
    savedContent: string,
  ) {
    if (!isModEnter(e)) return;
    e.preventDefault();
    if (editingId !== factId) {
      copyFactToClipboard(savedContent);
      return;
    }
    const content = editContent.trim();
    if (!content || updateMutation.isPending) return;
    updateMutation.mutate(
      { id: factId, content },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditContent("");
        },
      },
    );
  }

  function isFocusInAnyContainer(): boolean {
    const el = document.activeElement;
    if (!el || !(el instanceof Node)) return false;
    if (addFormRef.current?.contains(el)) return true;
    for (const form of Object.values(factFormRefs.current)) {
      if (form?.contains(el)) return true;
    }
    return false;
  }

  const factButtonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    boxSizing: "border-box",
    minWidth: "2.75rem",
    minHeight: "2.25rem",
    background: "var(--color-interactive-bg)",
    color: "#000",
    border: "1px solid var(--color-border)",
    fontSize: "0.8125rem",
    cursor: "pointer",
  };
  const factDeleteButtonStyle: React.CSSProperties = {
    ...factButtonBase,
    borderRight: "none",
    borderBottom: "none",
    borderRadius: "6px 0 0 0",
  };
  const factSecondaryButtonStyle: React.CSSProperties = {
    ...factButtonBase,
    borderRight: "none",
    borderBottom: "none",
    borderRadius: "0 0 6px 0",
  };

  function copyFactToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
  }

  const borderValue = "1px solid var(--color-border)";
  const hasFactList = !factsLoading && !!(facts?.length);
  const tabbedQuizMeHeader = hasFactList && canStartQuiz;
  const factTextareaStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    margin: 0,
    boxSizing: "border-box",
    padding: "0.5rem 0.75rem",
    border: "none",
    outline: "none",
    fontSize: "0.875rem",
    resize: "none",
    minHeight: "4.5rem",
    background: "#fff",
  };

  if (sessionPending || !session?.user) {
    return (
      <main style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem 1.5rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          gap: "1rem",
          width: "100%",
          minHeight: "var(--page-header-row-min-height)",
          marginBottom: tabbedQuizMeHeader ? 0 : "0.25rem",
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            margin: 0,
            padding: 0,
            lineHeight: 1.2,
          }}
        >
          What do you know?
        </h1>
        {canStartQuiz ? (
          <button
            type="button"
            onClick={() => createManualQuizMutation.mutate({ factCount: 10 })}
            disabled={createManualQuizMutation.isPending}
            aria-busy={createManualQuizMutation.isPending}
            aria-label="Start a manual quiz with random facts"
            title="Start a manual quiz with up to 10 random facts"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "8px 14px",
              marginLeft: "auto",
              background: "var(--color-interactive-bg)",
              color: "#000",
              border: "1px solid var(--color-border)",
              borderBottom: tabbedQuizMeHeader
                ? "none"
                : "1px solid var(--color-border)",
              borderRadius: tabbedQuizMeHeader ? "6px 6px 0 0" : "6px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: createManualQuizMutation.isPending ? "wait" : "pointer",
              opacity: createManualQuizMutation.isPending ? 0.85 : 1,
            }}
          >
            {createManualQuizMutation.isPending ? (
              <span
                className="add-btn-spinner add-btn-spinner-on-light"
                aria-hidden
              />
            ) : null}
            Quiz me
          </button>
        ) : null}
      </div>

      <section style={{ marginBottom: "2rem" }}>
        <div className="command-jump-hint-anchor">
          {dashboardJumpHints[DASHBOARD_ADD_HINT_ID]?.length ? (
            <CommandJumpHint keys={dashboardJumpHints[DASHBOARD_ADD_HINT_ID]} />
          ) : null}
          <form
          ref={addFormRef}
          onSubmit={handleCreate}
          style={{
            display: "flex",
            flexDirection: "column",
            border: borderValue,
            borderRadius: tabbedQuizMeHeader ? "6px 0 6px 6px" : "6px",
            overflow: "hidden",
            position: "relative",
            zIndex: focusedContainer === "add" ? 1 : undefined,
            boxShadow:
              focusedContainer === "add"
                ? "0 0 0 1px var(--color-border)"
                : "none",
          }}
        >
          <textarea
            ref={addFactTextareaRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onFocus={() => setFocusedContainer("add")}
            onBlur={() => {
              setTimeout(() => {
                if (!isFocusInAnyContainer()) {
                  setFocusedContainer(null);
                }
              }, 0);
            }}
            onKeyDown={handleAddFactTextareaKeyDown}
            placeholder="Enter a fact…"
            maxLength={10000}
            rows={3}
            style={{
              display: "block",
              width: "100%",
              margin: 0,
              boxSizing: "border-box",
              padding: "0.5rem 0.75rem",
              border: "none",
              outline: "none",
              borderRadius: tabbedQuizMeHeader ? "6px 0 0 0" : "6px 6px 0 0",
              fontSize: "0.875rem",
              resize: "none",
              minHeight: "4.5rem",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "flex-end",
              minHeight: "2.5rem",
              padding: "0.25rem 0 0",
              borderRadius: "0 0 6px 6px",
              background: "#fff",
            }}
          >
            <button
              type="submit"
              disabled={createMutation.isPending || !newContent.trim()}
              aria-busy={createMutation.isPending}
              aria-label="Add fact"
              title="Add fact (⌘↵)"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 10px",
                boxSizing: "border-box",
                minWidth: "2.75rem",
                minHeight: "2.25rem",
                background: "var(--color-interactive-bg)",
                color: "#000",
                border: "1px solid var(--color-border)",
                borderBottom: "none",
                borderRight: "none",
                borderRadius: "6px 0 0 0",
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              {createMutation.isPending ? (
                <span
                  className="add-btn-spinner add-btn-spinner-on-light"
                  aria-hidden
                />
              ) : commandMode && focusedContainer === "add" ? (
                "↵"
              ) : (
                <Plus size={18} aria-hidden />
              )}
            </button>
          </div>
        </form>
        </div>
        {createMutation.isError && (
          <p
            style={{
              color: "#b91c1c",
              fontSize: "0.875rem",
              marginTop: "0.5rem",
            }}
          >
            {createMutation.error.message}
          </p>
        )}
      </section>

      <section>
        {factsLoading ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
        ) : !facts?.length ? null : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {facts.map((fact, index) => {
              const isTop = index === 0;
              const isBottom = index === facts.length - 1;
              const isOnlyFact = facts.length === 1;
              const containerRadius = isOnlyFact
                ? "6px"
                : isTop
                  ? "6px 6px 0 0"
                  : isBottom
                    ? "0 0 6px 6px"
                    : 0;
              const barRadius = isBottom || isOnlyFact ? "0 0 6px 6px" : 0;
              const deleteButtonRadius = "6px 0 0 0";
              const editButtonRadius = isBottom || isOnlyFact ? "0 0 6px 0" : 0;
              const formContainerStyle: React.CSSProperties = {
                display: "flex",
                flexDirection: "column",
                borderLeft: borderValue,
                borderRight: borderValue,
                borderBottom: borderValue,
                borderTop: isTop ? borderValue : "none",
                borderRadius: containerRadius,
                overflow: "hidden",
                position: "relative",
                ...(focusedContainer === fact.id ? { zIndex: 1 } : {}),
                boxShadow:
                  focusedContainer === fact.id
                    ? "0 0 0 1px var(--color-border)"
                    : "none",
              };
              return (
                <li
                  key={fact.id}
                  className="command-jump-hint-anchor"
                  style={{
                    position: "relative",
                  }}
                >
                  {dashboardJumpHints[fact.id]?.length ? (
                    <CommandJumpHint keys={dashboardJumpHints[fact.id]} />
                  ) : null}
                  <form
                    ref={(el) => {
                      factFormRefs.current[fact.id] = el;
                    }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editingId === fact.id) handleUpdate(e, fact.id);
                    }}
                    style={formContainerStyle}
                  >
                    <textarea
                      ref={(el) => {
                        factTextareaRefs.current[fact.id] = el;
                        if (editingId === fact.id) {
                          (
                            editTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>
                          ).current = el;
                        }
                      }}
                      value={editingId === fact.id ? editContent : fact.content}
                      onChange={(e) =>
                        editingId === fact.id && setEditContent(e.target.value)
                      }
                      readOnly={editingId !== fact.id}
                      onClick={() =>
                        editingId !== fact.id &&
                        startEdit(fact.id, fact.content)
                      }
                      onFocus={() => setFocusedContainer(fact.id)}
                      onBlur={() => {
                        setTimeout(() => {
                          if (!isFocusInAnyContainer()) {
                            setFocusedContainer(null);
                          }
                        }, 0);
                      }}
                      onKeyDown={(e) =>
                        handleFactTextareaKeyDown(e, fact.id, fact.content)
                      }
                      maxLength={10000}
                      rows={3}
                      style={{
                        ...factTextareaStyle,
                        borderRadius: isOnlyFact || isTop ? "6px 6px 0 0" : 0,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-end",
                        minHeight: "2.5rem",
                        borderRadius: barRadius,
                        background: "#fff",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleDelete(fact.id)}
                        disabled={deleteMutation.isPending}
                        aria-label="Delete fact"
                        title="Delete fact"
                        style={{
                          ...factDeleteButtonStyle,
                          borderRadius: deleteButtonRadius,
                        }}
                      >
                        {commandMode && focusedContainer === fact.id ? (
                          "⌫"
                        ) : (
                          <Trash2 size={18} aria-hidden />
                        )}
                      </button>
                      {editingId === fact.id &&
                      editContent.trim() !== fact.content ? (
                        <button
                          type="submit"
                          disabled={
                            updateMutation.isPending || !editContent.trim()
                          }
                          aria-label="Save changes"
                          title="Save changes (⌘↵)"
                          style={{
                            ...factSecondaryButtonStyle,
                            borderRadius: editButtonRadius,
                          }}
                        >
                          {updateMutation.isPending ? (
                            <span
                              className="add-btn-spinner add-btn-spinner-on-light"
                              aria-hidden
                            />
                          ) : commandMode && focusedContainer === fact.id ? (
                            "↵"
                          ) : (
                            <Save size={18} aria-hidden />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => copyFactToClipboard(fact.content)}
                          aria-label="Copy fact to clipboard"
                          title="Copy to clipboard (⌘↵)"
                          style={{
                            ...factSecondaryButtonStyle,
                            borderRadius: editButtonRadius,
                          }}
                        >
                          {commandMode && focusedContainer === fact.id ? (
                            "↵"
                          ) : (
                            <Copy size={18} aria-hidden />
                          )}
                        </button>
                      )}
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
