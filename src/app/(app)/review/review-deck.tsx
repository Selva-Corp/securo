"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUp, Ban, Check, Plus, RotateCcw, SkipForward, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { BUCKET_LABEL, type Bucket } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { CategoryIcon } from "@/components/category-icon";
import { Badge, Button, EmptyState, Input, LinkButton, Progress } from "@/components/ui";
import { reviewTransaction, unreviewTransaction } from "@/server/actions/review";
import { createCategory } from "@/server/actions/categories";

export interface ReviewItem {
  id: string;
  payee: string;
  amount: number;
  date: string; // ISO
  accountName: string;
  memo: string | null;
  pending: boolean;
  categoryId: string | null;
  excluded: boolean;
}

export interface ReviewCategory {
  id: string;
  name: string;
  bucket: Bucket;
  icon: string;
}

type Dir = { x: number; y: number };
const DIR: Record<Bucket | "EXCLUDE", Dir> = {
  NEEDS: { x: 1, y: 0 },
  WANTS: { x: -1, y: 0 },
  SAVINGS_DEBT: { x: 0, y: -1 },
  INCOME: { x: 0, y: -1 },
  EXCLUDE: { x: 0, y: 1 },
};

const SWIPE_THRESHOLD = 90;

// Static class strings so Tailwind can see them.
const BUCKET_BUTTON: Record<Bucket, string> = {
  NEEDS:
    "border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 focus-visible:ring-sky-500/40 dark:text-sky-300",
  WANTS:
    "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 focus-visible:ring-violet-500/40 dark:text-violet-300",
  SAVINGS_DEBT:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 focus-visible:ring-emerald-500/40 dark:text-emerald-300",
  INCOME:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 focus-visible:ring-amber-500/40 dark:text-amber-300",
};

const BUCKET_TEXT: Record<Bucket, string> = {
  NEEDS: "text-sky-600 dark:text-sky-300",
  WANTS: "text-violet-600 dark:text-violet-300",
  SAVINGS_DEBT: "text-emerald-600 dark:text-emerald-300",
  INCOME: "text-amber-600 dark:text-amber-300",
};

const BUCKET_RING: Record<Bucket, string> = {
  NEEDS: "border-sky-500",
  WANTS: "border-violet-500",
  SAVINGS_DEBT: "border-emerald-500",
  INCOME: "border-amber-500",
};

const BUCKET_KEY: Record<Bucket, string> = { NEEDS: "1", WANTS: "2", SAVINGS_DEBT: "3", INCOME: "4" };

type HistoryEntry = { item: ReviewItem };
type Leaving = { item: ReviewItem; dir: Dir; from: { dx: number; dy: number } };

