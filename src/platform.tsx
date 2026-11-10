import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, clearAccessToken, getAccessToken, setAccessToken } from "./api/client";
import type { ApiEvent, ApiPublicEvent, ApiUser } from "./api/client";

export type EventStatus = "Draft" | "Published" | "Unpublished" | "Cancelled" | "Completed" | "Archived";
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
  registrationCount?: number;
  pendingRegistrationCount?: number;
  approvedAttendeeCount?: number;
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
const NOTIFICATIONS_KEY = "gather.notifications.v1";
const COVER_IMAGES_KEY = "gather.cover-images.v1";
const DAY = 86_400_000;

function readCoverImages(): Record<string, string> {
  const raw = localStorage.getItem(COVER_IMAGES_KEY);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Saved cover images could not be read. Clear this browser's saved cover images and try again.");
  }
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] =>
    typeof entry[0] === "string" && typeof entry[1] === "string" && /^data:image\/(?:jpeg|png|webp);base64,/i.test(entry[1])));
}

function getLocalCoverImage(slug: string) {
  return slug ? readCoverImages()[slug] : undefined;
}

function saveLocalCoverImage(slug: string, coverImage?: string) {
  if (!slug) return;
  const coverImages = readCoverImages();
  if (coverImage?.startsWith("data:image/")) coverImages[slug] = coverImage;
  else delete coverImages[slug];
  try {
    localStorage.setItem(COVER_IMAGES_KEY, JSON.stringify(coverImages));
  } catch (reason) {
    throw new Error(`The cover image could not be saved in this browser: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
}

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

function statusFromApi(status: ApiEvent["eventStatus"]): EventStatus {
  switch (status) {
    case "DRAFT": return "Draft";
    case "PUBLISHED": return "Published";
    case "UNPUBLISHED": return "Unpublished";
    case "CANCELLED": return "Cancelled";
    case "COMPLETED": return "Completed";
  }
}

function localDateTime(value: string | null, timeZone: string | null) {
  if (!value) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  } catch {
    return toLocalDateTimeInput(new Date(value));
  }
}

export function eventFromApi(event: ApiEvent): EventRecord {
  const coverImage = getLocalCoverImage(event.slug) || event.coverImageUrl || undefined;
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    category: event.eventCategory,
    description: event.description ?? "",
    graduateName: event.graduateName ?? "",
    institution: event.institution ?? "",
    faculty: event.faculty ?? "",
    department: event.department ?? "",
    qualification: event.qualification ?? "",
    startAt: event.eventDate ?? "",
    endAt: "",
    timezone: event.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    venue: event.venueName ?? "",
    address: event.venueAddress ?? "",
    instructions: event.venueInstructions ?? "",
    rsvpDeadline: event.rsvpDeadline?.slice(0, 10) ?? "",
    additionalLimit: event.additionalGuestLimit ?? 0,
    personalMessage: event.personalMessage ?? "",
    status: statusFromApi(event.eventStatus),
    accent: "#b18a55",
    ...(coverImage ? { coverImage } : {}),
    galleryImages: [],
    registrationCount: event.counts?.registrationCount ?? 0,
    pendingRegistrationCount: event.counts?.pendingRegistrationCount ?? 0,
    approvedAttendeeCount: event.counts?.approvedAttendeeCount ?? 0,
  };
}

export function publicEventFromApi(event: ApiPublicEvent): EventRecord {
  const coverImage = getLocalCoverImage(event.slug) || event.coverImageUrl || undefined;
  return {
    id: event.slug,
    slug: event.slug,
    title: event.title,
    category: event.eventCategory,
    description: event.description ?? "",
    graduateName: event.graduateName ?? "",
    institution: event.institution ?? "",
    faculty: event.faculty ?? "",
    department: event.department ?? "",
    qualification: event.qualification ?? "",
    startAt: localDateTime(event.eventDate, event.timezone),
    endAt: "",
    timezone: event.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    venue: event.venueName ?? "",
    address: event.venueAddress ?? "",
    instructions: event.venueInstructions ?? "",
    rsvpDeadline: event.rsvpDeadline?.slice(0, 10) ?? "",
    additionalLimit: event.additionalGuestLimit ?? 0,
    personalMessage: event.personalMessage ?? "",
    status: "Published",
    accent: "#b18a55",
    ...(coverImage ? { coverImage } : {}),
    galleryImages: [],
  };
}

function dateToApi(value: string, timeZone: string, endOfDay = false) {
  if (!value) return null;
  const dateTime = endOfDay && value.length === 10 ? `${value}T23:59:59` : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(dateTime);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const targetWallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let timestamp = targetWallTime;

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
      const representedWallTime = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      const difference = targetWallTime - representedWallTime;
      timestamp += difference;
      if (difference === 0) break;
    }
  } catch {
    const date = new Date(dateTime);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return new Date(timestamp).toISOString();
}

function eventToApi(event: EventRecord) {
  let coverImageUrl: string | undefined;
  if (event.coverImage) {
    try {
      const coverUrl = new URL(event.coverImage);
      if (coverUrl.protocol === "https:" || coverUrl.protocol === "http:") coverImageUrl = coverUrl.toString();
    } catch {
      coverImageUrl = undefined;
    }
  }

  return {
    title: event.title,
    slug: event.slug || undefined,
    eventCategory: event.category,
    description: event.description || null,
    graduateName: event.graduateName || null,
    institution: event.institution || null,
    faculty: event.faculty || null,
    department: event.department || null,
    qualification: event.qualification || null,
    eventDate: dateToApi(event.startAt, event.timezone),
    timezone: event.timezone || null,
    venueName: event.venue || null,
    venueAddress: event.address || null,
    venueInstructions: event.instructions || null,
    personalMessage: event.personalMessage || null,
    coverImageUrl: coverImageUrl ?? null,
    rsvpDeadline: dateToApi(event.rsvpDeadline, event.timezone, true),
    additionalGuestLimit: event.additionalLimit,
    approvalRequired: true,
  };
}

interface PlatformContextValue {
  events: EventRecord[];
  guests: GuestRecord[];
  notifications: ActivityNotification[];
  authenticated: boolean;
  authLoading: boolean;
  authError: string;
  user: ApiUser | null;
  eventsLoading: boolean;
  eventsError: string;
  login: (email: string, password: string) => Promise<ApiUser>;
  register: (firstName: string, lastName: string, email: string, password: string) => Promise<ApiUser>;
  signOut: () => void;
  refreshEvents: () => Promise<void>;
  refreshEvent: (id: string) => Promise<EventRecord>;
  saveEvent: (event: EventRecord) => Promise<EventRecord>;
  publishEvent: (id: string) => Promise<EventRecord>;
  unpublishEvent: (id: string) => Promise<EventRecord>;
  removeEvent: (id: string) => Promise<void>;
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
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error"; exiting?: boolean } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }, [notifications]);

  const refreshEvents = async () => {
    if (!getAccessToken()) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    setEventsError("");
    try {
      const result = await api.listEvents();
      const loadedEvents = result.events.map(eventFromApi);
      setEvents(loadedEvents);
      setStore((current) => ({ ...current, events: loadedEvents, guests: [] }));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not load your events.";
      setEventsError(message);
      throw reason;
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const token = getAccessToken();
    if (!token) {
      setAuthLoading(false);
      return () => { active = false; };
    }

    void api.me().then(async ({ user: profile }) => {
      if (!active) return;
      setUser(profile);
      setAuthError("");
      await refreshEvents();
    }).catch((reason: unknown) => {
      if (!active) return;
      if (getAccessToken()) {
        setAuthError(reason instanceof Error ? reason.message : "Could not verify your session.");
      } else {
        setUser(null);
      }
    }).finally(() => {
      if (active) setAuthLoading(false);
    });

    const handleUnauthorized = () => {
      if (!active) return;
      setUser(null);
      setEvents([]);
    };
    window.addEventListener("gather:unauthorized", handleUnauthorized);
    return () => {
      active = false;
      window.removeEventListener("gather:unauthorized", handleUnauthorized);
    };
  }, []);

  const value = useMemo<PlatformContextValue>(() => ({
    events,
    guests: store.guests.filter((guest) => events.some((event) => event.id === guest.eventId)),
    notifications,
    authenticated: user !== null,
    authLoading,
    authError,
    user,
    eventsLoading,
    eventsError,
    login: async (email, password) => {
      const result = await api.login({ email, password });
      setAccessToken(result.token);
      setUser(result.user);
      setAuthError("");
      await refreshEvents().catch(() => undefined);
      return result.user;
    },
    register: async (firstName, lastName, email, password) => {
      const result = await api.register({ firstName, lastName, email, password });
      setAccessToken(result.token);
      setUser(result.user);
      setAuthError("");
      await refreshEvents().catch(() => undefined);
      return result.user;
    },
    signOut: () => {
      clearAccessToken();
      setUser(null);
      setEvents([]);
      setEventsError("");
      setAuthError("");
    },
    refreshEvents,
    refreshEvent: async (id) => {
      const { event } = await api.getEvent(id);
      const mappedEvent = eventFromApi(event);
      setEvents((current) => current.some((item) => item.id === id)
        ? current.map((item) => item.id === id ? mappedEvent : item)
        : [mappedEvent, ...current]);
      return mappedEvent;
    },
    saveEvent: async (event) => {
      saveLocalCoverImage(event.slug, event.coverImage);
      const exists = events.some((item) => item.id === event.id);
      const result = exists
        ? await api.updateEvent(event.id, eventToApi(event))
        : await api.createEvent(eventToApi(event));
      const mappedEvent = eventFromApi(result.event);
      setEvents((current) => current.some((item) => item.id === mappedEvent.id)
        ? current.map((item) => item.id === mappedEvent.id ? mappedEvent : item)
        : [mappedEvent, ...current]);
      return mappedEvent;
    },
    publishEvent: async (id) => {
      const { event } = await api.publishEvent(id);
      const mappedEvent = eventFromApi(event);
      setEvents((current) => current.map((item) => item.id === id ? mappedEvent : item));
      return mappedEvent;
    },
    unpublishEvent: async (id) => {
      const { event } = await api.unpublishEvent(id);
      const mappedEvent = eventFromApi(event);
      setEvents((current) => current.map((item) => item.id === id ? mappedEvent : item));
      return mappedEvent;
    },
    removeEvent: async (id) => {
      await api.deleteEvent(id);
      setEvents((current) => current.filter((event) => event.id !== id));
      setStore((current) => ({ ...current, guests: current.guests.filter((guest) => guest.eventId !== id) }));
    },
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
    getEvent: (idOrSlug) => events.find((event) => event.id === idOrSlug || event.slug === idOrSlug),
    getPublishedGallery: (eventId) => {
      const event = events.find((item) => item.id === eventId);
      if (!event || event.status !== "Published") return [];
      return (event.galleryImages || []).filter((image) => image.published).map(({ id, src }) => ({ id, src, published: true }));
    },
    getGuests: (eventId) => store.guests.filter((guest) => guest.eventId === eventId),
    markNotificationRead: (id) => setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item)),
    markAllNotificationsRead: () => setNotifications((current) => current.map((item) => ({ ...item, read: true }))),
    notify: (message, tone = "success") => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      setNotice({ message, tone, exiting: false });
      noticeTimer.current = window.setTimeout(() => {
        setNotice((current) => current ? { ...current, exiting: true } : null);
        noticeTimer.current = window.setTimeout(() => {
          setNotice(null);
          noticeTimer.current = null;
        }, 260);
      }, 2940);
    },
  }), [store, events, notifications, user, authLoading, authError, eventsLoading, eventsError]);

  return (
    <PlatformContext.Provider value={value}>
      {children}
      {notice && <div role="status" className={`toast toast-${notice.tone}${notice.exiting ? " toast-exiting" : ""}`}>{notice.message}</div>}
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
