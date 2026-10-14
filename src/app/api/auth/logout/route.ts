import { endSession } from "@/lib/auth/current-user";

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
