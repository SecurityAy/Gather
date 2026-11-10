import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type EventStatus = "Draft" | "Published" | "Unpublished" | "Archived";
export type GuestStatus = "Pending" | "Approved" | "Declined";

export interface GalleryImage {
  id: string;
  src: string;
  published: boolean;
}

export interface EventRecord {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  graduateName: string;
  institution: string;
  faculty: string;
  department: string;
  qualification: string;
  startAt: string;
  endAt: string;
  timezone: string;
  venue: string;
  address: string;
  instructions: string;
  rsvpDeadline: string;
  additionalLimit: number;
  personalMessage: string;
  status: EventStatus;
  accent: string;
  coverImage?: string;
  galleryImages?: GalleryImage[];
}

export interface GuestRecord {
  id: string;
  eventId: string;
  name: string;
  email: string;
  phone: string;
  relationship: string;
  attending: boolean;
  additionalGuests: string[];
  status: GuestStatus;
  submittedAt: string;
  checkedIn: string[];
  ticketTokens?: Record<string, string>;
}

interface DemoStore {
  events: EventRecord[];
  guests: GuestRecord[];
}

export interface ActivityNotification {
  id: string;
  eventId: string;
  guestId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

const STORAGE_KEY = "gather.demo.v1";
const AUTH_KEY = "gather.demo.auth";
const NOTIFICATIONS_KEY = "gather.notifications.v1";
const DAY = 86_400_000;

function initialStore(): DemoStore {
  const date = new Date(Date.now() + 8 * DAY);
  date.setHours(16, 0, 0, 0);
  const localStart = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const rsvpDeadline = new Date(date.getTime() - 2 * DAY).toISOString().slice(0, 10);
  const event: EventRecord = {
    id: "event-next-chapter",
    slug: "the-next-chapter",
    title: "The Next Chapter",
    category: "Graduation Dinner",
    description: "A little celebration for a very big milestone.",
    graduateName: "Amara Okafor",
    institution: "University of Lagos",
    faculty: "Faculty of Arts",
    department: "English Language",
    qualification: "B.A. English",
    startAt: localStart,
    endAt: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos",
    venue: "The Wheatbaker",
    address: "4 Onitolo Road, Ikoyi, Lagos",
    instructions: "Garden entrance. Look for the little gold sign.",
    rsvpDeadline,
    additionalLimit: 2,
    personalMessage: "I couldn't have made it here without the people I love. Come celebrate this next chapter with me.",
    status: "Published",
    accent: "#b18a55",
  };
  const guests: GuestRecord[] = [
    { id: "guest-1", eventId: event.id, name: "Dara Adebayo", email: "dara@example.com", phone: "+234 803 555 0141", relationship: "Friend", attending: true, additionalGuests: ["Tomi Adebayo"], status: "Pending" as const, submittedAt: new Date(Date.now() - DAY).toISOString(), checkedIn: [] },
    { id: "guest-2", eventId: event.id, name: "Tunde Okafor", email: "tunde@example.com", phone: "+234 802 555 0184", relationship: "Uncle", attending: true, additionalGuests: [], status: "Approved" as const, submittedAt: new Date(Date.now() - 2 * DAY).toISOString(), checkedIn: [] },
    { id: "guest-3", eventId: event.id, name: "Zainab Bello", email: "zainab@example.com", phone: "+234 806 555 0122", relationship: "Course mate", attending: true, additionalGuests: ["Feyi Bello", "Mina Bello"], status: "Approved" as const, submittedAt: new Date(Date.now() - 3 * DAY).toISOString(), checkedIn: ["Zainab Bello"] },
    { id: "guest-4", eventId: event.id, name: "Kelechi Nwosu", email: "kelechi@example.com", phone: "+234 809 555 0188", relationship: "Cousin", attending: false, additionalGuests: [], status: "Approved" as const, submittedAt: new Date(Date.now() - 4 * DAY).toISOString(), checkedIn: [] },
  ].map((guest) => guest.status === "Approved" && guest.attending
    ? { ...guest, ticketTokens: Object.fromEntries([guest.name, ...guest.additionalGuests].map((name) => [name, createDemoToken()])) }
    : guest);
  return {
    events: [event],
    guests,
  };
}

function createDemoToken() {
  return `demo_${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizeGalleryImages(event: EventRecord & { galleryPublic?: boolean; galleryImages?: unknown }): EventRecord {
  if (!Array.isArray(event.galleryImages)) return { ...event, galleryImages: [] };
  const galleryImages: GalleryImage[] = [];
  for (const image of event.galleryImages) {
    if (typeof image === "string" && isSafeImageSource(image)) {
      galleryImages.push({ id: crypto.randomUUID(), src: image, published: event.galleryPublic === true });
      continue;
    }
    if (typeof image !== "object" || image === null || !("src" in image) || !("id" in image) || !("published" in image)) continue;
    const candidate = image as { id: unknown; src: unknown; published: unknown };
    if (typeof candidate.id === "string" && typeof candidate.src === "string" && typeof candidate.published === "boolean" && isSafeImageSource(candidate.src)) {
      galleryImages.push({ id: candidate.id, src: candidate.src, published: candidate.published });
    }
  }
  const { galleryPublic: _legacyGalleryPublic, ...normalized } = event;
  return { ...normalized, galleryImages };
}

function isSafeImageSource(src: string) {
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(src)) return true;
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}

function readStore(): DemoStore {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return initialStore();
  try {
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed === "object" && parsed !== null && "events" in parsed && "guests" in parsed) {
      const store = parsed as DemoStore;
      if (Array.isArray(store.events) && Array.isArray(store.guests)) {
        return {
          ...store,
          events: store.events.map((event) => normalizeGalleryImages(event as EventRecord & { galleryPublic?: boolean; galleryImages?: unknown })),
          guests: store.guests.map((guest) => guest.status === "Approved" && guest.attending && !guest.ticketTokens
            ? { ...guest, ticketTokens: Object.fromEntries([guest.name, ...guest.additionalGuests].map((name) => [name, createDemoToken()])) }
            : guest),
        };
      }
    }
    console.error("Gather demo data in local storage was invalid; loading the sample workspace.");
  } catch (reason) {
    console.error("Could not read Gather demo data from local storage; loading the sample workspace.", reason);
    return initialStore();
  }
  return initialStore();
}

function readNotifications(): ActivityNotification[] {
  const saved = localStorage.getItem(NOTIFICATIONS_KEY);
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every((notification) =>
      typeof notification === "object" && notification !== null &&
      "id" in notification && typeof notification.id === "string" &&
      "eventId" in notification && typeof notification.eventId === "string" &&
      "guestId" in notification && typeof notification.guestId === "string" &&
      "title" in notification && typeof notification.title === "string" &&
      "message" in notification && typeof notification.message === "string" &&
      "createdAt" in notification && typeof notification.createdAt === "string" &&
      "read" in notification && typeof notification.read === "boolean")) {
      return parsed as ActivityNotification[];
    }
    console.error("Gather notifications in local storage were invalid; showing an empty notification list.");
  } catch (reason) {
    console.error("Could not read Gather notifications from local storage; showing an empty notification list.", reason);
  }
  return [];
}

interface PlatformContextValue {
  events: EventRecord[];
  guests: GuestRecord[];
  notifications: ActivityNotification[];
  authenticated: boolean;
  signIn: () => void;
  signOut: () => void;
  saveEvent: (event: EventRecord) => EventRecord;
  removeEvent: (id: string) => void;
  updateGuestStatus: (id: string, status: GuestStatus) => void;
  addGuest: (guest: Omit<GuestRecord, "id" | "submittedAt" | "checkedIn">) => GuestRecord;
  checkIn: (guestId: string, attendeeName: string) => boolean;
  getEvent: (idOrSlug: string) => EventRecord | undefined;
  getPublishedGallery: (eventId: string) => GalleryImage[];
  getGuests: (eventId: string) => GuestRecord[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  notify: (message: string, tone?: "success" | "error") => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<DemoStore>(readStore);
  const [notifications, setNotifications] = useState<ActivityNotification[]>(readNotifications);
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem(AUTH_KEY) === "true");
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }, [notifications]);

  const value = useMemo<PlatformContextValue>(() => ({
    events: store.events,
    guests: store.guests,
    notifications,
    authenticated,
    signIn: () => {
      localStorage.setItem(AUTH_KEY, "true");
      setAuthenticated(true);
    },
    signOut: () => {
      localStorage.removeItem(AUTH_KEY);
      setAuthenticated(false);
    },
    saveEvent: (event) => {
      const exists = store.events.some((item) => item.id === event.id);
      const nextStore = {
        ...store,
        events: exists
          ? store.events.map((item) => item.id === event.id ? event : item)
          : [event, ...store.events],
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore));
      } catch {
        throw new Error("This browser could not save the event. Free up browser storage and try again.");
      }
      setStore(nextStore);
      return event;
    },
    removeEvent: (id) => setStore((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== id),
      guests: current.guests.filter((guest) => guest.eventId !== id),
    })),
    updateGuestStatus: (id, status) => setStore((current) => ({
      ...current,
      guests: current.guests.map((guest) => {
        if (guest.id !== id) return guest;
        const ticketTokens = status === "Approved" && guest.attending
          ? guest.ticketTokens || Object.fromEntries([guest.name, ...guest.additionalGuests].map((name) => [name, createDemoToken()]))
          : status === "Declined" ? undefined : guest.ticketTokens;
        return { ...guest, status, ticketTokens };
      }),
    })),
    addGuest: (input) => {
      const guest: GuestRecord = {
        ...input,
        id: `guest-${crypto.randomUUID()}`,
        submittedAt: new Date().toISOString(),
        checkedIn: [],
      };
      setStore((current) => ({ ...current, guests: [guest, ...current.guests] }));
      const event = store.events.find((item) => item.id === guest.eventId);
      setNotifications((current) => [{
        id: crypto.randomUUID(),
        eventId: guest.eventId,
        guestId: guest.id,
        title: "New RSVP received",
        message: `${guest.name} responded to ${event?.title || "your invitation"}.`,
        createdAt: new Date().toISOString(),
        read: false,
      }, ...current].slice(0, 50));
      return guest;
    },
    checkIn: (guestId, attendeeName) => {
      const guest = store.guests.find((item) => item.id === guestId);
      if (!guest || guest.checkedIn.includes(attendeeName)) return false;
      const event = store.events.find((item) => item.id === guest.eventId);
      setStore((current) => ({
        ...current,
        guests: current.guests.map((item) => item.id === guestId
          ? { ...item, checkedIn: [...item.checkedIn, attendeeName] }
          : item),
      }));
      setNotifications((current) => [{
        id: crypto.randomUUID(),
        eventId: guest.eventId,
        guestId: guest.id,
        title: "Guest checked in",
        message: `${attendeeName} arrived for ${event?.title || "your event"}.`,
        createdAt: new Date().toISOString(),
        read: false,
      }, ...current].slice(0, 50));
      return true;
    },
    getEvent: (idOrSlug) => store.events.find((event) => event.id === idOrSlug || event.slug === idOrSlug),
    getPublishedGallery: (eventId) => {
      const event = store.events.find((item) => item.id === eventId);
      if (!event || event.status !== "Published") return [];
      return (event.galleryImages || []).filter((image) => image.published).map(({ id, src }) => ({ id, src, published: true }));
    },
    getGuests: (eventId) => store.guests.filter((guest) => guest.eventId === eventId),
    markNotificationRead: (id) => setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item)),
    markAllNotificationsRead: () => setNotifications((current) => current.map((item) => ({ ...item, read: true }))),
    notify: (message, tone = "success") => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      setNotice({ message, tone });
      noticeTimer.current = window.setTimeout(() => setNotice(null), 3200);
    },
  }), [store, notifications, authenticated]);

  return (
    <PlatformContext.Provider value={value}>
      {children}
      {notice && <div role="status" className={`toast toast-${notice.tone}`}>{notice.message}</div>}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) throw new Error("usePlatform must be used within PlatformProvider");
  return context;
}

export function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }, timeZone?: string) {
  if (!value) return "Date to be announced";
  return new Intl.DateTimeFormat("en", { ...options, ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
}

export function formatTime(value: string, timeZone?: string) {
  if (!value) return "Time to be announced";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
}

export function toLocalDateTimeInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function attendeeCount(guest: GuestRecord) {
  return guest.attending ? 1 + guest.additionalGuests.length : 0;
}

export function getDemoTicketToken(guest: GuestRecord, attendeeName: string) {
  return guest.ticketTokens?.[attendeeName] || "";
}
