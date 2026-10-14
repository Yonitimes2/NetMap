"use client";

import { CloudUpload } from "lucide-react";
import { useEffect, useState } from "react";
import { docOf, replaceAccount, type DataState } from "@/lib/account-doc";
import { readLegacy, useApp, writeLegacy, type LegacyData } from "@/lib/store";
import { toast } from "@/lib/toast";
import { Button, Modal } from "./ui";

/** Accounts from the built-in demo, unticked by default. */
const DEMO_IDS = new Set(["acc-cohen", "acc-hayam"]);

/** Old data may lack lists that were added later. */
function normalize(state: LegacyData["state"]): DataState {
  return {
    accounts: state.accounts ?? [],
    sites: state.sites ?? [],
    floors: state.floors ?? [],
    devices: state.devices ?? [],
    links: state.links ?? [],
    areas: state.areas ?? [],
    notes: state.notes ?? [],
    walls: state.walls ?? [],
    openings: state.openings ?? [],
    obstacles: state.obstacles ?? [],
    chats: state.chats ?? {},
  };
}

/**
 * Before NetMap kept data on the server, everything was saved in the browser it was entered in.
 * That data was set aside when this version first loaded; here a system admin can upload it.
 */
export function ImportLocalData() {
  const inStore = useApp((s) => s.accounts);
  const [legacy, setLegacy] = useState<LegacyData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    readLegacy().then((l) => alive && setLegacy(l));
    return () => {
      alive = false;
    };
  }, []);

  if (!legacy || legacy.dismissed) return null;
  const data = normalize(legacy.state);
  const done = new Set([...(legacy.done ?? []), ...inStore.map((a) => a.id)]);
  const pending = data.accounts.filter((a) => !done.has(a.id));
  if (!pending.length) return null;

  const save = async (l: LegacyData) => {
    await writeLegacy(l);
    setLegacy(l);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
        <CloudUpload size={22} className="shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium text-blue-900">בדפדפן הזה יש {pending.length === 1 ? "עסק אחד" : `${pending.length} עסקים`} שעוד לא נמצאים בשרת</div>
          <div className="text-blue-800/80">הם נשמרו כאן לפני שהנתונים עברו לשרת. אחרי ההעלאה יראו אותם מכל מכשיר.</div>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          בחירה והעלאה
        </Button>
        <Button variant="ghost" onClick={() => save({ ...legacy, dismissed: true })}>
          לא להעלות
        </Button>
      </div>
      {open && (
        <UploadModal
          data={data}
          pending={pending.map((a) => a.id)}
          onClose={() => setOpen(false)}
          onDone={(ids) => save({ ...legacy, done: [...(legacy.done ?? []), ...ids] })}
        />
      )}
    </>
  );
}

function UploadModal({ data, pending, onClose, onDone }: { data: DataState; pending: string[]; onClose: () => void; onDone: (ids: string[]) => void }) {
  const [picked, setPicked] = useState(() => new Set(pending.filter((id) => !DEMO_IDS.has(id))));
  const summary = (id: string) => {
    const doc = docOf(data, id)!;
    return `${doc.sites.length} אתרים · ${doc.floors.length} קומות · ${doc.devices.length} רכיבים · ${doc.links.length} כבלים`;
  };

  const upload = () => {
    const ids = [...picked];
    // adding them to the store marks them as changed, so sync.ts saves each one on the server
    useApp.setState((s) => {
      let next: DataState = s;
      for (const id of ids) next = replaceAccount(next, id, docOf(data, id));
      const meta = { ...s.meta };
      for (const id of ids) meta[id] = { rev: 0, role: "super" };
      return { ...next, meta };
    });
    onDone(ids);
    toast(ids.length === 1 ? "העסק עולה לשרת" : `${ids.length} עסקים עולים לשרת`);
    onClose();
  };

  return (
    <Modal
      title="העלאת עסקים מהדפדפן הזה לשרת"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={!picked.size} onClick={upload}>
            העלאה לשרת
          </Button>
          <Button onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <div className="space-y-2">
        {pending.map((id) => {
          const a = data.accounts.find((x) => x.id === id)!;
          return (
            <label key={id} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 ring-1 ring-slate-200 hover:bg-slate-50">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={picked.has(id)}
                onChange={(e) =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (e.target.checked) n.add(id);
                    else n.delete(id);
                    return n;
                  })
                }
              />
              <span className="min-w-0">
                <span className="block font-medium">
                  {a.name} {DEMO_IDS.has(id) && <span className="text-xs font-normal text-amber-700">(עסק דמו)</span>}
                </span>
                <span className="block text-xs text-slate-500">{summary(id)}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">העסקים שלא תבחרו נשארים בדפדפן הזה בלבד, ואפשר להעלות אותם גם אחר כך.</p>
    </Modal>
  );
}
