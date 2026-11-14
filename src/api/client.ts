const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = (configuredBaseUrl || (import.meta.env.DEV ? "http://localhost:4000" : "")).replace(/\/+$/, "");
const TOKEN_KEY = "gather.access-token";

export interface ApiUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  accountStatus: string;
  emailVerifiedAt: string | null;
  profileImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEvent {
  id: string;
  userId: string;
  title: string;
  slug: string;
  eventCategory: string;
  description: string | null;
  graduateName: string | null;
  graduateImageUrl: string | null;
  institution: string | null;
  faculty: string | null;
  department: string | null;
  qualification: string | null;
  eventDate: string | null;
  timezone: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueInstructions: string | null;
  personalMessage: string | null;
  coverImageUrl: string | null;
  rsvpDeadline: string | null;
  additionalGuestLimit: number | null;
  approvalRequired: boolean;
  eventStatus: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "CANCELLED" | "COMPLETED";
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts?: {
    registrationCount: number;
    pendingRegistrationCount: number;
    approvedAttendeeCount: number;
  };
}

export interface ApiEventInput {
  title: string;
  slug?: string;
  eventCategory: string;
  description?: string | null;
  graduateName?: string | null;
  institution?: string | null;
  faculty?: string | null;
  department?: string | null;
  qualification?: string | null;
  eventDate?: string | null;
  timezone?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueInstructions?: string | null;
  personalMessage?: string | null;
  coverImageUrl?: string | null;
  rsvpDeadline?: string | null;
  additionalGuestLimit?: number | null;
  approvalRequired?: boolean;
}

export type ApiPublicEvent = Pick<ApiEvent,
  | "title"
  | "slug"
  | "eventCategory"
  | "description"
  | "graduateName"
  | "graduateImageUrl"
  | "institution"
  | "faculty"
  | "department"
  | "qualification"
  | "eventDate"
  | "timezone"
  | "venueName"
  | "venueAddress"
  | "venueInstructions"
  | "personalMessage"
  | "coverImageUrl"
  | "rsvpDeadline"
  | "additionalGuestLimit"
>;

export interface ApiRsvpSubmissionInput {
  primaryGuestName: string;
  primaryGuestEmail: string;
  primaryGuestPhone: string;
  relationshipToGraduate?: string;
  attendanceIntent: "ATTENDING" | "NOT_ATTENDING";
  additionalGuestNames?: string[];
}

export interface ApiRsvpSubmissionResponse {
  confirmationToken: string;
  registration: {
    attendanceIntent: "ATTENDING" | "NOT_ATTENDING";
    status: "PENDING" | "APPROVED" | "NOT_REQUIRED";
    createdAt: string;
    attendees: Array<{
      firstName: string;
      lastName: string;
      attendeeType: "PRIMARY" | "ADDITIONAL";
    }>;
  };
}

export interface ApiRsvpConfirmationResponse {
  confirmation: {
    attendanceIntent: "ATTENDING" | "NOT_ATTENDING";
    status: "PENDING" | "APPROVED" | "NOT_REQUIRED";
    relationshipToGraduate: string | null;
    createdAt: string;
    event: {
      title: string;
      slug: string;
      eventDate: string | null;
      timezone: string | null;
      venueName: string | null;
      venueAddress: string | null;
      eventStatus: string;
    };
    attendees: Array<{
      firstName: string;
      lastName: string;
      attendeeType: "PRIMARY" | "ADDITIONAL";
    }>;
  };
}

export type ApiOrganiserRsvpAttendanceIntent = "ATTENDING" | "NOT_ATTENDING";
export type ApiOrganiserRsvpStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED" | "NOT_REQUIRED";
export type ApiOrganiserRsvpAttendeeType = "PRIMARY" | "ADDITIONAL";

export interface ApiOrganiserRsvpAttendee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  attendeeType: ApiOrganiserRsvpAttendeeType;
  createdAt: string;
}

