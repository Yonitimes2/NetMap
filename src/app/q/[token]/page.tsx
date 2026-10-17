import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PublicQuote } from "@/components/quote/PublicQuote";
import { loadPublicQuote } from "@/lib/public-quote";

export const metadata: Metadata = {
  title: "הצעת מחיר",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** A project's page for its customer, opened from a link the account's owner sent (no sign-in). */
export default function QuoteLinkPage({ params }: PageProps<"/q/[token]">) {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-400">טוען…</p>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/q/[token]">["params"] }) {
  // read at request time: whether the link still works, and the quote as it is now
  await connection();
  const { token } = await params;
  const data = await loadPublicQuote(token);
  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-xl font-bold">הקישור כבר לא בתוקף</h1>
          <p className="text-sm text-slate-500">אפשר לבקש קישור חדש ממי ששלח אותו.</p>
        </div>
      </div>
    );
  }
  return <PublicQuote data={data} token={token} />;
}
