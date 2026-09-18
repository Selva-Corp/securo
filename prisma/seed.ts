/**
 * Seeds a demo user with realistic data so the app has something to show.
 *   npm run db:seed
 * Login: demo@securo.app / password123
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { subDays, startOfMonth, addDays } from "date-fns";
import { DEFAULT_CATEGORIES } from "../src/lib/constants";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@securo.app";
  await prisma.user.deleteMany({ where: { email } });

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const nextPay = addDays(today, 6);

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo User",
      passwordHash: await hash("password123", 10),
      monthlyIncome: 520000,
      paycheckAmount: 240000,
      payFrequency: "BIWEEKLY",
      nextPayDate: nextPay,
      onboardedAt: today,
      categories: { create: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })) },
      accounts: {
        create: [
          { name: "Everyday Checking", type: "CHECKING", openingBalance: 312500 },
          { name: "High-Yield Savings", type: "SAVINGS", openingBalance: 840000, inSpendable: false },
          { name: "Rewards Visa", type: "CREDIT", openingBalance: -42000 },
        ],
      },
    },
    include: { categories: true, accounts: true },
  });

  const cat = (name: string) => user.categories.find((c) => c.name === name)!.id;
  const acct = (name: string) => user.accounts.find((a) => a.name === name)!.id;
  const monthStart = startOfMonth(today);
  const d = (daysAgo: number) => {
    const x = subDays(today, daysAgo);
    x.setHours(12, 0, 0, 0);
    return x;
  };

  type Row = [Date, number, string, string, string | null, boolean];
  const rows: Row[] = [
    [monthStart, 240000, "Acme Corp Payroll", "Everyday Checking", "Paycheck", true],
    [addDays(monthStart, 14), 240000, "Acme Corp Payroll", "Everyday Checking", "Paycheck", true],
    [addDays(monthStart, 1), -165000, "Maple Street Apartments", "Everyday Checking", "Rent / Mortgage", true],
    [addDays(monthStart, 2), -8900, "City Power & Light", "Everyday Checking", "Utilities", true],
    [addDays(monthStart, 3), -6500, "Fiber Internet", "Everyday Checking", "Phone & Internet", true],
    [d(12), -12430, "Whole Foods", "Rewards Visa", "Groceries", true],
    [d(9), -8712, "Trader Joe's", "Rewards Visa", "Groceries", true],
    [d(4), -9315, "Whole Foods", "Rewards Visa", "Groceries", true],
    [d(11), -4200, "Shell", "Rewards Visa", "Transportation", true],
    [d(10), -1599, "Netflix", "Rewards Visa", "Subscriptions", true],
    [d(10), -1099, "Spotify", "Rewards Visa", "Subscriptions", true],
    [d(8), -5640, "Chipotle", "Rewards Visa", "Dining Out", true],
    [d(7), -11200, "The Corner Bistro", "Rewards Visa", "Dining Out", true],
    [d(6), -4599, "Amazon", "Rewards Visa", "Shopping", true],
    [d(5), -30000, "Transfer to Savings", "Everyday Checking", "Emergency Fund", true],
    [d(3), -2450, "Starbucks", "Rewards Visa", "Dining Out", false],
    [d(2), -7899, "Target", "Rewards Visa", null, false],
    [d(2), -1800, "Uber", "Rewards Visa", null, false],
    [d(1), -6425, "Costco", "Rewards Visa", null, false],
    [d(0), -1299, "Apple.com", "Rewards Visa", null, false],
  ];

  for (const [date, amount, payee, account, category, reviewed] of rows) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: acct(account),
        categoryId: category ? cat(category) : null,
        date,
        amount,
        payee,
        reviewedAt: reviewed ? date : null,
      },
    });
  }

  const goal = await prisma.goal.create({
    data: {
      userId: user.id,
      name: "Emergency fund",
      kind: "SAVINGS",
      targetAmount: 1000000,
      targetDate: addDays(today, 240),
      icon: "life-buoy",
    },
  });
  await prisma.goalContribution.createMany({
    data: [
      { userId: user.id, goalId: goal.id, amount: 600000, date: d(60), note: "Starting balance" },
      { userId: user.id, goalId: goal.id, amount: 30000, date: d(5), note: "Monthly transfer" },
    ],
  });
  await prisma.goal.create({
    data: {
      userId: user.id,
      name: "Japan trip",
      kind: "SAVINGS",
      targetAmount: 400000,
      targetDate: addDays(today, 300),
      icon: "plane",
      color: "violet",
      contributions: { create: [{ userId: user.id, amount: 85000, date: d(20) }] },
    },
  });

  console.log(`Seeded ${email} (password: password123)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
