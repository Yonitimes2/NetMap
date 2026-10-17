import { connection } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { roleIn } from "@/lib/db/accounts";
import { customerDoc, getFinance, getQuoteDefaults, orgName } from "@/lib/db/projects";
import { listProducts } from "@/lib/products/store";
import { buildQuote, type ProductPriceInfo } from "@/lib/quote";
import { purchaseSummary } from "@/lib/purchase";
import { PrintButton } from "../quote/PrintButton";

/**
 * What's still to buy for a project, to send a supplier or print: each item with its model and how
 * many are missing. No prices. For the account's owners (it's read on the server, with the session).
 */
export async function OrderSheet({ params }: { params: Promise<{ accountId: string; siteId: string }> }) {
  // read at request time: the session, and what's been bought until now
  await connection();
  const { accountId, siteId } = await params;
  const user = await currentUser();
  const c = user && (await roleIn(user, accountId)) === "owner" ? await customerDoc(accountId) : null;
  const doc = c?.doc;
  const site = doc?.sites.find((s) => s.id === siteId);
  if (!c || !doc || !site) return <p className="p-10 text-center text-slate-500">אין לך גישה לדף הזה.</p>;

  const [{ finance }, defaults, catalog] = await Promise.all([getFinance(siteId), getQuoteDefaults(c.orgId), listProducts({ includeInactive: true }, c.orgId)]);
  const quote = buildQuote({
    siteId,
    devices: doc.devices.filter((d) => d.siteId === siteId),
    links: doc.links.filter((l) => l.siteId === siteId),
    floors: doc.floors.filter((f) => f.siteId === siteId),
    products: new Map<string, ProductPriceInfo>(catalog.map((p) => [p.id, p])),
    finance,
    defaults,
  });
  const missing = purchaseSummary(quote, finance)
    .lines.map((pl) => ({ ...pl, left: Math.max(0, pl.line.qty - pl.covered) }))
    .filter((pl) => pl.left > 0);
  const org = await orgName(c.orgId);
  const today = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <div className="mx-auto max-w-3xl space-y-5 p-6 sm:p-10">
        <header className="flex flex-wrap items-start gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0 flex-1">
            {org && <div className="text-sm font-semibold text-slate-500">{org}</div>}
            <h1 className="text-2xl font-bold">הזמנת ציוד</h1>
            <p className="text-sm text-slate-600">
              {doc.account.name} · {site.name} · {today}
            </p>
          </div>
          <PrintButton />
        </header>
        {missing.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 text-start text-xs text-slate-500">
                <th className="py-2 text-start font-medium">#</th>
                <th className="py-2 text-start font-medium">פריט</th>
                <th className="py-2 text-start font-medium">דגם</th>
                <th className="py-2 text-end font-medium">כמות</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((pl, i) => (
                <tr key={pl.line.key} className="border-b border-slate-100 align-top">
                  <td className="py-2 pe-2 text-slate-400">{i + 1}</td>
                  <td className="py-2 pe-3 font-medium">
                    {pl.line.name}
                    {pl.line.included && <div className="text-xs font-normal text-slate-500">{pl.line.included}</div>}
                  </td>
                  <td dir="auto" className="py-2 pe-3 text-right text-slate-700">
                    {pl.line.detail ?? "—"}
                  </td>
                  <td className="py-2 text-end font-semibold tabular-nums whitespace-nowrap">
                    {pl.left} {pl.line.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rounded-xl bg-green-50 p-4 text-green-800">הכל כבר נרכש: אין מה להזמין.</p>
        )}
      </div>
    </div>
  );
}
