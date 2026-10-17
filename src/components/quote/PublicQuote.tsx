import { BadgePercent, Cable, Check, Package, Wrench } from "lucide-react";
import { deviceTypeById, layerById } from "@/lib/catalog";
import { VAT, nis } from "@/lib/products/pricing";
import { SECTION_LABEL, type QuoteSection } from "@/lib/quote";
import type { PublicFloor, PublicLine, PublicQuote as Data } from "@/lib/public-quote";
import { PlanScroller } from "./PlanScroller";
import { PrintButton } from "./PrintButton";

/**
 * The project's page for its customer (from a link, no sign-in): the planned equipment on their
 * property's plan, what each piece does (not which product it is, unless the owner chose to show
 * it), the work in one list, and the prices when the link includes them. Rendered on the server;
 * nothing but what's shown reaches the browser.
 */
export function PublicQuote({ data, token }: { data: Data; token: string }) {
  const date = new Date(data.date);
  const until = new Date(data.date + data.validDays * 86_400_000);
  const sections = (["equipment", "cables"] as QuoteSection[])
    .map((s) => ({ s, lines: data.lines.filter((l) => l.section === s) }))
    .filter((x) => x.lines.length);
  const t = data.totals;
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 print:bg-white">
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
        <header className="flex flex-wrap items-start gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0 flex-1">
            {data.orgName && <div className="text-sm font-semibold text-slate-500">{data.orgName}</div>}
            <h1 className="text-2xl font-bold sm:text-3xl">{data.showPrices ? "הצעת מחיר" : "תכנון המערכת"}</h1>
            <p className="mt-1 text-slate-600">
              עבור <b>{data.customer}</b> · {data.project.name}
              {data.project.address && ` · ${data.project.address}`}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {day(date)}
              {data.showPrices && ` · בתוקף עד ${day(until)}`}
              {data.rev > 0 && data.updatedAt && ` · גרסה ${data.rev}, עודכנה ${day(new Date(data.updatedAt))}`}
            </p>
          </div>
          <PrintButton />
        </header>

        {data.floors.map((f) => (
          <FloorPlan key={f.id} floor={f} many={data.floors.length > 1} />
        ))}

        {sections.map(({ s, lines }) => (
          <Section key={s} section={s} lines={lines} token={token} prices={data.showPrices} />
        ))}
        {data.labor.items.length > 0 && <Labor items={data.labor.items} price={data.labor.price} />}
        {!data.lines.length && !data.labor.items.length && (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">עדיין אין ציוד בתכנון.</p>
        )}

        {t && (
          <section className="ms-auto max-w-md space-y-2 break-inside-avoid">
            {t.discount > 0 && (
              // the discount, where the customer can't miss it
              <div className="flex items-center gap-3 rounded-2xl bg-green-600 p-4 text-white shadow-lg shadow-green-600/20 print:shadow-none">
                <BadgePercent size={36} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-green-100">הנחה מיוחדת עבורכם</div>
                  <div className="text-3xl font-black tabular-nums">
                    {t.discountPct ? `${t.discountPct}% · ` : ""}
                    {nis(t.discount)}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-1.5 rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200">
              <Total label="ציוד וכבלים" value={nis(t.equipment)} />
              {t.labor > 0 && <Total label="עבודה" value={nis(t.labor)} />}
              {t.discount > 0 && (
                <>
                  <Total label="סה״כ לפני הנחה" value={nis(t.subtotal)} muted />
                  <Total label="הנחה" value={`−${nis(t.discount)}`} discount />
                </>
              )}
              <Total label="סה״כ לפני מע״מ" value={nis(t.net)} strong />
              <Total label={`מע״מ ${Math.round(VAT * 100)}%`} value={nis(t.vat)} />
              <div className="border-t border-slate-200 pt-1.5">
                <Total label="סה״כ לתשלום" value={nis(t.total)} strong big />
              </div>
            </div>
          </section>
        )}

        {data.terms && (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 break-inside-avoid">
            <h2 className="mb-1 font-semibold">תנאים והערות</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{data.terms}</p>
          </section>
        )}

        <footer className="pt-2 text-center text-xs text-slate-400">{data.orgName ? `${data.orgName} · ` : ""}הופק ב-NetMap</footer>
      </div>
    </div>
  );
}

/** The date in Israel (the server's clock may be in another time zone). */
const day = (d: Date) => d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });

