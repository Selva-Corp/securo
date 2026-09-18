import * as React from "react";
import { cn } from "@/lib/cn";
import { BUCKET_COLOR, BUCKET_LABEL, type Bucket } from "@/lib/constants";

const tones: Record<string, string> = {
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  gray: "bg-border/60 text-muted",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export function Badge({
  tone = "gray",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function BucketBadge({ bucket, className }: { bucket: Bucket | null; className?: string }) {
  if (!bucket) return <Badge className={className}>Uncategorized</Badge>;
  return (
    <Badge tone={BUCKET_COLOR[bucket] as keyof typeof tones} className={className}>
      {BUCKET_LABEL[bucket]}
    </Badge>
  );
}
