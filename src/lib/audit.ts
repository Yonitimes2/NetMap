"use client";

/** Records on the server that the signed-in user viewed or copied an equipment password. */
export function logAudit(accountId: string, action: string, target?: string) {
  void fetch(`/api/accounts/${encodeURIComponent(accountId)}/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, target }),
    keepalive: true,
  }).catch(() => {});
}