const ICON = { equipment: Package, cables: Cable, labor: Wrench } as const;

function Section({ section, lines, token, prices }: { section: QuoteSection; lines: PublicLine[]; token: string; prices: boolean }) {
  const Icon = ICON[section];
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-semibold">
        <Icon size={17} className="text-slate-400" /> {SECTION_LABEL[section]}
      </h2>
      <div className="divide-y divide-slate-100">
        {lines.map((l) => (
          <div key={l.key} className="px-4 py-3 break-inside-avoid">
            <div className="flex items-start gap-3">
              {l.n !== undefined && <Num n={l.n} type={l.type} />}
              <LineImage line={l} token={token} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.name}</div>
                {l.model?.detail && (
                  <div dir="auto" className="text-right text-xs text-slate-500">
                    {l.model.detail}
                  </div>
                )}
                {l.included && <div className="mt-0.5 text-xs font-medium text-blue-800">{l.included}</div>}
              </div>
              <div className="shrink-0 text-end text-sm">
                <div className="tabular-nums">
                  {l.qty} {l.unit}
                  {prices && l.price !== undefined && <span className="text-slate-500"> × {nis(l.price)}</span>}
                </div>
                {prices && l.price !== undefined && <div className="font-semibold tabular-nums">{nis(l.price * l.qty)}</div>}
              </div>
            </div>
            {/* what it does, across the whole line (on a phone the name's column is narrow) */}
            {l.features.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {l.features.map((f) => (
                  <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                    {f}
                  </span>
                ))}
              </div>
            )}
            {l.model?.description && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{l.model.description}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The work: everything that will be done and how much of it, in one list, for one price. */
function Labor({ items, price }: { items: Data["labor"]["items"]; price?: number }) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200 break-inside-avoid">
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-semibold">
        <Wrench size={17} className="text-slate-400" /> עבודה
      </h2>
      <ul className="space-y-1.5 px-4 py-3 text-sm">
        {items.map((it) => (
          <li key={it.name} className="flex gap-2">
            <Check size={16} className="mt-0.5 shrink-0 text-green-600" />
            <span className="min-w-0 flex-1">{it.name}</span>
            {it.amount && <span className="shrink-0 tabular-nums text-slate-600">{it.amount}</span>}
          </li>
        ))}
      </ul>
      {price !== undefined && (
        <div className="flex items-baseline justify-between border-t border-slate-100 px-4 py-3">
          <span className="font-medium">סה״כ עבודה</span>
          <span className="text-lg font-semibold tabular-nums">{nis(price)}</span>
        </div>
      )}
    </section>
  );
}

function Num({ n, type }: { n: number; type?: string }) {
  const color = type ? layerById(deviceTypeById(type).layer).color : "#334155";
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: color }}>
      {n}
    </span>
  );
}

/** The product's picture only when its model is shown; otherwise the kind's icon (a picture can be searched for the model). */
function LineImage({ line, token }: { line: PublicLine; token: string }) {
  if (line.model?.imageId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served through the link, no image optimizer
      <img src={`/api/q/${token}/img/${line.model.imageId}?w=160`} alt="" className="size-12 shrink-0 rounded-lg object-contain ring-1 ring-slate-100" />
    );
  }
  if (!line.type) return null;
  const def = deviceTypeById(line.type);
  const Icon = def.icon;
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-slate-50" style={{ color: layerById(def.layer).color }}>
      <Icon size={20} />
    </span>
  );
}