export function ReviewDeck({
  items,
  categories: initialCategories,
  currency,
}: {
  items: ReviewItem[];
  categories: ReviewCategory[];
  currency: string;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<ReviewItem[]>(items);
  const [total, setTotal] = useState(items.length);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [categories, setCategories] = useState<ReviewCategory[]>(initialCategories);
  const [picker, setPicker] = useState<Bucket | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false });

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const handled = useRef(new Set<string>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const leavingRef = useRef<HTMLDivElement>(null);

  const current = queue[0] ?? null;
  const suggested = current?.categoryId ? (categories.find((c) => c.id === current.categoryId) ?? null) : null;
  const isInflow = (current?.amount ?? 0) > 0;
  const done = Math.max(0, total - queue.length);

  /** Serialize server calls so an undo can never overtake the review it reverts. */
  const enqueue = useCallback((fn: () => Promise<void>) => {
    chain.current = chain.current.then(fn, fn);
  }, []);

  // When the server hands us new unreviewed rows (e.g. more than the first page), pick them up.
  useEffect(() => {
    if (queue.length > 0) return;
    const fresh = items.filter((i) => !handled.current.has(i.id));
    if (fresh.length > 0) {
      setQueue(fresh);
      setTotal((t) => t + fresh.length);
    }
  }, [items, queue.length]);

  // Fly the leaving card off-screen, then drop it.
  useEffect(() => {
    if (!leaving) return;
    const el = leavingRef.current;
    const { dir, from } = leaving;
    const toX = dir.x * (typeof window === "undefined" ? 600 : window.innerWidth);
    const toY = dir.y * 700;
    el?.animate(
      [
        { transform: `translate(${from.dx}px, ${from.dy}px) rotate(${from.dx / 20}deg)`, opacity: 1 },
        { transform: `translate(${toX}px, ${toY}px) rotate(${dir.x * 12}deg)`, opacity: 0 },
      ],
      { duration: 240, easing: "ease-in", fill: "forwards" },
    );
    const t = window.setTimeout(() => setLeaving(null), 240);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const commit = useCallback(
    (item: ReviewItem, categoryId: string | null, excluded: boolean, dir: Dir) => {
      setError(null);
      setPicker(null);
      setNewName("");
      setLeaving({ item, dir, from: { dx: drag.dx, dy: drag.dy } });
      setDrag({ dx: 0, dy: 0, active: false });
      handled.current.add(item.id);
      setHistory((h) => [...h, { item }]);
      setQueue((q) => q.filter((i) => i.id !== item.id));
      enqueue(async () => {
        let result: Awaited<ReturnType<typeof reviewTransaction>>;
        try {
          result = await reviewTransaction({ id: item.id, categoryId, excluded });
        } catch {
          result = { ok: false, error: "Could not reach the server" };
        }
        if (!result.ok) {
          setError(`Couldn't save ${item.payee}: ${result.error}`);
          handled.current.delete(item.id);
          setHistory((h) => h.filter((e) => e.item.id !== item.id));
          setQueue((q) => (q.some((i) => i.id === item.id) ? q : [item, ...q]));
          return;
        }
        if (queueRef.current.length === 0) router.refresh();
      });
    },
    [drag.dx, drag.dy, enqueue, router],
  );

  /** Returns true when the card was committed, false when the picker opened instead. */
  const chooseBucket = useCallback(
    (bucket: Bucket): boolean => {
      if (!current) return false;
      if (bucket === "INCOME" && !isInflow) return false;
      if (suggested && suggested.bucket === bucket) {
        commit(current, suggested.id, false, DIR[bucket]);
        return true;
      }
      setPicker(bucket);
      return false;
    },
    [current, isInflow, suggested, commit],
  );

  const chooseCategory = (cat: ReviewCategory) => {
    if (!current) return;
    commit(current, cat.id, false, DIR[cat.bucket]);
  };

  const exclude = useCallback(() => {
    if (!current) return;
    commit(current, null, true, DIR.EXCLUDE);
  }, [current, commit]);

  const skip = useCallback(() => {
    setPicker(null);
    setDrag({ dx: 0, dy: 0, active: false });
    setQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));
  }, []);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    setError(null);
    setPicker(null);
    setLeaving(null);
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [last.item, ...q.filter((i) => i.id !== last.item.id)]);
    enqueue(async () => {
      let result: Awaited<ReturnType<typeof unreviewTransaction>>;
      try {
        result = await unreviewTransaction({
          id: last.item.id,
          categoryId: last.item.categoryId,
          excluded: last.item.excluded,
        });
      } catch {
        result = { ok: false, error: "Could not reach the server" };
      }
      if (!result.ok) {
        setError(`Couldn't undo ${last.item.payee}: ${result.error}`);
        setQueue((q) => q.filter((i) => i.id !== last.item.id));
        setHistory((h) => [...h, last]);
        return;
      }
      handled.current.delete(last.item.id);
    });
  }, [history, enqueue]);

  const createAndUse = async () => {
    if (!picker || !current) return;
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createCategory({ name, bucket: picker });
      if (!result || !result.ok || !result.id) {
        setError(result && !result.ok ? result.error : "Could not create the category");
        return;
      }
      const cat: ReviewCategory = { id: result.id, name, bucket: picker, icon: "tag" };
      setCategories((cs) => [...cs, cat]);
      chooseCategory(cat);
    } finally {
      setCreating(false);
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "Escape") {
        setPicker(null);
        setNewName("");
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "1":
          chooseBucket("NEEDS");
          break;
        case "2":
          chooseBucket("WANTS");
          break;
        case "3":
          chooseBucket("SAVINGS_DEBT");
          break;
        case "4":
          chooseBucket("INCOME");
          break;
        case "s":
        case "S":
          skip();
          break;
        case "e":
        case "E":
          exclude();
          break;
        case "u":
        case "U":
          undo();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseBucket, skip, exclude, undo]);

  // Pointer swipe.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (picker || !current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dx: 0, dy: 0, active: true });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    setDrag({ dx: e.clientX - dragStart.current.x, dy: e.clientY - dragStart.current.y, active: true });
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = null;
    const bucket = swipeBucket(dx, dy);
    if (bucket && chooseBucket(bucket)) return;
    setDrag({ dx: 0, dy: 0, active: false });
  };

  const swipeCandidate = drag.active ? swipeBucket(drag.dx, drag.dy, 1) : null;
  const swipeStrength = Math.min(1, Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) / SWIPE_THRESHOLD);

  if (!current && !leaving) {
    return (
      <EmptyState
        title="All caught up"
        description={total > 0 ? `You reviewed ${total} transaction${total === 1 ? "" : "s"}.` : "Nothing is waiting for review."}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton href="/transactions" variant="secondary">
              View transactions
            </LinkButton>
            <LinkButton href="/budget">See your budget</LinkButton>
          </div>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>
          {Math.min(done + 1, total)} of {total}
        </span>
        <span className="hidden md:inline">Keys: 1 · 2 · 3{isInflow ? " · 4" : ""} · S skip · E exclude · U undo</span>
      </div>
      <Progress pct={total > 0 ? (done / total) * 100 : 0} color="emerald" className="mb-4" />

      {error && (
        <div
          role="alert"
          className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative" style={{ minHeight: 280 }}>
        {queue[1] && (
          <div
            aria-hidden
            className="absolute inset-x-3 top-2 h-full rounded-2xl border border-border bg-card opacity-60"
            style={{ transform: "scale(0.96)" }}
          />
        )}
        {leaving && (
          <div ref={leavingRef} className="pointer-events-none absolute inset-0 z-20">
            <TxnCard item={leaving.item} currency={currency} suggested={categories.find((c) => c.id === leaving.item.categoryId) ?? null} />
          </div>
        )}
        {current && (
          <div
            key={current.id}
            className={cn("relative z-10 select-none", picker ? "" : "cursor-grab active:cursor-grabbing")}
            style={{
              touchAction: picker ? "auto" : "none",
              transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 20}deg)`,
              transition: drag.active ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <TxnCard
              item={current}
              currency={currency}
              suggested={suggested}
              className={cn("transition-colors", swipeCandidate && BUCKET_RING[swipeCandidate])}
            />
            {swipeCandidate && (
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-3xl font-bold uppercase tracking-wide",
                  BUCKET_TEXT[swipeCandidate],
                )}
                style={{ opacity: swipeStrength }}
              >
                {BUCKET_LABEL[swipeCandidate]}
              </div>
            )}
          </div>
        )}
      </div>

      {current && (
        <div className="mt-4">
          {picker ? (
            <CategoryPicker
              bucket={picker}
              categories={categories.filter((c) => c.bucket === picker)}
              onPick={chooseCategory}
              onClose={() => {
                setPicker(null);
                setNewName("");
              }}
              newName={newName}
              setNewName={setNewName}
              onCreate={createAndUse}
              creating={creating}
            />
          ) : (
            <>
              <div className={cn("grid gap-2", isInflow ? "grid-cols-2" : "grid-cols-3")}>
                <BucketButton bucket="NEEDS" onClick={() => chooseBucket("NEEDS")} icon={<ArrowRight className="h-4 w-4" />} />
                <BucketButton bucket="WANTS" onClick={() => chooseBucket("WANTS")} icon={<ArrowLeft className="h-4 w-4" />} />
                <BucketButton bucket="SAVINGS_DEBT" onClick={() => chooseBucket("SAVINGS_DEBT")} icon={<ArrowUp className="h-4 w-4" />} />
                {isInflow && <BucketButton bucket="INCOME" onClick={() => chooseBucket("INCOME")} icon={<Check className="h-4 w-4" />} />}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button variant="secondary" onClick={skip} disabled={queue.length < 2} title="Skip (S)">
                  <SkipForward className="h-4 w-4" /> Skip
                </Button>
                <Button variant="secondary" onClick={exclude} title="Exclude from budget (E)">
                  <Ban className="h-4 w-4" /> Exclude
                </Button>
                <Button variant="secondary" onClick={undo} disabled={history.length === 0} title="Undo (U)">
                  <RotateCcw className="h-4 w-4" /> Undo
                </Button>
              </div>
              <p className="mt-3 text-center text-xs text-muted md:hidden">
                Swipe right for Needs, left for Wants, up for Savings & Debt.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function swipeBucket(dx: number, dy: number, threshold = SWIPE_THRESHOLD): Bucket | null {
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= threshold) return "NEEDS";
    if (dx <= -threshold) return "WANTS";
    return null;
  }
  if (dy <= -threshold) return "SAVINGS_DEBT";
  return null;
}

function TxnCard({
  item,
  currency,
  suggested,
  className,
}: {
  item: ReviewItem;
  currency: string;
  suggested: ReviewCategory | null;
  className?: string;
}) {
  const outflow = item.amount < 0;
  return (
    <div className={cn("rounded-2xl border-2 border-border bg-card p-6 shadow-md", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold">{item.payee}</div>
          <div className="mt-1 text-sm text-muted">
            {formatDate(new Date(item.date))} · {item.accountName}
          </div>
        </div>
        {item.pending && <Badge tone="amber">Pending</Badge>}
      </div>
      <div
        className={cn(
          "tabular mt-6 text-4xl font-bold tracking-tight",
          outflow ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {formatMoney(item.amount, currency, { signed: true })}
      </div>
      {item.memo && <p className="mt-3 text-sm text-muted">{item.memo}</p>}
      <div className="mt-5 flex min-h-6 items-center gap-2 text-sm">
        {suggested ? (
          <>
            <span className="text-muted">Suggested:</span>
            <span className={cn("inline-flex items-center gap-1.5 font-medium", BUCKET_TEXT[suggested.bucket])}>
              <CategoryIcon name={suggested.icon} className="h-4 w-4" />
              {suggested.name} ({BUCKET_LABEL[suggested.bucket]})
            </span>
          </>
        ) : (
          <span className="text-muted">No suggestion yet. Pick a bucket to choose a category.</span>
        )}
      </div>
    </div>
  );
}

function BucketButton({ bucket, onClick, icon }: { bucket: Bucket; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-16 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
        BUCKET_BUTTON[bucket],
      )}
    >
      <span className="flex items-center gap-1">
        {icon}
        <span className="leading-tight">{BUCKET_LABEL[bucket]}</span>
      </span>
      <span className="mt-0.5 hidden text-[10px] font-normal opacity-70 md:block">Press {BUCKET_KEY[bucket]}</span>
    </button>
  );
}

function CategoryPicker({
  bucket,
  categories,
  onPick,
  onClose,
  newName,
  setNewName,
  onCreate,
  creating,
}: {
  bucket: Bucket;
  categories: ReviewCategory[];
  onPick: (c: ReviewCategory) => void;
  onClose: () => void;
  newName: string;
  setNewName: (v: string) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className={cn("rounded-xl border-2 bg-card p-3", BUCKET_RING[bucket])}>
      <div className="mb-2 flex items-center justify-between">
        <div className={cn("text-sm font-semibold", BUCKET_TEXT[bucket])}>Which {BUCKET_LABEL[bucket]} category?</div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-border/40">
          <X className="h-4 w-4" />
        </button>
      </div>
      {categories.length === 0 ? (
        <p className="mb-2 text-sm text-muted">No {BUCKET_LABEL[bucket]} categories yet. Create one below.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-left text-sm font-medium hover:bg-border/40"
            >
              <CategoryIcon name={c.icon} className="h-4 w-4 shrink-0 text-muted" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate();
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category…"
          aria-label="New category name"
          maxLength={60}
        />
        <Button type="submit" variant="secondary" disabled={creating || !newName.trim()}>
          <Plus className="h-4 w-4" /> {creating ? "Adding…" : "Add"}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">Esc to go back.</p>
    </div>
  );
}
