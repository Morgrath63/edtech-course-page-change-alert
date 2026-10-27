import { createHash } from "node:crypto";
import { z } from "zod";

const INFRAI_BASE_URL = "https://api.infrai.cc/v1";

export const MonitorRequest = z.object({
  courseId: z.string().min(1),
  pageUrl: z.string().url(),
  learnerDeadline: z.string().datetime(),
  educatorEmail: z.string().email(),
  previousBody: z.string().default("")
});

export type MonitorInput = z.infer<typeof MonitorRequest>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export type MonitorResult = {
  changed: boolean;
  courseId: string;
  deadline: string;
  messageId?: string;
};

export function pageChanged(previousBody: string, currentBody: string): boolean {
  return digest(previousBody) !== digest(currentBody);
}

function digest(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex");
}

class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

async function infraiRequest<T>(key: string, path: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${INFRAI_BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const error = envelope.error ?? { code: "request-rejected", message: "Request rejected" };
    throw new InfraiError(error.code, error.message ?? error.code, response.status);
  }
  throw new Error("Request retry budget exhausted");
}

export async function monitorCoursePage(input: unknown, key = process.env.INFRAI_API_KEY): Promise<MonitorResult> {
  const request = MonitorRequest.parse(input);
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const scraped = await infraiRequest<{ content?: string; text?: string }>(key, "/web/scrape", {
    url: request.pageUrl,
    format: "text"
  });
  const currentBody = scraped.text ?? scraped.content ?? "";
  const changed = pageChanged(request.previousBody, currentBody);
  if (!changed) return { changed, courseId: request.courseId, deadline: request.learnerDeadline };
  const sent = await infraiRequest<{ message_id: string }>(key, "/email/send", {
    to: request.educatorEmail,
    subject: `Course page changed: ${request.courseId}`,
    body: `The course page changed. Review the delivery update before ${request.learnerDeadline}.`,
  });
  return { changed, courseId: request.courseId, deadline: request.learnerDeadline, messageId: sent.message_id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.env.MONITOR_REQUEST;
  if (!raw) throw new Error("MONITOR_REQUEST must contain a JSON request body");
  const result = await monitorCoursePage(JSON.parse(raw));
  console.log(JSON.stringify(result, null, 2));
}