function Total({
  label,
  value,
  strong,
  big,
  muted,
  discount,
}: {
  label: string;
  value: string;
  strong?: boolean;
  big?: boolean;
  muted?: boolean;
  discount?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${strong ? "font-semibold" : ""} ${big ? "text-lg" : ""} ${discount ? "text-base font-bold text-green-700" : ""}`}
    >
      <span className={strong || discount ? "" : "text-slate-500"}>{label}</span>
      <span className={`tabular-nums ${muted ? "text-slate-400 line-through" : ""}`}>{value}</span>
    </div>
  );
}

/** The floor's plan (or what was drawn of it) with the planned equipment, numbered as in the list, and what each camera sees. */
function FloorPlan({ floor: f, many }: { floor: PublicFloor; many: boolean }) {
  const s = Math.max(f.W, f.H) / 26; // marker size, in drawing units
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 break-inside-avoid">
      {many && <h2 className="border-b border-slate-100 px-4 py-2.5 font-semibold">{f.name}</h2>}
      <PlanScroller tall={f.H > f.W}>
        <svg viewBox={`0 0 ${f.W} ${f.H}`} className="block h-auto w-full bg-slate-50" role="img" aria-label={`תכנית ${f.name}`}>
          {f.plan && <image href={f.plan.url} x={0} y={0} width={f.W} height={f.H} preserveAspectRatio="none" />}
          {f.areas.map((a, i) => (
            <polygon
              key={i}
              points={a.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={a.color}
              fillOpacity={0.1}
              stroke={a.color}
              strokeOpacity={0.4}
              strokeWidth={s / 8}
            />
          ))}
          {f.walls.map((w, i) => (
            <line key={i} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={w.color} strokeWidth={w.width} strokeLinecap="square" />
          ))}
          {f.cables.map((c, i) => (
            <polyline
              key={i}
              points={c.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={c.color}
              strokeOpacity={0.55}
              strokeWidth={s / 7}
              strokeLinejoin="round"
            />
          ))}
          {f.devices.map((d, i) =>
            d.camera ? (
              <path
                key={`fov${i}`}
                d={cone(d.x, d.y, d.camera.dir, d.camera.fov, d.camera.range * f.ppm)}
                fill="#dc2626"
                fillOpacity={0.07}
                stroke="#dc2626"
                strokeOpacity={0.3}
                strokeWidth={s / 10}
              />
            ) : null,
          )}
          {f.devices.map((d, i) => {
            const def = deviceTypeById(d.type);
            const Icon = def.icon;
            const color = layerById(def.layer).color;
            return (
              <g key={i}>
                <circle cx={d.x} cy={d.y} r={s / 2} fill={color} stroke="#fff" strokeWidth={s / 12} />
                <Icon x={d.x - s / 4} y={d.y - s / 4} width={s / 2} height={s / 2} color="#fff" strokeWidth={2.4} />
                {d.n !== undefined && (
                  <g>
                    <circle cx={d.x + s / 2.2} cy={d.y - s / 2.2} r={s / 3.2} fill="#0f172a" stroke="#fff" strokeWidth={s / 16} />
                    <text x={d.x + s / 2.2} y={d.y - s / 2.2} fontSize={s / 2.6} fontWeight={700} fill="#fff" textAnchor="middle" dominantBaseline="central">
                      {d.n}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </PlanScroller>
    </section>
  );
}

/** A camera's view: a slice of a circle from the camera, `dir` degrees from the right, clockwise. */
function cone(x: number, y: number, dir: number, fov: number, r: number) {
  if (fov >= 359) return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  const rad = (a: number) => (a * Math.PI) / 180;
  const a0 = rad(dir - fov / 2);
  const a1 = rad(dir + fov / 2);
  const p0 = [x + r * Math.cos(a0), y + r * Math.sin(a0)];
  const p1 = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
  return `M ${x} ${y} L ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${fov > 180 ? 1 : 0} 1 ${p1[0]} ${p1[1]} Z`;
}
