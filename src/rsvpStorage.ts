export interface RsvpDeviceRecord {
  token: string;
  submittedAt: string;
  attendanceIntent: "ATTENDING" | "NOT_ATTENDING";
}

const storageKey = (slug: string) => `gather.rsvp.${slug}`;

export function readRsvpRecord(slug: string): RsvpDeviceRecord | null {
  if (!slug) return null;
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<RsvpDeviceRecord>;
    if (typeof candidate.token !== "string" || !candidate.token) return null;
    return {
      token: candidate.token,
      submittedAt: typeof candidate.submittedAt === "string" ? candidate.submittedAt : "",
      attendanceIntent: candidate.attendanceIntent === "NOT_ATTENDING" ? "NOT_ATTENDING" : "ATTENDING",
    };
  } catch {
    return null;
  }
}

export function saveRsvpRecord(slug: string, record: RsvpDeviceRecord): void {
  if (!slug) return;
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(record));
  } catch {
    // localStorage may be restricted; the sessionStorage token remains as a fallback.
  }
}

export function readRsvpToken(slug: string): string | null {
  const record = readRsvpRecord(slug);
  if (record) return record.token;
  if (!slug) return null;
  try {
    return sessionStorage.getItem(`${storageKey(slug)}.token`) || null;
  } catch {
    return null;
  }
}