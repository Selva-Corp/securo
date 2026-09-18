import { requireUser } from "@/server/session";
import { getCategories, getReviewQueue } from "@/server/queries";
import { PageHeader } from "@/components/ui";
import type { Bucket } from "@/lib/constants";
import { ReviewDeck, type ReviewCategory, type ReviewItem } from "./review-deck";

export default async function ReviewPage() {
  const user = await requireUser();
  const [queue, categories] = await Promise.all([getReviewQueue(user.id, 50), getCategories(user.id)]);

  const items: ReviewItem[] = queue.map((t) => ({
    id: t.id,
    payee: t.payee,
    amount: t.amount,
    date: t.date.toISOString(),
    accountName: t.account.name,
    memo: t.memo,
    pending: t.pending,
    categoryId: t.categoryId,
    excluded: t.excluded,
  }));
  const cats: ReviewCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    bucket: c.bucket as Bucket,
    icon: c.icon,
  }));

  return (
    <>
      <PageHeader
        title="Review"
        description="Sort each transaction into Needs, Wants, or Savings & Debt. Swipe or tap."
      />
      <ReviewDeck items={items} categories={cats} currency={user.currency} />
    </>
  );
}
