"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/session";
import { GOAL_KINDS } from "@/lib/constants";
import { GOAL_COLORS } from "@/lib/goals";
import { fromDateInput } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { CATEGORY_ICON_NAMES } from "@/components/category-icon";
import type { ActionState } from "@/components/ui";

export type GoalActionState = ActionState;

function revalidateGoals(goalId?: string) {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  if (goalId) revalidatePath(`/goals/${goalId}`);
}

const goalSchema = z.object({
  name: z.string().trim().min(1, "Give the goal a name").max(80, "Keep the name under 80 characters"),
  kind: z.enum(GOAL_KINDS),
  targetAmount: z.string().trim().min(1, "Enter a target amount"),
  targetDate: z.string().trim().optional(),
  icon: z.string().trim().min(1),
  color: z.enum(GOAL_COLORS),
});

type GoalData = {
  name: string;
  kind: string;
  targetAmount: number;
  targetDate: Date | null;
  icon: string;
  color: string;
};

function parseGoalForm(formData: FormData): { data: GoalData } | { error: string } {
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, kind, icon, color } = parsed.data;
  const targetAmount = parseMoney(parsed.data.targetAmount);
  if (targetAmount === null || targetAmount <= 0) return { error: "Enter a target amount greater than zero" };
  let targetDate: Date | null = null;
  if (parsed.data.targetDate) {
    targetDate = fromDateInput(parsed.data.targetDate);
    if (!targetDate) return { error: "Enter a valid target date" };
  }
  if (!CATEGORY_ICON_NAMES.includes(icon)) return { error: "Pick an icon" };
  return { data: { name, kind, targetAmount, targetDate, icon, color } };
}

export async function createGoal(_prev: GoalActionState, formData: FormData): Promise<GoalActionState> {
  const userId = await requireUserId();
  const result = parseGoalForm(formData);
  if ("error" in result) return { ok: false, error: result.error };
  const goal = await prisma.goal.create({ data: { userId, ...result.data } });
  revalidateGoals(goal.id);
  redirect(`/goals/${goal.id}`);
}

export async function updateGoal(_prev: GoalActionState, formData: FormData): Promise<GoalActionState> {
  const userId = await requireUserId();
  const goalId = String(formData.get("goalId") ?? "");
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return { ok: false, error: "Goal not found" };
  const result = parseGoalForm(formData);
  if ("error" in result) return { ok: false, error: result.error };
  await prisma.goal.update({ where: { id: goal.id }, data: result.data });
  revalidateGoals(goal.id);
  return { ok: true, message: "Goal saved" };
}

async function setGoalArchived(goalId: string, archived: boolean): Promise<void> {
  const userId = await requireUserId();
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return;
  await prisma.goal.update({ where: { id: goal.id }, data: { archived } });
  revalidateGoals(goal.id);
}

export async function archiveGoal(goalId: string): Promise<void> {
  await setGoalArchived(goalId, true);
}

export async function unarchiveGoal(goalId: string): Promise<void> {
  await setGoalArchived(goalId, false);
}

/** Deletes the goal and, through the schema cascade, all of its contributions. */
export async function deleteGoal(goalId: string): Promise<void> {
  const userId = await requireUserId();
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return;
  await prisma.goal.delete({ where: { id: goal.id } });
  revalidateGoals();
  redirect("/goals");
}

const contributionSchema = z.object({
  goalId: z.string().min(1),
  amount: z.string().trim().min(1, "Enter an amount"),
  date: z.string().trim().min(1, "Pick a date"),
  note: z.string().trim().max(200, "Keep the note under 200 characters").optional(),
  withdraw: z.string().optional(),
});

export async function addContribution(_prev: GoalActionState, formData: FormData): Promise<GoalActionState> {
  const userId = await requireUserId();
  const parsed = contributionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const goal = await prisma.goal.findFirst({ where: { id: parsed.data.goalId, userId }, select: { id: true, kind: true } });
  if (!goal) return { ok: false, error: "Goal not found" };
  const magnitude = parseMoney(parsed.data.amount);
  if (magnitude === null || magnitude === 0) return { ok: false, error: "Enter an amount greater than zero" };
  const date = fromDateInput(parsed.data.date);
  if (!date) return { ok: false, error: "Enter a valid date" };
  const withdraw = parsed.data.withdraw === "on";
  const amount = withdraw ? -Math.abs(magnitude) : Math.abs(magnitude);
  await prisma.goalContribution.create({
    data: { userId, goalId: goal.id, amount, date, note: parsed.data.note || null },
  });
  revalidateGoals(goal.id);
  return { ok: true, message: withdraw ? "Withdrawal recorded" : "Contribution added" };
}

export async function deleteContribution(contributionId: string): Promise<void> {
  const userId = await requireUserId();
  const contribution = await prisma.goalContribution.findFirst({
    where: { id: contributionId, userId },
    select: { id: true, goalId: true },
  });
  if (!contribution) return;
  await prisma.goalContribution.delete({ where: { id: contribution.id } });
  revalidateGoals(contribution.goalId);
}
