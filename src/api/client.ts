const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = (configuredBaseUrl || (import.meta.env.DEV ? "http://localhost:4000" : "")).replace(/\/+$/, "");
const TOKEN_KEY = "gather.access-token";
const DEVICE_ID_KEY = "gather.device-id";

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
  maxGuestCapacity?: number | null;
  reservedGuestCount?: number;
  availableGuestCount?: number | null;
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
  maxGuestCapacity?: number | null;
  approvalRequired?: boolean;
}

export interface ApiEventImageUploadSignatureResponse {
  upload: {
    cloud_name: string;
    api_key: string;
    timestamp: number;
    signature: string;
    folder: string;
    public_id: string;
    resource_type: "image";
    allowed_formats: string;
    overwrite: boolean;
    client_max_file_size_bytes: number;
    expires_at: number;
  };
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
  | "maxGuestCapacity"
  | "reservedGuestCount"
  | "availableGuestCount"
> & {
  hasReserved?: boolean;
};

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
export type ApiOrganiserRsvpStatus = "PENDING" | "APPROVED" | "REJECTED" | "DECLINED" | "CANCELLED" | "NOT_REQUIRED";
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

export interface ApiIssuedTicket {
  attendeeId: string;
  ticketId: string;
  qrToken: string;
}

export interface ApiOrganiserRsvpDetailResponse {
  registration: ApiOrganiserRsvpRegistration;
  tickets?: ApiIssuedTicket[];
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

let cachedDeviceId: string | null = null;

function createDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored && /^[A-Za-z0-9._:-]{8,128}$/.test(stored)) {
      cachedDeviceId = stored;
      return stored;
    }
  } catch {
    // localStorage may be restricted
  }
  cachedDeviceId = createDeviceId();
  try {
    localStorage.setItem(DEVICE_ID_KEY, cachedDeviceId);
  } catch {
    // localStorage may be restricted
  }
  return cachedDeviceId;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiError("The API URL is not configured. Set VITE_API_BASE_URL and rebuild the frontend.", 0);
  }

  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("x-device-id", getDeviceId());

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
      cache: init.cache ?? "no-store",
    });
    // If the backend's device columns are not migrated yet, a valid x-device-id can
    // make public endpoints fail. Retry once without it so the invitation still loads.
    if (response.status >= 500 && path.startsWith("/api/events/public/")) {
      const retryHeaders = new Headers(headers);
      retryHeaders.delete("x-device-id");
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: retryHeaders,
        credentials: "include",
        cache: init.cache ?? "no-store",
      });
    }
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
  uploadEventCoverImage: async (eventId: string, file: File) => {
    const { upload } = await request<ApiEventImageUploadSignatureResponse>(
      `/api/events/${encodeURIComponent(eventId)}/image-upload-signature`,
      { method: "POST" },
    );

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const mimeByExtension: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const allowedFormats = typeof upload.allowed_formats === "string"
      ? upload.allowed_formats.split(",").map((format) => format.trim().toLowerCase())
      : [];
    if (!mimeByExtension[extension] || !allowedFormats.includes(extension) || file.type.toLowerCase() !== mimeByExtension[extension]) {
      throw new ApiError("Choose a JPG, PNG, or WebP image allowed for this event.", 400);
    }
    if (!Number.isFinite(upload.client_max_file_size_bytes) || upload.client_max_file_size_bytes <= 0 || file.size > upload.client_max_file_size_bytes) {
      const limitMiB = Number.isFinite(upload.client_max_file_size_bytes) && upload.client_max_file_size_bytes > 0
        ? (upload.client_max_file_size_bytes / (1024 * 1024)).toFixed(0)
        : "the allowed";
      throw new ApiError(`Choose an image smaller than ${limitMiB} MiB.`, 413);
    }
    if (upload.expires_at <= Math.floor(Date.now() / 1000)) {
      throw new ApiError("The image upload authorization expired. Please try again.", 401);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(upload.cloud_name) || upload.resource_type !== "image"
      || !upload.api_key || !upload.signature || !upload.folder || !upload.public_id
      || !Number.isFinite(upload.timestamp) || typeof upload.overwrite !== "boolean") {
      throw new ApiError("Gather returned invalid image upload settings.", 500);
    }

    const body = new FormData();
    body.set("file", file);
    body.set("api_key", upload.api_key);
    body.set("timestamp", String(upload.timestamp));
    body.set("signature", upload.signature);
    body.set("folder", upload.folder);
    body.set("public_id", upload.public_id);
    body.set("allowed_formats", upload.allowed_formats);
    body.set("overwrite", String(upload.overwrite));

    let response: Response;
    try {
      response = await fetch(`https://api.cloudinary.com/v1_1/${upload.cloud_name}/${upload.resource_type}/upload`, {
        method: "POST",
        body,
      });
    } catch {
      throw new ApiError("Could not reach image storage. Check your connection and try again.", 0);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const cloudinaryError = typeof payload === "object" && payload !== null && "error" in payload
        ? (payload as { error?: { message?: unknown } }).error?.message
        : undefined;
      throw new ApiError(typeof cloudinaryError === "string" ? cloudinaryError : "Image upload failed. Please try again.", response.status);
    }

    const secureUrl = typeof payload === "object" && payload !== null && "secure_url" in payload
      ? (payload as { secure_url?: unknown }).secure_url
      : undefined;
    let isHttps = false;
    if (typeof secureUrl === "string") {
      try {
        isHttps = new URL(secureUrl).protocol === "https:";
      } catch {
        isHttps = false;
      }
    }
    if (typeof secureUrl !== "string" || !isHttps) {
      throw new ApiError("Image storage did not return a secure image URL.", 502);
    }
    return secureUrl;
  },
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
  approveOrganiserRsvp: (eventId: string, registrationId: string) =>
    request<ApiOrganiserRsvpDetailResponse>(
      `/api/events/${encodeURIComponent(eventId)}/rsvps/${encodeURIComponent(registrationId)}/approve`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  rejectOrganiserRsvp: (eventId: string, registrationId: string) =>
    request<ApiOrganiserRsvpDetailResponse>(
      `/api/events/${encodeURIComponent(eventId)}/rsvps/${encodeURIComponent(registrationId)}/reject`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  issueEventTickets: (eventId: string) =>
    request<{ tickets: Array<{ attendeeId: string; ticketId: string; qrToken: string }>; issuedCount: number }>(
      `/api/events/${encodeURIComponent(eventId)}/tickets/issue`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  listEventAttendees: (eventId: string, page = 1, pageSize = 50) =>
    request<ApiAttendeeListResponse>(
      `/api/events/${encodeURIComponent(eventId)}/attendees?page=${page}&pageSize=${pageSize}`,
    ),
  checkInTicket: (eventId: string, qrToken: string) =>
    request<ApiCheckInResult>(
      `/api/tickets/checkin`,
      {
        method: "POST",
        body: JSON.stringify({ eventId, qrToken }),
      },
    ),
};

export interface ApiAttendee {
  id: string;
  firstName: string;
  lastName: string;
  attendeeType: "PRIMARY" | "ADDITIONAL";
  attendanceIntent: "ATTENDING" | "NOT_ATTENDING";
  registrationStatus: "PENDING" | "APPROVED" | "DECLINED" | "REJECTED" | "CANCELLED" | "NOT_REQUIRED";
  hasTicket: boolean;
  checkedIn: boolean;
  checkedInAt: string | null;
}

export interface ApiAttendeeListResponse {
  attendees: ApiAttendee[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiCheckInResult {
  message: string;
  attendee: {
    id: string;
    firstName: string;
    lastName: string;
    attendeeType: "PRIMARY" | "ADDITIONAL";
  };
  checkedInAt: string;
}
