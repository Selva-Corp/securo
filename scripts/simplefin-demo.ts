/**
 * Connect a SimpleFIN setup token to a user and print what came back.
 * Handy for checking the sync against the SimpleFIN demo bridge:
 *   SIMPLEFIN_TOKEN=<setup token> npm run simplefin:demo -- demo@securo.app
 * Grab a demo token from https://beta-bridge.simplefin.org/info/developers
 */
import { PrismaClient } from "@prisma/client";
import { connectSimpleFin, syncConnection } from "../src/server/sync/simplefin";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] ?? "demo@securo.app";
  const token = process.env.SIMPLEFIN_TOKEN;
  if (!token) throw new Error("Set SIMPLEFIN_TOKEN to a SimpleFIN setup token");

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const { connection, result } = await connectSimpleFin(user.id, token, "Demo Bank");
  console.log("connect:", connection.displayName, connection.status, JSON.stringify(result));
  const again = await syncConnection(connection.id);
  console.log("resync:", JSON.stringify(again));

  const accounts = await prisma.account.findMany({
    where: { connectionId: connection.id },
    select: { name: true, type: true, syncedBalance: true, institution: true, _count: { select: { transactions: true } } },
  });
  console.table(accounts.map((a) => ({ name: a.name, type: a.type, balance: a.syncedBalance, institution: a.institution, txns: a._count.transactions })));

  const sample = await prisma.transaction.findMany({
    where: { account: { connectionId: connection.id } },
    orderBy: { date: "desc" },
    take: 8,
    include: { category: true },
  });
  console.table(
    sample.map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      amount: t.amount,
      payee: t.payee.slice(0, 32),
      category: t.category?.name ?? null,
      pending: t.pending,
      excluded: t.excluded,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
