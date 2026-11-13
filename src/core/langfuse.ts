import type { TraceEvent } from "./trace";

/** Optional export. Does nothing unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set. */
export async function exportTrace(
  trace: TraceEvent[],
  meta: { runId: string; name: string },
): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return;
  const host = process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";
  try {
    await fetch(`${host.replace(/\/$/, "")}/api/public/ingestion`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        batch: [
          {
            id: meta.runId,
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: { id: meta.runId, name: meta.name, output: trace },
          },
        ],
      }),
    });
  } catch {
    // Langfuse is optional and must not fail the user-facing run.
  }
}
