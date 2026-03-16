"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";

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

  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [commandMode, setCommandMode] = useState(false);
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
      if (e.metaKey || e.ctrlKey) setCommandMode(true);
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Backspace" &&
        focusedContainer &&
        focusedContainer !== "add"
      ) {
        e.preventDefault();
        handleDelete(focusedContainer);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Meta" || e.key === "Control") setCommandMode(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
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
    padding: "6px 10px",
    boxSizing: "border-box",
    minWidth: "2.75rem",
    background: "var(--color-interactive-bg)",
    color: "#000",
    border: "1px solid var(--color-border)",
    fontSize: "0.8125rem",
    cursor: "pointer",
  };
  const factDeleteButtonStyle: React.CSSProperties = {
    ...factButtonBase,
    minWidth: "3rem",
    borderRight: "none",
    borderBottom: "none",
    borderRadius: "6px 0 0 0",
  };
  const factEditButtonStyle: React.CSSProperties = {
    ...factButtonBase,
    borderRight: "none",
    borderBottom: "none",
    borderRadius: "0 0 6px 0",
  };

  const borderValue = "1px solid var(--color-border)";
  const factTextareaStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    margin: 0,
    boxSizing: "border-box",
    padding: "0.5rem 0.75rem",
    border: "none",
    outline: "none",
    fontSize: "0.875rem",
    resize: "vertical",
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
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
        What do you know?
      </h1>

      <section style={{ marginBottom: "2rem" }}>
        <form
          ref={addFormRef}
          onSubmit={handleCreate}
          style={{
            display: "flex",
            flexDirection: "column",
            border: borderValue,
            borderRadius: "6px",
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
            onKeyDown={handleTextareaKeyDown}
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
              borderRadius: "6px 6px 0 0",
              fontSize: "0.875rem",
              resize: "vertical",
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
              aria-label="Create"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 10px",
                boxSizing: "border-box",
                minWidth: "3rem",
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
                "Create"
              )}
            </button>
          </div>
        </form>
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
                border: borderValue,
                borderRadius: containerRadius,
                overflow: "hidden",
                position: "relative",
                ...(isTop ? {} : { borderTop: "none" }),
                ...(focusedContainer === fact.id ? { zIndex: 1 } : {}),
                boxShadow:
                  focusedContainer === fact.id
                    ? "0 0 0 1px var(--color-border)"
                    : "none",
              };
              return (
                <li
                  key={fact.id}
                  style={{
                    position: "relative",
                  }}
                >
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
                      onKeyDown={handleTextareaKeyDown}
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
                        aria-label="Delete"
                        style={{
                          ...factDeleteButtonStyle,
                          borderRadius: deleteButtonRadius,
                        }}
                      >
                        {commandMode && focusedContainer === fact.id
                          ? "⌫"
                          : "Delete"}
                      </button>
                      {editingId === fact.id &&
                      editContent.trim() !== fact.content ? (
                        <button
                          type="submit"
                          disabled={
                            updateMutation.isPending || !editContent.trim()
                          }
                          aria-label="Save"
                          style={{
                            ...factEditButtonStyle,
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
                            "Save"
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(fact.id, fact.content)}
                          aria-label="Edit"
                          style={{
                            ...factEditButtonStyle,
                            borderRadius: editButtonRadius,
                          }}
                        >
                          {commandMode && focusedContainer === fact.id
                            ? "↵"
                            : "Edit"}
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