export interface ApiOrganiserRsvpRegistration {
  id: string;
  attendanceIntent: ApiOrganiserRsvpAttendanceIntent;
  status: ApiOrganiserRsvpStatus;
  relationshipToGraduate: string | null;
  createdAt: string;
  attendees: ApiOrganiserRsvpAttendee[];
}

export interface ApiOrganiserRsvpPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiOrganiserRsvpListResponse {
  registrations: ApiOrganiserRsvpRegistration[];
  pagination: ApiOrganiserRsvpPagination;
}

export interface ApiOrganiserRsvpDetailResponse {
  registration: ApiOrganiserRsvpRegistration;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiError("The API URL is not configured. Set VITE_API_BASE_URL and rebuild the frontend.", 0);
  }

  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      cache: init.cache ?? "no-store",
    });
  } catch {
    throw new ApiError("Could not reach Gather. Check the API connection and try again.", 0);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearAccessToken();
      window.dispatchEvent(new Event("gather:unauthorized"));
    }

    const body = typeof payload === "object" && payload !== null ? payload as {
      message?: unknown;
      errors?: Array<{ path?: unknown; message?: unknown }>;
    } : undefined;
    const details = Array.isArray(body?.errors)
      ? body.errors.map((item) => ({
        path: typeof item.path === "string" ? item.path : "",
        message: typeof item.message === "string" ? item.message : "Invalid value.",
      }))
      : undefined;
    const message = typeof body?.message === "string" ? body.message : "The request could not be completed.";
    throw new ApiError(message, response.status, details);
  }

  return payload as T;
}

export const api = {
  register: (input: { firstName: string; lastName: string; email: string; password: string }) =>
    request<{ user: ApiUser; token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: { email: string; password: string }) =>
    request<{ user: ApiUser; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  me: () => request<{ user: ApiUser }>("/api/auth/me"),
  listEvents: (page = 1, pageSize = 100) =>
    request<{ events: ApiEvent[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(
      `/api/events?page=${page}&pageSize=${pageSize}`,
    ),
  getEvent: (id: string) => request<{ event: ApiEvent }>(`/api/events/${encodeURIComponent(id)}`),
  createEvent: (input: ApiEventInput) =>
    request<{ event: ApiEvent }>("/api/events", { method: "POST", body: JSON.stringify(input) }),
  updateEvent: (id: string, input: Partial<ApiEventInput>) =>
    request<{ event: ApiEvent }>(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  publishEvent: (id: string) =>
    request<{ event: ApiEvent }>(`/api/events/${encodeURIComponent(id)}/publish`, { method: "POST" }),
  unpublishEvent: (id: string) =>
    request<{ event: ApiEvent }>(`/api/events/${encodeURIComponent(id)}/unpublish`, { method: "POST" }),
  deleteEvent: (id: string) =>
    request<{ event: ApiEvent }>(`/api/events/${encodeURIComponent(id)}`, { method: "DELETE" }),
  publicEvent: (slug: string) =>
    request<{ event: ApiPublicEvent }>(
      `/api/events/public/${encodeURIComponent(slug)}`,
    ),
  submitRsvp: (slug: string, input: ApiRsvpSubmissionInput) =>
    request<ApiRsvpSubmissionResponse>(
      `/api/events/public/${encodeURIComponent(slug)}/rsvp`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  getRsvpConfirmation: (slug: string, token: string) =>
    request<ApiRsvpConfirmationResponse>(
      `/api/events/public/${encodeURIComponent(slug)}/rsvp/confirmation`,
      {
        method: "POST",
        body: JSON.stringify({ token }),
      },
    ),
  listOrganiserRsvps: (eventId: string, page = 1, pageSize = 20) =>
    request<ApiOrganiserRsvpListResponse>(
      `/api/events/${encodeURIComponent(eventId)}/rsvps?page=${page}&pageSize=${pageSize}`,
    ),
  getOrganiserRsvp: (eventId: string, registrationId: string) =>
    request<ApiOrganiserRsvpDetailResponse>(
      `/api/events/${encodeURIComponent(eventId)}/rsvps/${encodeURIComponent(registrationId)}`,
    ),
};
