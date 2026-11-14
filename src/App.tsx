import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Clock3,
  Copy, Download, ExternalLink, Eye, EyeOff, Filter, Heart, ImagePlus,
  LayoutDashboard, ListFilter, LoaderCircle, LockKeyhole, LogOut, Mail,
  MapPin, Menu, MoreHorizontal, Plus, Search, Settings, Share2, ShieldCheck,
  Sparkles, Sun, Moon, Ticket, Trash2, Upload, UserRound, Users, X, XCircle, QrCode,
} from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import JSZip from "jszip";
import { formatDate, formatTime, getDemoTicketToken, PlatformProvider, publicEventFromApi, slugify, usePlatform } from "./platform";
import type { EventRecord, GalleryImage, GuestRecord } from "./platform";
import { api, ApiError } from "./api/client";
import type { ApiOrganiserRsvpRegistration, ApiRsvpConfirmationResponse } from "./api/client";

const ticketToken = (guest: GuestRecord, attendeeName: string) => getDemoTicketToken(guest, attendeeName);
const Scanner = lazy(() => import("./Scanner"));
type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => localStorage.getItem("gather.theme") === "dark" ? "dark" : "light");
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("gather.theme", theme);
  }, [theme]);

  const setTheme = (nextTheme: Theme) => {
    if (nextTheme === theme) return;
    const root = document.documentElement;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("theme-transition");
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
      transitionTimer.current = window.setTimeout(() => {
        root.classList.remove("theme-transition");
        transitionTimer.current = null;
      }, 420);
    }
    setThemeState(nextTheme);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}

function App() {
  return (
    <ThemeProvider>
      <PlatformProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/event/:slug" element={<PublicEventPage />} />
          <Route path="/event/:slug/rsvp" element={<RsvpPage />} />
          <Route path="/event/:slug/confirmation" element={<RsvpConfirmation />} />
          <Route path="/ticket/:token" element={<PublicTicketPage />} />
          <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/create" element={<EventWizard />} />
            <Route path="events/:eventId" element={<EventOverviewPage />} />
            <Route path="events/:eventId/edit" element={<EventWizard />} />
            <Route path="events/:eventId/guests" element={<GuestManagementPage />} />
            <Route path="events/:eventId/guests/:guestId" element={<GuestDetailsPage />} />
            <Route path="events/:eventId/tickets" element={<TicketManagementPage />} />
            <Route path="events/:eventId/check-in" element={<CheckInPage />} />
            <Route path="events/:eventId/gallery" element={<GalleryPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </PlatformProvider>
    </ThemeProvider>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authenticated, authLoading, authError } = usePlatform();
  const location = useLocation();
  if (authLoading) {
    return <div className="simple-auth"><div className="auth-form-wrap"><LoaderCircle className="spin" size={24} /><p>Checking your Gather account…</p></div></div>;
  }
  if (authError) {
    return <div className="simple-error"><Brand /><div className="error-card"><h1>We couldn't<br /><em>reach Gather.</em></h1><p>{authError}</p><Link to="/login" className="button button-dark">Sign in again <ArrowRight size={16} /></Link></div></div>;
  }
  return authenticated ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link to="/" className={`brand ${inverse ? "brand-inverse" : ""}`} aria-label="Gather home"><span className="brand-symbol"><img src="/gather-mark.png" alt="" /></span><span>gather<span className="brand-period">.</span></span></Link>;
}

function NotificationCenter() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = usePlatform();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="notification-center" ref={containerRef}>
    <button className="icon-button notification-trigger" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} aria-expanded={open} aria-controls="notification-list" onClick={() => setOpen((current) => !current)}>
      <Bell size={18} />{unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
    {open && <section className="notification-popover" id="notification-list" aria-label="Recent notifications">
      <div className="notification-heading"><b>Notifications</b><button type="button" onClick={markAllNotificationsRead} disabled={!unreadCount}>Mark all read</button></div>
      {notifications.length ? <div className="notification-items">{notifications.map((notification) => <Link className={`notification-item ${notification.read ? "" : "notification-unread"}`} key={notification.id} to={`/dashboard/events/${notification.eventId}/guests/${notification.guestId}`} onClick={() => { markNotificationRead(notification.id); setOpen(false); }}>
        <span className="notification-item-dot" aria-hidden="true" />
        <span className="notification-item-copy"><b>{notification.title}</b><span>{notification.message}</span><small>{formatNotificationTime(notification.createdAt)}</small></span>
      </Link>)}</div> : <p className="notification-empty">You’re all caught up. New RSVPs and check-ins will appear here.</p>}
    </section>}
  </div>;
}

function formatNotificationTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function HomePage() {
  const { authenticated } = usePlatform();
  return (
    <div className="marketing">
      <header className="marketing-nav">
        <Brand />
        <nav className="marketing-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a><a href="#features">Features</a>
        </nav>
        <div className="nav-actions">
          <Link className="button button-quiet" to={authenticated ? "/dashboard" : "/login"}>{authenticated ? "Dashboard" : "Sign in"}</Link>
          <Link className="button button-dark" to={authenticated ? "/dashboard/events/create" : "/signup"}>Get started <ArrowUpRight size={15} /></Link>
        </div>
      </header>
      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> A little more meaningful</div>
            <h1>For the day you<br />worked <em>so hard</em> for.</h1>
            <p className="hero-subtitle">A beautiful place to bring everyone you love together. Create your graduation invitation, collect RSVPs, and enjoy every moment.</p>
            <div className="hero-buttons"><Link to={authenticated ? "/dashboard/events/create" : "/signup"} className="button button-dark button-large">Create your invitation <ArrowRight size={17} /></Link><a className="text-link" href="#how-it-works">See how it works <ArrowDownRight size={16} /></a></div>
            <div className="hero-proof"><div className="avatar-stack"><span>AO</span><span>SK</span><span>MB</span><span>+</span></div><div><strong>Made for your moment</strong><small>Thoughtful invitations, effortless hosting</small></div></div>
          </div>
          <div className="hero-art" aria-label="Graduation invitation preview">
            <div className="hero-art-grain" />
            <div className="art-flower flower-one">✳</div><div className="art-flower flower-two">✳</div>
            <div className="invitation-preview">
              <span className="preview-kicker">WITH JOY IN OUR HEARTS</span>
              <div className="preview-rule" />
              <div className="preview-monogram">A</div>
              <span className="preview-kicker">AMARA OKAFOR</span>
              <h2>One chapter<br />ends. Another<br /><em>begins.</em></h2>
              <p>Join me as I celebrate<br />my graduation</p>
              <div className="preview-date"><span>14</span><i>NOVEMBER<br />2026</i></div>
              <span className="preview-place">LAGOS · 4:00 IN THE AFTERNOON</span>
            </div>
            <div className="art-caption"><span className="caption-dot" /> MADE FOR YOUR MOMENT <span>01 — 06</span></div>
            <div className="floating-note"><span className="note-icon"><Heart size={16} /></span><span><b>Everyone in one place</b><small>Invites, RSVPs & tickets</small></span><CheckCircle2 size={17} className="note-check" /></div>
          </div>
          <div className="hero-side-note">A BEAUTIFUL WAY TO SAY<br />“I’D LOVE FOR YOU TO BE THERE.”</div>
        </section>
        <section className="ticker" aria-label="Platform benefits"><span>MORE THAN AN INVITATION</span><i>✳</i><span>YOUR PEOPLE, IN ONE PLACE</span><i>✳</i><span>EVERY MOMENT, THOUGHTFULLY MADE</span></section>
        <section className="how-section section-wrap" id="how-it-works">
          <div className="section-intro"><div className="eyebrow"><span className="eyebrow-line" /> YOUR DAY, YOUR WAY</div><h2>From “save the date”<br />to <em>“that was perfect.”</em></h2></div>
          <div className="steps-grid">
            <article className="step-card"><span className="step-number">01</span><div className="step-icon"><Sparkles size={20} /></div><h3>Make it yours</h3><p>Build an invitation that feels like you, with all the details your people need.</p></article>
            <article className="step-card"><span className="step-number">02</span><div className="step-icon"><Users size={20} /></div><h3>Bring everyone in</h3><p>Share one link. Collect RSVPs, plus-ones and guest details in one lovely place.</p></article>
            <article className="step-card"><span className="step-number">03</span><div className="step-icon"><Ticket size={20} /></div><h3>Be in the moment</h3><p>Approve your guests, send their tickets and welcome everyone with a quick scan.</p></article>
          </div>
        </section>
        <section className="feature-band" id="features"><div className="feature-band-inner"><div><div className="eyebrow eyebrow-light"><span className="eyebrow-line" /> THE DETAILS, HANDLED</div><h2>Less list-keeping.<br /><em>More celebrating.</em></h2><p>Every RSVP, every plus-one, every little detail—together, so you can focus on the people who got you here.</p><Link className="button button-light" to={authenticated ? "/dashboard" : "/signup"}>Make your invitation <ArrowRight size={16} /></Link></div><div className="feature-list"><div><span>01</span><b>One link, everyone invited</b><Check size={17} /></div><div><span>02</span><b>Guest approvals, made easy</b><Check size={17} /></div><div><span>03</span><b>Tickets that get them in</b><Check size={17} /></div><div><span>04</span><b>A smoother day-of check-in</b><Check size={17} /></div></div></div></section>
        <section className="closing-cta section-wrap"><div className="closing-ornament">✳</div><div className="eyebrow"><span className="eyebrow-line" /> YOU EARNED THIS</div><h2>Make room for <em>your people.</em></h2><p>Your next chapter deserves a beautiful beginning.</p><Link to={authenticated ? "/dashboard/events/create" : "/signup"} className="button button-dark">Start your invitation <ArrowRight size={16} /></Link></section>
      </main>
      <footer className="marketing-footer"><Brand /><span>Made for the milestones that matter.</span><span>© 2026 Gather</span></footer>
    </div>
  );
}

function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { login, register, authenticated, authLoading, notify } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (mode === "signup" && data.get("password") !== data.get("confirmPassword")) {
      setError("Those passwords don't match yet.");
      return;
    }
    if (mode === "signup") {
      const fullName = String(data.get("name") ?? "").trim().split(/\s+/);
      if (fullName.length < 2 || fullName.some((part) => part.length < 2)) {
        setError("Enter your first and last name to create an account.");
        return;
      }
    }
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const [firstName, ...lastName] = String(data.get("name")).trim().split(/\s+/);
        await register(firstName, lastName.join(" "), String(data.get("email")), String(data.get("password")));
      } else {
        await login(String(data.get("email")), String(data.get("password")));
      }
      notify(mode === "signup" ? "Your account is ready." : "Welcome back. You're signed in.");
      const state = location.state as { from?: string } | null;
      navigate(state?.from || "/dashboard");
    } catch (reason) {
      const validationDetails = reason instanceof ApiError
        ? reason.details?.map((detail) => detail.message).filter(Boolean).join(" ")
        : "";
      setError(validationDetails || (reason instanceof Error ? reason.message : "We couldn't sign you in. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  if (authenticated && !authLoading) return <Navigate to="/dashboard" replace />;
  return (
    <div className="auth-page">
      <div className="auth-left"><div className="auth-back"><Brand /><Link to="/">Back to home <ArrowUpRight size={14} /></Link></div><div className="auth-form-wrap">
        <div className="eyebrow"><span className="eyebrow-line" /> {mode === "login" ? "WELCOME BACK" : "YOUR NEXT CHAPTER"}</div>
        <h1>{mode === "login" ? <>Good to<br /><em>see you.</em></> : <>Let's make it<br /><em>unforgettable.</em></>}</h1>
        <p className="auth-subtitle">{mode === "login" ? "Your people and your plans are right where you left them." : "Create your account and start gathering your favourite people."}</p>
        <form className="form-stack" onSubmit={submit}>
          {mode === "signup" && <Field label="Your name" name="name" placeholder="e.g. Amara Okafor" required />}
          <Field label="Email address" name="email" placeholder="you@example.com" type="email" required />
          <div className="field"><div className="field-label-row"><label htmlFor="password">Password</label>{mode === "login" && <Link to="/forgot-password">Forgot password?</Link>}</div><div className="password-wrap"><input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="At least 8 characters" minLength={8} required /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
          {mode === "signup" && <Field label="Confirm password" name="confirmPassword" placeholder="Enter your password again" type="password" required />}
          {error && <div className="inline-error"><XCircle size={16} />{error}</div>}
          <button type="submit" className="button button-dark button-full button-large" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Just a moment…</> : <>{mode === "login" ? "Sign in" : "Create my account"} <ArrowRight size={16} /></>}</button>
        </form>
        <div className="auth-switch">{mode === "login" ? "New around here?" : "Already have an account?"} <Link to={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? "Create an account" : "Sign in"}</Link></div>
        <div className="demo-auth-note"><ShieldCheck size={15} /><span>Your account is securely verified by Gather before you continue.</span></div>
      </div><div className="auth-foot"><span>Thoughtfully made for your milestone.</span><span>© 2026 Gather</span></div></div>
      <aside className="auth-visual"><div className="auth-visual-top"><span>YOUR DAY, BEAUTIFULLY GATHERED</span><span>✳</span></div><div className="auth-visual-card"><div className="auth-visual-monogram">A</div><span className="preview-kicker">A NEW CHAPTER BEGINS</span><h2>This is what<br /><em>you worked for.</em></h2><div className="auth-visual-rule" /><p>Good people. A full heart.<br />A moment worth remembering.</p><span className="preview-kicker">NOVEMBER 14 · LAGOS</span></div><div className="auth-visual-bottom"><span>01 / 06</span><span>MADE FOR YOUR MOMENT</span></div></aside>
    </div>
  );
}

function Field({ label, name, placeholder, type = "text", required = false, defaultValue = "", minLength }: { label: string; name: string; placeholder?: string; type?: string; required?: boolean; defaultValue?: string; minLength?: number }) {
  return <div className="field"><label htmlFor={name}>{label}{required && <span className="required-star"> *</span>}</label><input id={name} name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} minLength={minLength} /></div>;
}

function readImagePreview(file: File, onProgress: (progress: number) => void = () => undefined) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 65));
    };
    reader.onerror = () => reject(reader.error || new Error("The image could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("This file could not be opened as an image."));
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser couldn't prepare this image."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        onProgress(100);
        resolve(canvas.toDataURL("image/jpeg", .82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  return <div className="simple-auth"><Brand /><div className="simple-auth-card"><div className="auth-icon"><Mail size={21} /></div><div className="eyebrow"><span className="eyebrow-line" /> ACCOUNT RECOVERY</div><h1>{sent ? "Email service needed." : "Forgot your password?"}</h1><p>{sent ? "Password reset email requires a connected email service." : "It happens. Share your email and we'll send you a link to reset it."}</p>{!sent && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); setSent(true); }}><Field label="Email address" name="email" type="email" placeholder="you@example.com" required /><button className="button button-dark button-full">Send reset link <ArrowRight size={16} /></button></form>}<Link className="back-link" to="/login"><ArrowLeft size={15} /> Back to sign in</Link><p className="demo-auth-note"><ShieldCheck size={15} /> Email delivery requires a connected email service.</p></div></div>;
}

function ResetPasswordPage() {
  const [error, setError] = useState("");
  return <div className="simple-auth"><Brand /><div className="simple-auth-card"><div className="auth-icon"><LockKeyhole size={21} /></div><div className="eyebrow"><span className="eyebrow-line" /> NEW PASSWORD</div><h1>Choose a new password.</h1><form className="form-stack" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (data.get("password") !== data.get("confirm")) { setError("Those passwords don't match yet."); return; } setError("Password updates require a connected account service."); }}><Field label="New password" name="password" type="password" required minLength={8} /><Field label="Confirm password" name="confirm" type="password" required minLength={8} />{error && <div className="inline-error"><XCircle size={16} />{error}</div>}<button className="button button-dark button-full">Save new password <ArrowRight size={16} /></button></form><Link className="back-link" to="/login"><ArrowLeft size={15} /> Back to sign in</Link></div></div>;
}

function DashboardLayout() {
  const { events, guests, signOut, user } = usePlatform();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const eventId = location.pathname.match(/\/events\/([^/]+)/)?.[1];
  const activeEvent = events.find((event) => event.id === eventId) || events[0];
  const base = activeEvent ? `/dashboard/events/${activeEvent.id}` : "/dashboard/events";
  const pendingCount = activeEvent ? guests.filter((guest) => guest.eventId === activeEvent.id && guest.status === "Pending").length : 0;
  const displayName = user ? `${user.firstName} ${user.lastName}` : "Gather";
  const initials = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "G";
  const mainItems = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/dashboard/events", label: "My events", icon: CalendarDays },
  ];
  const eventItems = activeEvent ? [
    { to: base, label: "Event overview", icon: Sparkles },
    { to: `${base}/guests`, label: "Guests", icon: Users, badge: pendingCount },
    { to: `${base}/tickets`, label: "Tickets", icon: Ticket },
    { to: `${base}/check-in`, label: "Check-in", icon: QrCode },
    { to: `${base}/gallery`, label: "Gallery", icon: ImagePlus },
  ] : [];
  const accountItems = [
    { to: "/dashboard/profile", label: "My profile", icon: UserRound },
    { to: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
  const currentLabel = [...mainItems, ...eventItems, ...accountItems].find((item) => location.pathname === item.to)?.label || (location.pathname.includes("/edit") ? "Edit event" : location.pathname.includes("/create") ? "Create event" : location.pathname.includes("/guests/") ? "Guest details" : "Workspace");
  return (
    <div className="dashboard-app">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><Brand /></div>
        <div className="workspace-switch"><span className="workspace-avatar">{initials[0]}</span><span><b>{displayName}'s workspace</b><small>Personal account</small></span><ChevronDown size={15} /></div>
        <nav className="side-nav" aria-label="Dashboard navigation">
          <span className="nav-section-label">WORKSPACE</span>
          {mainItems.map((item) => <SideLink key={item.to} {...item} active={location.pathname === item.to || (item.to === "/dashboard/events" && location.pathname === item.to)} />)}
          <div className="nav-divider" />
          <div className="event-nav-heading"><span className="nav-section-label">YOUR EVENT</span>{activeEvent && <span className="event-nav-name">{activeEvent.title}</span>}</div>
          {eventItems.map((item) => <SideLink key={item.to} {...item} active={location.pathname === item.to || (item.label === "Guests" && location.pathname.includes("/guests"))} />)}
          <div className="nav-divider" /><span className="nav-section-label">ACCOUNT</span>
          {accountItems.map((item) => <SideLink key={item.to} {...item} active={location.pathname === item.to} />)}
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><div className="help-card-icon"><CircleHelp size={17} /></div><b>Need a hand?</b><span>We're here to help you make it special.</span><a href="mailto:hello@gather.example">Get in touch <ArrowUpRight size={13} /></a></div><button className="side-link logout-link" onClick={() => { signOut(); navigate("/"); }}><LogOut size={17} /> <span>Sign out</span></button><div className="sidebar-profile"><span className="profile-avatar">{initials}</span><span><b>{displayName}</b><small>{user?.email}</small></span><MoreHorizontal size={18} /></div></div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="dashboard-main">
        <header className="dashboard-topbar"><button className="mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><b>{currentLabel}</b></div><div className="topbar-actions"><NotificationCenter /><button className="icon-button theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button><span className="topbar-avatar">{initials}</span></div></header>
        <div className="dashboard-content"><Outlet /></div>
      </div>
    </div>
  );
}

function SideLink({ to, label, icon: Icon, active, badge }: { to: string; label: string; icon: typeof LayoutDashboard; active: boolean; badge?: number }) {
  return <Link to={to} className={`side-link ${active ? "side-link-active" : ""}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{badge ? <span className="nav-count">{badge}</span> : null}</Link>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-title-row"><div>{eyebrow && <div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-title-action">{action}</div>}</div>;
}

function DashboardPage() {
  const { events, user, eventsLoading, eventsError, refreshEvents } = usePlatform();
  const navigate = useNavigate();
  const totalRSVP = events.reduce((sum, event) => sum + (event.registrationCount ?? 0), 0);
  const pending = events.reduce((sum, event) => sum + (event.pendingRegistrationCount ?? 0), 0);
  const approved = events.reduce((sum, event) => sum + (event.approvedAttendeeCount ?? 0), 0);
  const stats = [{ label: "Your events", value: String(events.length).padStart(2, "0"), change: "All in one place", icon: CalendarDays, tone: "sand" }, { label: "RSVPs received", value: String(totalRSVP).padStart(2, "0"), change: `${pending} waiting for you`, icon: Users, tone: "lilac" }, { label: "Guests approved", value: String(approved).padStart(2, "0"), change: "Across all your events", icon: CheckCircle2, tone: "mint" }, { label: "Checked in", value: "00", change: "Check-in is not connected yet", icon: QrCode, tone: "rose" }];
  const latest = [...events].sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 3);
  const upcoming = events[0];
  const daysUntilEvent = upcoming ? Math.max(0, Math.ceil((new Date(upcoming.startAt).getTime() - Date.now()) / 86_400_000)) : 0;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase();
  return <div className="page-stack">
    <div className="welcome-strip"><div><span className="welcome-overline">{todayLabel}</span><h1>{greeting}, {user?.firstName || "there"} <span>✳</span></h1><p>Your big day is coming together beautifully.</p></div><Link className="button button-dark" to="/dashboard/events/create"><Plus size={16} /> Create an event</Link></div>
    <div className="stats-grid">{stats.map(({ label, value, change, icon: Icon, tone }) => <article className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon size={18} /></div><span className="stat-label">{label}</span><div className="stat-bottom"><strong>{value}</strong><span>{change}</span></div></article>)}</div>
    {eventsError && <div className="inline-error" role="alert">{eventsError}<button className="subtle-link" onClick={() => void refreshEvents().catch(() => undefined)}>Try again</button></div>}
    {eventsLoading && !events.length && <div className="empty-state"><LoaderCircle className="spin" size={22} /> Loading your events…</div>}
    <div className="dashboard-columns"><section className="panel events-panel"><div className="panel-heading"><div><span className="panel-kicker">YOUR CELEBRATIONS</span><h2>Recent events</h2></div><Link className="subtle-link" to="/dashboard/events">See all <ArrowRight size={15} /></Link></div>{latest.length ? <div className="recent-event-list">{latest.map((event) => <EventRow key={event.id} event={event} onClick={() => navigate(`/dashboard/events/${event.id}`)} />)}</div> : !eventsLoading && <EmptyState icon={<CalendarDays size={23} />} title="Your first celebration is waiting." text="Create an event and make an invitation your guests will love." action={<Link className="button button-dark" to="/dashboard/events/create"><Plus size={15} /> Create an event</Link>} />}</section>
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">A LITTLE UPDATE</span><h2>Recent activity</h2></div></div><EmptyState icon={<Users size={22} />} title="Guest activity isn't connected yet." text="Your events and RSVP totals are loaded from Gather. Guest approvals and check-in need their API workflows." /></section></div>
    <section className="upcoming-banner"><div className="upcoming-text"><span className="panel-kicker">COMING UP NEXT</span><h2>{upcoming?.title || "Your next event"}</h2><p><CalendarDays size={15} /> {upcoming ? formatDate(upcoming.startAt) : "Add a date to your event"} <span className="bullet-separator">·</span> <MapPin size={15} /> {upcoming?.venue || "Add a venue"}</p>{upcoming && <Link className="text-link" to={`/dashboard/events/${upcoming.id}`}>Open event dashboard <ArrowRight size={15} /></Link>}</div><div className="upcoming-art"><span>✳</span><div className="upcoming-count"><b>{upcoming ? String(daysUntilEvent).padStart(2, "0") : "—"}</b><small>{upcoming ? daysUntilEvent === 0 ? "EVENT DAY" : "DAYS TO GO" : "ADD YOUR DATE"}</small></div></div></section>
  </div>;
}

function EventRow({ event, onClick }: { event: EventRecord; onClick: () => void }) {
  return <button className="recent-event-row" onClick={onClick}><div className={`event-thumb ${event.status === "Published" ? "thumb-published" : "thumb-draft"}`}><span>{event.graduateName?.slice(0, 1) || "G"}</span><i>✳</i></div><span className="event-row-main"><b>{event.title || "Untitled event"}</b><small>{formatDate(event.startAt, { day: "numeric", month: "short", year: "numeric" })}<span>·</span>{event.venue || "Venue to be confirmed"}</small></span><span className="event-row-count"><b>{event.registrationCount ?? 0}</b><small>RSVPs</small></span><StatusBadge status={event.status} /><ArrowRight size={16} className="row-arrow" /></button>;
}

function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  return <span className={`status-badge status-${lower.replaceAll(" ", "-")}`}><i />{status}</span>;
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function EventsPage() {
  const { events, publishEvent, unpublishEvent, removeEvent, notify, eventsLoading, eventsError, refreshEvents } = usePlatform();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All events");
  const navigate = useNavigate();
  const filtered = events.filter((event) => (filter === "All events" || event.status === filter) && `${event.title} ${event.category}`.toLowerCase().includes(query.toLowerCase()));
  const togglePublish = async (event: EventRecord) => {
    try {
      if (event.status === "Published") {
        await unpublishEvent(event.id);
        notify("Your invitation has been unpublished.");
      } else {
        await publishEvent(event.id);
        notify("Your invitation is live.");
      }
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "The event status could not be changed.", "error");
    }
  };
  const deleteEvent = async (event: EventRecord) => {
    if (window.confirm(`Remove “${event.title}” from your events? Its records will be preserved.`)) {
      try {
        await removeEvent(event.id);
        notify("Event removed from your active events.");
      } catch (reason) {
        notify(reason instanceof Error ? reason.message : "The event could not be removed.", "error");
      }
    }
  };
  return <div className="page-stack">
    <PageTitle eyebrow="A PLACE FOR EVERY MILESTONE" title="My events" description="Every celebration, all in one place." action={<Link className="button button-dark" to="/dashboard/events/create"><Plus size={16} /> Create event</Link>} />
    <div className="list-toolbar"><div className="search-field"><Search size={17} /><input placeholder="Search your events…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" /></div><div className="filter-wrap"><Filter size={15} /><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status"><option>All events</option><option>Published</option><option>Draft</option><option>Unpublished</option><option>Cancelled</option><option>Completed</option></select><ChevronDown size={14} /></div><span className="result-count">{filtered.length} {filtered.length === 1 ? "event" : "events"}</span></div>
    {eventsError && <div className="inline-error" role="alert">{eventsError}<button className="subtle-link" onClick={() => void refreshEvents().catch(() => undefined)}>Try again</button></div>}
    {eventsLoading && <div className="empty-state"><LoaderCircle className="spin" size={22} /> Loading your events…</div>}
    {!eventsLoading && (filtered.length ? <div className="events-grid">{filtered.map((event) => <article className="event-card" key={event.id}><button className={`event-card-cover ${event.status === "Published" ? "cover-olive" : "cover-rose"}`} style={event.coverImage ? { backgroundImage: `linear-gradient(rgba(40,43,37,.25),rgba(40,43,37,.25)),url(${event.coverImage})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined} onClick={() => navigate(`/dashboard/events/${event.id}`)} aria-label={`View ${event.title}`}><span className="cover-ornament">✳</span><span className="cover-title">{event.graduateName.split(" ").map((word) => word[0]).join("")}</span><span className="cover-date">{formatDate(event.startAt, { day: "numeric", month: "short" }).toUpperCase()}</span></button><div className="event-card-body"><div className="event-card-title"><div><span className="event-category">{event.category || "CELEBRATION"}</span><h3>{event.title || "Untitled event"}</h3></div><button className="icon-button" aria-label={`More actions for ${event.title}`} onClick={() => navigate(`/dashboard/events/${event.id}/edit`)}><MoreHorizontal size={18} /></button></div><div className="event-meta"><span><CalendarDays size={14} />{formatDate(event.startAt, { day: "numeric", month: "short", year: "numeric" })}</span><span><MapPin size={14} />{event.venue || "Venue to be confirmed"}</span></div><div className="event-card-stats"><span><b>{event.registrationCount ?? 0}</b> RSVPs</span><span><b>{event.approvedAttendeeCount ?? 0}</b> guests approved</span><StatusBadge status={event.status} /></div><div className="event-card-actions"><Link className="button button-outline button-sm" to={`/dashboard/events/${event.id}`}>Manage event</Link><button className="icon-button" title={event.status === "Published" ? "Unpublish" : "Publish"} aria-label={event.status === "Published" ? "Unpublish event" : "Publish event"} onClick={() => void togglePublish(event)} disabled={event.status === "Cancelled" || event.status === "Completed"}><Share2 size={16} /></button><button className="icon-button danger-icon" title="Delete event" aria-label={`Remove ${event.title}`} onClick={() => void deleteEvent(event)}><Trash2 size={16} /></button></div></div></article>)}</div> : <EmptyState icon={<CalendarDays size={24} />} title={query || filter !== "All events" ? "Nothing here just yet." : "Your first celebration is waiting."} text={query || filter !== "All events" ? "Try changing the search or status filter." : "Create an event and bring your favourite people together."} action={!events.length ? <Link className="button button-dark" to="/dashboard/events/create"><Plus size={15} /> Create your first event</Link> : undefined} />)}
  </div>;
}

const categories = ["Graduation Ceremony", "Graduation Party", "Thanksgiving", "Graduation Dinner", "Other"];
const wizardLabels = ["The basics", "Your story", "When & where", "Guest list", "Make it yours", "Preview"];

function EventWizard() {
  const { eventId } = useParams();
  const { getEvent, saveEvent, publishEvent, refreshEvent, notify } = usePlatform();
  const existing = eventId ? getEvent(eventId) : undefined;
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [stepDirection, setStepDirection] = useState<"forward" | "backward">("forward");
  const [error, setError] = useState("");
  const [imageProgress, setImageProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingEvent, setLoadingEvent] = useState(Boolean(eventId));
  const [form, setForm] = useState<EventRecord>(() => existing || ({
    id: `event-${crypto.randomUUID()}`, slug: "", title: "", category: "", description: "",
    graduateName: "Amara Okafor", institution: "", faculty: "", department: "", qualification: "",
    startAt: "", endAt: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos",
    venue: "", address: "", instructions: "", rsvpDeadline: "", additionalLimit: 1,
    personalMessage: "", status: "Draft", accent: "#b18a55",
  }));
  useEffect(() => {
    if (!eventId) {
      setLoadingEvent(false);
      return;
    }
    let active = true;
    setLoadingEvent(true);
    void refreshEvent(eventId).then((loadedEvent) => {
      if (active) setForm(loadedEvent);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "The event could not be loaded.");
    }).finally(() => {
      if (active) setLoadingEvent(false);
    });
    return () => { active = false; };
  }, [eventId]);
  const set = (key: keyof EventRecord, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const changeStep = (nextStep: number) => {
    if (nextStep === step) return;
    setStepDirection(nextStep > step ? "forward" : "backward");
    setStep(nextStep);
  };
  const validateStep = () => {
    if (step === 0 && (!form.title.trim() || !form.category)) return "Add an event title and choose a celebration type to continue.";
    if (step === 1 && (!form.graduateName.trim() || !form.institution.trim())) return "Add your name and institution to continue.";
    if (step === 2 && (!form.startAt || !form.venue.trim() || !form.address.trim())) return "Add the date, venue and address to continue.";
    if (step === 2 && form.endAt && new Date(form.endAt) < new Date(form.startAt)) return "The end time should be after the start time.";
    if (step === 3 && !form.rsvpDeadline) return "Choose an RSVP deadline to continue.";
    if (step === 3 && form.startAt && new Date(`${form.rsvpDeadline}T23:59:59`) > new Date(form.startAt)) return "Your RSVP deadline should be before the event starts.";
    return "";
  };
  const goNext = () => {
    const problem = validateStep();
    if (problem) { setError(problem); return; }
    setError("");
    changeStep(Math.min(step + 1, wizardLabels.length - 1));
  };
  const persist = async (publish: boolean) => {
    setSaving(true);
    setError("");
    try {
      const saved = await saveEvent({ ...form, slug: form.slug || slugify(form.title) });
      if (publish && saved.status !== "Published") {
        await publishEvent(saved.id);
      }
      const coverNotice = form.coverImage?.startsWith("data:image/")
        ? " The cover image is saved in this browser; shared image uploads aren't connected yet."
        : "";
      notify(`${publish
        ? "Your invitation is live. Share it with your people."
        : saved.status === "Published" ? "Your event updates have been saved." : "Your event has been saved as a draft."}${coverNotice}`);
      navigate(`/dashboard/events/${saved.id}`, { state: publish ? { justPublished: true } : null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };
  const handleImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1_500_000) {
      setError("Choose an image under 1.5 MB for this local preview.");
      return;
    }
    setError("");
    setImageProgress(0);
    try {
      const preview = await readImagePreview(file, setImageProgress);
      set("coverImage", preview);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setImageProgress(null);
    }
  };
  if (loadingEvent) return <div className="empty-state"><LoaderCircle className="spin" size={22} /> Loading event details…</div>;
  return <div className="page-stack wizard-page">
    <div className="wizard-topline"><Link to="/dashboard/events" className="back-link"><ArrowLeft size={15} /> All events</Link><span className="draft-save-indicator"><i /> Changes save to Gather</span></div>
    <div className="wizard-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {existing ? "MAKE A FEW CHANGES" : "A NEW CELEBRATION"}</div><h1>{existing ? "Edit your event" : "Let's make it yours."}</h1><p>Thoughtful details make the best invitations. You can always come back to these.</p></div><span className="step-counter">0{step + 1} <i>/</i> 06</span></div>
    <div className="wizard-progress" role="group" aria-label={`Step ${step + 1} of ${wizardLabels.length}`}><span className="wizard-progress-track" aria-hidden="true"><span style={{ width: `${step / (wizardLabels.length - 1) * 100}%` }} /></span>{wizardLabels.map((label, index) => <button type="button" className={`wizard-step ${index === step ? "current" : ""} ${index < step ? "complete" : ""}`} key={label} onClick={() => index < step && changeStep(index)} disabled={index > step} aria-current={index === step ? "step" : undefined}><span className="wizard-step-dot">{index < step ? <Check size={13} /> : `0${index + 1}`}</span><span>{label}</span></button>)}</div>
    <div className="wizard-layout"><div className="wizard-form panel">
      <div className="wizard-panel-heading"><span className="panel-kicker">STEP 0{step + 1} OF 06</span><h2>{["Start with the basics", "Tell us about you", "Set the scene", "Make room for your people", "A few personal touches", "Take a look"][step]}</h2><p>{["A name and a few words to set the tone.", "A little context makes your invitation feel like you.", "Give your guests everything they need to be there.", "You decide how many extra seats each guest can bring.", "Make the invitation feel like your kind of celebration.", "Everything together, just as your guests will see it."][step]}</p></div>
      <div key={step} className={`wizard-step-content wizard-step-${stepDirection}`}>
      {step === 0 && <div className="form-grid"><div className="field field-span"><label htmlFor="title">Event title <span className="required-star">*</span></label><input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. The Next Chapter" maxLength={70} /></div><div className="field"><label htmlFor="category">What are you celebrating? <span className="required-star">*</span></label><select id="category" value={form.category} onChange={(e) => set("category", e.target.value)}><option value="">Choose a celebration</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></div><div className="field field-span"><label htmlFor="description">A little about the day</label><textarea id="description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Tell your guests what this day means to you…" maxLength={300} /><span className="field-foot">{form.description.length}/300</span></div></div>}
      {step === 1 && <div className="form-grid"><div className="field field-span"><label htmlFor="graduateName">Your name <span className="required-star">*</span></label><input id="graduateName" value={form.graduateName} onChange={(e) => set("graduateName", e.target.value)} /></div><div className="field field-span"><label htmlFor="institution">Institution <span className="required-star">*</span></label><input id="institution" value={form.institution} onChange={(e) => set("institution", e.target.value)} placeholder="University or college" /></div><div className="field"><label htmlFor="faculty">Faculty</label><input id="faculty" value={form.faculty} onChange={(e) => set("faculty", e.target.value)} placeholder="Faculty of…" /></div><div className="field"><label htmlFor="department">Department</label><input id="department" value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="Your department" /></div><div className="field field-span"><label htmlFor="qualification">Qualification <span className="optional-label">OPTIONAL</span></label><input id="qualification" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} placeholder="e.g. B.A. English" /></div></div>}
      {step === 2 && <div className="form-grid"><div className="field"><label htmlFor="startAt">Date & start time <span className="required-star">*</span></label><input id="startAt" type="datetime-local" value={form.startAt} onChange={(e) => set("startAt", e.target.value)} /></div><div className="field"><label htmlFor="endAt">End time <span className="optional-label">OPTIONAL</span></label><input id="endAt" type="datetime-local" value={form.endAt} onChange={(e) => set("endAt", e.target.value)} /></div><div className="field field-span"><label htmlFor="timezone">Time zone <span className="required-star">*</span></label><select id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>{Array.from(new Set([form.timezone, "Africa/Lagos", "UTC", "Europe/London", "America/New_York"])).map((zone) => <option key={zone}>{zone}</option>)}</select><span className="field-foot">Times on your invitation use this time zone.</span></div><div className="field field-span"><label htmlFor="venue">Venue name <span className="required-star">*</span></label><input id="venue" value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Where the magic happens" /></div><div className="field field-span"><label htmlFor="address">Full address <span className="required-star">*</span></label><input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, area, city" /></div><div className="field field-span"><label htmlFor="instructions">A note for getting there <span className="optional-label">OPTIONAL</span></label><textarea id="instructions" rows={2} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Parking, entrance, what to look for…" /></div></div>}
      {step === 3 && <div className="form-grid"><div className="field field-span"><label htmlFor="rsvpDeadline">Please reply by <span className="required-star">*</span></label><input id="rsvpDeadline" type="date" value={form.rsvpDeadline} onChange={(e) => set("rsvpDeadline", e.target.value)} /></div><div className="field field-span"><label htmlFor="additionalLimit">Additional guests per invitation</label><div className="limit-select"><button type="button" onClick={() => set("additionalLimit", Math.max(0, form.additionalLimit - 1))} aria-label="Remove one additional guest">−</button><span><b>{form.additionalLimit}</b><small>extra {form.additionalLimit === 1 ? "guest" : "guests"} allowed</small></span><button type="button" onClick={() => set("additionalLimit", Math.min(3, form.additionalLimit + 1))} aria-label="Add one additional guest">+</button></div><span className="field-foot">Your guests can bring themselves plus up to {form.additionalLimit} additional people.</span></div><div className="approval-note"><ShieldCheck size={17} /><span><b>You'll review every RSVP.</b><small>Guests get their tickets after you approve their group.</small></span></div></div>}
      {step === 4 && <div className="form-grid"><div className="field field-span"><label htmlFor="personalMessage">A personal note for your guests</label><textarea id="personalMessage" rows={4} value={form.personalMessage} onChange={(e) => set("personalMessage", e.target.value)} placeholder="I couldn't have made it here without the people I love…" /><span className="field-foot">A few words from you make it feel extra special.</span></div><div className="field field-span"><label>Cover image <span className="optional-label">OPTIONAL</span></label>{form.coverImage ? <div className="upload-preview" style={{ backgroundImage: `url(${form.coverImage})` }}><button type="button" onClick={() => setForm((current) => ({ ...current, coverImage: "" }))} aria-label="Remove cover image"><X size={15} /></button></div> : <label className="upload-zone"><ImagePlus size={22} /><b>{imageProgress === null ? "Choose a cover image" : "Preparing your image…"}</b><span>{imageProgress === null ? "JPG or PNG · up to 1.5 MB" : `${imageProgress}% ready`}</span><input type="file" accept="image/*" disabled={imageProgress !== null} onChange={(e) => handleImage(e.target.files?.[0])} /></label>}<span className="field-foot cover-storage-note">Your uploaded cover appears behind the invitation text. Cover images are saved in this browser until server image uploads are connected.</span></div><div className="field field-span"><PhotoGalleryEditor photos={form.galleryImages || []} onChange={(galleryImages) => setForm((current) => ({ ...current, galleryImages }))} /><span className="field-foot">Only photos you mark as published appear on your public invitation.</span></div><div className="field field-span"><label>Invitation accent</label><div className="accent-picker">{["#b18a55", "#71826b", "#9d7580", "#64748b", "#292d28"].map((color) => <button type="button" key={color} style={{ background: color }} className={form.accent === color ? "accent-selected" : ""} onClick={() => set("accent", color)} aria-label={`Choose accent ${color}`} />)}<span>Keep it warm, or choose a shade that feels like you.</span></div></div></div>}
      {step === 5 && <InvitationMiniPreview event={form} />}
      </div>
      {error && <div className="inline-error wizard-error" role="alert"><XCircle size={16} />{error}</div>}
      <div className="wizard-footer"><button className="button button-outline" disabled={saving} onClick={() => step === 0 ? navigate("/dashboard/events") : changeStep(step - 1)}>{step === 0 ? <ArrowLeft size={15} /> : <ChevronLeft size={16} />}{step === 0 ? "Cancel" : "Back"}</button><div><button className="button button-quiet" disabled={saving} onClick={() => void persist(false)}>{saving ? "Saving…" : "Save as draft"}</button>{step < wizardLabels.length - 1 ? <button className="button button-dark" disabled={saving} onClick={goNext}>Continue <ArrowRight size={15} /></button> : <button className="button button-dark" disabled={saving} onClick={() => void persist(true)}>{saving ? <><LoaderCircle className="spin" size={15} /> Saving…</> : <><Sparkles size={15} /> Publish event</>}</button>}</div></div>
    </div><aside className="wizard-aside"><div className="wizard-aside-art"><span>✳</span><div className="aside-mini-card"><small>YOU'RE INVITED</small><b>{form.title || "Your celebration"}</b><i>{form.graduateName}</i><span className="aside-mini-line" /><small>{form.startAt ? formatDate(form.startAt, { day: "numeric", month: "long", year: "numeric" }).toUpperCase() : "YOUR SPECIAL DAY"} · LAGOS</small></div></div><div className="wizard-tip"><Sparkles size={16} /><span><b>A little note</b><small>You can edit everything later. Your invitation isn't shared until you publish it.</small></span></div><div className="wizard-help"><CircleHelp size={16} /><span>Need inspiration?</span><a href="#preview" onClick={(event) => { event.preventDefault(); changeStep(5); }}>See your invitation preview</a></div></aside></div>
  </div>;
}

function InvitationMiniPreview({ event }: { event: EventRecord }) {
  return <div className="mini-invitation" style={{ borderColor: `${event.accent}55` }}><div className={`mini-invitation-art${event.coverImage ? " has-cover" : ""}`} style={{ backgroundColor: event.accent, ...(event.coverImage ? { backgroundImage: `linear-gradient(rgba(28, 30, 26, .5), rgba(28, 30, 26, .62)), url(${event.coverImage})` } : {}) }}><span>✳</span><div className="mini-monogram">{event.graduateName?.charAt(0) || "G"}</div><small>WITH JOY IN OUR HEARTS</small></div><div className="mini-invitation-copy"><span className="event-category">{event.category || "A CELEBRATION"}</span><h2 key={event.title}>{event.title || "Your celebration"}</h2><p key={`${event.graduateName}:${event.title}`}>Join {event.graduateName || "your graduate"} as they celebrate their next chapter.</p><span key={event.startAt}><CalendarDays size={14} /> {formatDate(event.startAt)}</span><span key={event.venue}><MapPin size={14} /> {event.venue || "Venue to be confirmed"}</span><button className="button button-dark button-sm">RSVP now</button></div></div>;
}

function PublicEventPage() {
  const { slug = "" } = useParams();
  const { getPublishedGallery } = usePlatform();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotFound(false);
    void api.publicEvent(slug).then(({ event: publicEvent }) => {
      if (active) setEvent(publicEventFromApi(publicEvent));
    }).catch((reason) => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status === 404) {
        setNotFound(true);
      } else {
        setError(reason instanceof Error ? reason.message : "The invitation could not be loaded.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [slug]);
  if (loading) return <div className="simple-auth"><div className="auth-form-wrap"><LoaderCircle className="spin" size={24} /><p>Opening your invitation…</p></div></div>;
  if (notFound) return <UnavailablePage />;
  if (error || !event) return <div className="simple-error"><Brand /><div className="error-card"><span className="error-ornament">✳</span><div className="eyebrow"><span className="eyebrow-line" /> A LITTLE DETOUR</div><h1>This invitation<br /><em>couldn't load.</em></h1><p>{error || "Please check your connection and try again."}</p><button className="button button-dark" onClick={() => window.location.reload()}>Try again <ArrowRight size={16} /></button></div></div>;
  const gallery = getPublishedGallery(event.id);
  return <div className="invitation-page" id="top"><header className="invitation-nav"><Brand /><span>AN INVITATION TO CELEBRATE</span><Link to="/" className="invitation-nav-link">Made with <Heart size={13} /> Gather</Link></header><main><section className="invitation-hero" style={{ borderColor: `${event.accent}55`, backgroundImage: event.coverImage ? `linear-gradient(rgba(247,246,242,.5), rgba(247,246,242,.5)), url(${event.coverImage})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}><div className="invitation-hero-texture" style={{ backgroundColor: `${event.accent}18` }} /><div className="invitation-hero-content"><span className="invitation-kicker">WITH JOY IN OUR HEARTS</span><span className="invitation-monogram" style={{ color: event.accent }}>{event.graduateName.charAt(0)}</span><span className="invitation-kicker">{event.institution || "A NEW CHAPTER"}</span><h1>{event.title.split(" ").slice(0, -1).join(" ")}<br /><em>{event.title.split(" ").slice(-1)}</em></h1><p className="invitation-byline">A celebration for <b>{event.graduateName}</b></p><div className="invitation-date-line"><span>{formatDate(event.startAt, { day: "numeric", month: "long", year: "numeric" }, event.timezone)}</span><i /> <span>{formatTime(event.startAt, event.timezone)}</span></div><span className="invitation-venue-line"><MapPin size={14} />{event.venue} · {event.address}</span></div><span className="invitation-star star-a">✳</span><span className="invitation-star star-b">✴</span><span className="invitation-side-stamp">A DAY TO REMEMBER · LAGOS</span></section>
      <section className="invitation-details"><div className="invitation-details-copy"><div className="eyebrow"><span className="eyebrow-line" /> A NOTE FROM {event.graduateName.split(" ")[0].toUpperCase()}</div><h2>All the people<br />I love, in <em>one place.</em></h2><p>{event.personalMessage || event.description || "I would love for you to join me as I celebrate this special milestone."}</p><div className="invitation-academic">{[event.faculty, event.department, event.qualification].filter(Boolean).map((text) => <span key={text}>{text}</span>)}</div></div><div className="invitation-date-card"><span className="panel-kicker">SAVE THE DATE</span><b className="date-card-day">{new Date(event.startAt).getDate()}</b><span className="date-card-month">{new Date(event.startAt).toLocaleString("en", { month: "long", year: "numeric" })}</span><span className="date-card-divider" /><div className="date-card-info"><Clock3 size={15} /><span>{formatTime(event.startAt)}{event.endAt ? ` – ${formatTime(event.endAt)}` : ""}</span></div><div className="date-card-info"><MapPin size={15} /><span>{event.venue}<small>{event.address}</small></span></div>{event.instructions && <div className="date-card-instructions">{event.instructions}</div>}</div></section>
      <Countdown startAt={event.startAt} />
      {!!gallery.length && <PublicGallery images={gallery} />}
      <section className="invitation-rsvp"><div><span className="panel-kicker">IT WOULDN'T BE THE SAME WITHOUT YOU</span><h2>Will you <em>be there?</em></h2><p>Let me know by {formatDate(event.rsvpDeadline, { day: "numeric", month: "long" })}. {event.additionalLimit ? `You're welcome to bring up to ${event.additionalLimit} additional ${event.additionalLimit === 1 ? "guest" : "guests"}.` : ""}</p></div>{event.rsvpDeadline && new Date(`${event.rsvpDeadline}T23:59:59`) < new Date() ? <span className="rsvp-closed">RSVPs are now closed. We hope to see you next time.</span> : <Link className="button button-dark button-large" to={`/event/${event.slug}/rsvp`}>Save me a seat <ArrowRight size={16} /></Link>}</section></main><footer className="invitation-footer"><Brand /><span>Made with love, for the moments that matter.</span><a href="#top">Back to top ↑</a></footer></div>;
}

function UnavailablePage() {
  return <div className="simple-error"><Brand /><div className="error-card"><span className="error-ornament">✳</span><div className="eyebrow"><span className="eyebrow-line" /> A LITTLE DETOUR</div><h1>This invitation<br /><em>isn't available.</em></h1><p>It may have been unpublished or the link may have changed. Check with the graduate for the latest details.</p><Link to="/" className="button button-dark">Back to Gather <ArrowRight size={16} /></Link></div></div>;
}

function Countdown({ startAt }: { startAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const secondsLeft = Math.max(0, Math.floor((new Date(startAt).getTime() - now) / 1000));
  const days = Math.floor(secondsLeft / 86_400);
  const hours = Math.floor(secondsLeft / 3_600) % 24;
  const minutes = Math.floor(secondsLeft / 60) % 60;
  const seconds = secondsLeft % 60;
  const upcoming = secondsLeft > 0;
  return <section className="countdown-wrap"><div><span className="panel-kicker">{upcoming ? "THE COUNTDOWN IS ON" : "THE DAY HAS ARRIVED"}</span><h2>{upcoming ? "Until we celebrate together…" : "What a day to remember."}</h2></div>{upcoming ? <div className="countdown">{[[days, "DAYS"], [hours, "HOURS"], [minutes, "MINUTES"], [seconds, "SECONDS"]].map(([value, label]) => { const formatted = String(value).padStart(2, "0"); return <div key={String(label)}><b key={formatted} className="countdown-digit">{formatted}</b><small>{label}</small></div>; })}</div> : <span className="completed-pill"><CheckCircle2 size={16} /> Celebration day</span>}</section>;
}

async function downloadGalleryZip(images: GalleryImage[], onProgress: (progress: number) => void) {
  const zip = new JSZip();
  for (const [index, image] of images.entries()) {
    const response = await fetch(image.src);
    if (!response.ok) throw new Error(`Photo ${index + 1} could not be downloaded.`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error(`Photo ${index + 1} is not a valid image.`);
    zip.file(`graduation-memory-${String(index + 1).padStart(2, "0")}.jpg`, blob);
    onProgress(Math.round((index + 1) / images.length * 80));
  }
  const archive = await zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "STORE" }, (metadata) => {
    onProgress(80 + Math.round(metadata.percent * .2));
  });
  const url = URL.createObjectURL(archive);
  const link = document.createElement("a");
  link.href = url;
  link.download = "graduation-memories.zip";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function PublicGallery({ images }: { images: GalleryImage[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const { notify } = usePlatform();
  const downloadAll = async () => {
    if (!images.length || downloading) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      await downloadGalleryZip(images, setDownloadProgress);
      notify("Your graduation memories ZIP is ready.");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : String(reason), "error");
    } finally {
      setDownloading(false);
    }
  };
  return <>
    <section className="public-gallery-section">
      <div className="public-gallery-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> A FEW FAVOURITE MOMENTS</span><h2>Graduation <em>Memories</em></h2><p>A little collection of moments worth remembering.</p></div><button className="button button-outline download-all-button" type="button" onClick={() => void downloadAll()} disabled={downloading} aria-busy={downloading}><Download size={15} />{downloading ? `Preparing ZIP · ${downloadProgress}%` : "Download All Photos"}</button></div>
      <div className="public-gallery-grid">{images.map((image, index) => <figure className={`public-gallery-card ${images.length > 2 && index === 0 ? "public-gallery-card-featured" : ""}`} key={image.id}><button className="public-gallery-image" onClick={() => setActive(index)} aria-label={`View graduation memory ${index + 1} in lightbox`}><img src={image.src} alt={`Graduation memory ${index + 1}`} /><span><Eye size={14} /> View memory</span></button><a href={image.src} download={`graduation-memory-${String(index + 1).padStart(2, "0")}.jpg`} className="public-gallery-download"><Download size={14} /><span>Download photo</span></a><span className="public-gallery-index">{String(index + 1).padStart(2, "0")}</span></figure>)}</div>
    </section>
    {active !== null && <ImageLightbox images={images.map((image) => image.src)} active={active} onSelect={setActive} onClose={() => setActive(null)} />}
  </>;
}

function ImageLightbox({ images, active, onSelect, onClose }: { images: string[]; active: number; onSelect: (index: number) => void; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const previous = () => onSelect((active - 1 + images.length) % images.length);
  const next = () => onSelect((active + 1) % images.length);
  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };
  return <div className={`gallery-lightbox${closing ? " lightbox-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={close}><button className="lightbox-close" onClick={close} aria-label="Close photo viewer"><X size={20} /></button><button className="lightbox-nav lightbox-prev" onClick={(event) => { event.stopPropagation(); previous(); }} aria-label="Previous photo"><ChevronLeft size={22} /></button><img src={images[active]} alt={`Photo ${active + 1} of ${images.length}`} onClick={(event) => event.stopPropagation()} /><div className="lightbox-controls" onClick={(event) => event.stopPropagation()}><span>{String(active + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span><a href={images[active]} download={`gather-memory-${active + 1}.jpg`} className="button button-light button-sm"><Download size={14} /> Download photo</a></div><button className="lightbox-nav lightbox-next" onClick={(event) => { event.stopPropagation(); next(); }} aria-label="Next photo"><ChevronRight size={22} /></button></div>;
}

function RsvpPage() {
  const { slug = "" } = useParams();
  const { notify } = usePlatform();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [attending, setAttending] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setNotFound(false);
    api.publicEvent(slug).then(({ event: publicEvent }) => {
      if (active) setEvent(publicEventFromApi(publicEvent));
    }).catch((reason) => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status === 404) {
        setNotFound(true);
      } else {
        setLoadError(reason instanceof Error ? reason.message : "The invitation could not be loaded.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [slug]);

  if (loading) return <div className="simple-auth"><div className="auth-form-wrap"><LoaderCircle className="spin" size={24} /><p>Opening your RSVP…</p></div></div>;
  if (notFound) return <UnavailablePage />;
  if (loadError || !event) return <div className="simple-error"><Brand /><div className="error-card"><span className="error-ornament">✳</span><div className="eyebrow"><span className="eyebrow-line" /> A LITTLE DETOUR</div><h1>This invitation<br /><em>couldn't load.</em></h1><p>{loadError || "Please check your connection and try again."}</p><button className="button button-dark" onClick={() => window.location.reload()}>Try again <ArrowRight size={16} /></button></div></div>;

  const closed = event.rsvpDeadline && new Date(`${event.rsvpDeadline}T23:59:59`) < new Date();
  if (closed) return <div className="rsvp-closed-page"><Brand /><div className="simple-auth-card"><div className="auth-icon"><Clock3 size={20} /></div><span className="eyebrow"><span className="eyebrow-line" /> RSVP WINDOW CLOSED</span><h1>We wish you<br /><em>could join us.</em></h1><p>RSVPs for {event.title} closed on {formatDate(event.rsvpDeadline)}. Please reach out to {event.graduateName} if you have any questions.</p><Link className="back-link" to={`/event/${slug}`}><ArrowLeft size={15} /> Back to invitation</Link></div></div>;

  const handleCount = (value: number) => {
    const safe = Math.min(event.additionalLimit, Math.max(0, value));
    setCount(safe);
    setNames((current) => Array.from({ length: safe }, (_, index) => current[index] || ""));
  };

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (attending === null) { setError("Let us know if you'll be there."); return; }
    const data = new FormData(formEvent.currentTarget);
    const rawPrimaryName = String(data.get("name") ?? "").trim();
    const primaryParts = rawPrimaryName.split(/\s+/).filter(Boolean);
    if (primaryParts.length < 2 || rawPrimaryName.length < 2) {
      setError("Please enter your first and last name.");
      return;
    }
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const phone = String(data.get("phone") ?? "").trim();
    const phoneDigits = phone.replace(/\D/g, "");
    if (!/^[+()\d.\-\s]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      setError("Please enter a valid phone number with 7 to 15 digits.");
      return;
    }
    const relationship = String(data.get("relationship") ?? "").trim();

    let additionalGuestNames: string[] = [];
    if (attending && count > 0) {
      const extras = names.slice(0, count).map((n) => n.trim());
      if (extras.some((n) => !n)) {
        setError("Add a name for each of your guests.");
        return;
      }
      for (let i = 0; i < extras.length; i++) {
        const parts = extras[i].split(/\s+/).filter(Boolean);
        if (parts.length < 2 || extras[i].length < 2) {
          setError(`Please enter both a first and last name for guest ${i + 1}.`);
          return;
        }
      }
      additionalGuestNames = extras;
    }

    setError("");
    setBusy(true);

    try {
      const result = await api.submitRsvp(slug, {
        primaryGuestName: rawPrimaryName,
        primaryGuestEmail: email,
        primaryGuestPhone: phone,
        relationshipToGraduate: relationship || undefined,
        attendanceIntent: attending ? "ATTENDING" : "NOT_ATTENDING",
        additionalGuestNames: attending ? additionalGuestNames : [],
      });
      try {
        sessionStorage.setItem(`gather.rsvp.${slug}.token`, result.confirmationToken);
      } catch {
        // sessionStorage might be restricted
      }
      notify("Your RSVP has been received.");
      navigate(`/event/${slug}/confirmation`, {
        state: { token: result.confirmationToken },
      });
    } catch (reason) {
      if (reason instanceof ApiError) {
        if (reason.status === 409) {
          setError(reason.message || "This RSVP conflicts with a recent submission. Please try again.");
        } else if (reason.status === 410) {
          setError("The RSVP deadline has passed and submissions are now closed.");
        } else if (reason.status === 429) {
          setError(reason.message || "Too many requests. Please wait a moment before trying again.");
        } else if (reason.status === 400 && reason.details?.length) {
          setError(reason.details.map((d) => d.message).join(" "));
        } else {
          setError(reason.message || "We couldn't submit your RSVP. Please try again.");
        }
      } else {
        setError(reason instanceof Error ? reason.message : "We couldn't submit your RSVP. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return <div className="rsvp-page"><header className="rsvp-header"><Brand /><Link className="back-link" to={`/event/${slug}`}><ArrowLeft size={15} /> Back to invitation</Link></header><main className="rsvp-layout"><aside className="rsvp-aside"><span className="eyebrow"><span className="eyebrow-line" /> YOU'RE INVITED</span><h1>{event.title}<br /><em>with {event.graduateName.split(" ")[0]}.</em></h1><div className="rsvp-aside-meta"><span><CalendarDays size={15} />{formatDate(event.startAt, { day: "numeric", month: "long" })}</span><span><MapPin size={15} />{event.venue}</span></div><div className="rsvp-quote">“{event.personalMessage || "It wouldn't be the same without you."}”<small>— {event.graduateName}</small></div><div className="rsvp-extra-note"><Users size={16} />{event.additionalLimit ? `You can bring up to ${event.additionalLimit} additional ${event.additionalLimit === 1 ? "guest" : "guests"}.` : "This invitation is just for you."}</div></aside><section className="rsvp-form-card"><div className="rsvp-form-top"><span className="panel-kicker">A QUICK NOTE BACK</span><span>01 <i>/</i> 01</span></div><h2>Can you <em>make it?</em></h2><p className="rsvp-form-intro">Tell us a little about yourself so {event.graduateName.split(" ")[0]} knows who's coming.</p><form onSubmit={submit} className="form-stack">
      <div className="field"><label htmlFor="rsvp-name">Your full name <span className="required-star">*</span></label><input id="rsvp-name" name="name" placeholder="As it appears on your ticket" required /></div>
      <div className="form-grid"><div className="field"><label htmlFor="rsvp-email">Email address <span className="required-star">*</span></label><input id="rsvp-email" name="email" type="email" placeholder="you@example.com" required /></div><div className="field"><label htmlFor="rsvp-phone">Phone number <span className="required-star">*</span></label><input id="rsvp-phone" name="phone" type="tel" placeholder="+234 800 000 0000" required /></div></div>
      <div className="field"><label htmlFor="rsvp-relation">How do you know {event.graduateName.split(" ")[0]}? <span className="required-star">*</span></label><select id="rsvp-relation" name="relationship" defaultValue="" required><option value="" disabled>Choose one</option><option>Family</option><option>Friend</option><option>Course mate</option><option>Colleague</option><option>Other</option></select></div>
      <div className="field"><span className="field-label">Will you be there? <span className="required-star">*</span></span><div className="attendance-options"><button type="button" className={`attendance-option ${attending === true ? "selected" : ""}`} onClick={() => { setAttending(true); setError(""); }}><span className="choice-dot">{attending === true && <i />}</span><span><b>I'd love to</b><small>Count me in</small></span><CheckCircle2 size={18} /></button><button type="button" className={`attendance-option ${attending === false ? "selected" : ""}`} onClick={() => { setAttending(false); setCount(0); setNames([]); setError(""); }}><span className="choice-dot">{attending === false && <i />}</span><span><b>Can't make it</b><small>I'll be there in spirit</small></span><Heart size={17} /></button></div></div>
      {attending && event.additionalLimit > 0 && <div className="additional-guests"><div className="additional-heading"><span><Users size={16} /><b>Bringing someone along?</b></span><span>UP TO {event.additionalLimit}</span></div><label className="field-label" htmlFor="extra-count">Additional guests</label><div className="guest-count-control"><button type="button" onClick={() => handleCount(count - 1)} aria-label="Remove guest">−</button><b>{count}</b><button type="button" onClick={() => handleCount(count + 1)} disabled={count >= event.additionalLimit} aria-label="Add guest">+</button></div>{names.map((name, index) => <div className="field" key={index}><label htmlFor={`extra-${index}`}>Guest {index + 1} full name <span className="required-star">*</span></label><input id={`extra-${index}`} value={name} onChange={(e) => setNames((current) => current.map((item, i) => i === index ? e.target.value : item))} placeholder="Their full name" required /></div>)}</div>}
      {error && <div className="inline-error"><XCircle size={16} />{error}</div>}
      <div className="rsvp-security-note"><LockKeyhole size={14} /><span>Your details are only shared with {event.graduateName.split(" ")[0]}.</span></div>
      <button className="button button-dark button-full button-large" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Sending your RSVP…</> : <>Send my RSVP <ArrowRight size={16} /></>}</button>
    </form><p className="approval-note-inline"><ShieldCheck size={14} /> Your place is confirmed after {event.graduateName.split(" ")[0]} approves your RSVP.</p></section></main></div>;
}

function RsvpConfirmation() {
  const { slug = "" } = useParams();
  const location = useLocation();
  // const [searchParams] = useSearchParams();
  const stateToken = (location.state as { token?: string } | null)?.token;
  // const queryToken = searchParams.get("token") || undefined;
  const storedToken = (() => {
    try {
      return sessionStorage.getItem(`gather.rsvp.${slug}.token`) || undefined;
    } catch {
      return undefined;
    }
  })();
  const token = stateToken || storedToken || "";

  const [confirmation, setConfirmation] = useState<ApiRsvpConfirmationResponse["confirmation"] | null>(null);
  const [graduateName, setGraduateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("No RSVP confirmation token was found. If you recently submitted your RSVP, please check your email or contact the host.");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.getRsvpConfirmation(slug, token),
      api.publicEvent(slug).catch(() => null),
    ]).then(([confResult, publicResult]) => {
      if (!active) return;
      setConfirmation(confResult.confirmation);
      try {
        sessionStorage.setItem(`gather.rsvp.${slug}.token`, token);
      } catch {
        // ignore
      }
      if (publicResult?.event?.graduateName) {
        setGraduateName(publicResult.event.graduateName);
      }
    }).catch((reason) => {
      if (!active) return;
      if (reason instanceof ApiError && reason.status === 404) {
        setError("This RSVP confirmation could not be found. It may be invalid or expired.");
      } else if (reason instanceof ApiError && reason.status === 429) {
        setError("Too many requests. Please wait a moment and try again.");
      } else {
        setError(reason instanceof Error ? reason.message : "Could not retrieve your confirmation.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [slug, token]);

  if (loading) {
    return <div className="simple-auth"><div className="auth-form-wrap"><LoaderCircle className="spin" size={24} /><p>Retrieving your confirmation…</p></div></div>;
  }

  if (error || !confirmation) {
    return (
      <div className="simple-error">
        <Brand />
        <div className="error-card">
          <span className="error-ornament">✳</span>
          <div className="eyebrow"><span className="eyebrow-line" /> CONFIRMATION NOT FOUND</div>
          <h1>We couldn't<br /><em>find your RSVP.</em></h1>
          <p>{error || "No confirmation details available."}</p>
          <Link className="button button-dark" to={`/event/${slug}`}>Back to the invitation <ArrowRight size={16} /></Link>
        </div>
      </div>
    );
  }

  const isAttending = confirmation.attendanceIntent === "ATTENDING";
  const primaryAttendee = confirmation.attendees.find((a) => a.attendeeType === "PRIMARY") || confirmation.attendees[0];
  const guestName = primaryAttendee ? `${primaryAttendee.firstName} ${primaryAttendee.lastName}`.trim() : "Your seat";
  const eventTitle = confirmation.event?.title || "the celebration";
  const displayGraduate = graduateName || "your graduate";
  const badgeStatus = confirmation.status === "APPROVED" ? "Approved" : confirmation.status === "PENDING" ? "Pending" : "Received";

  return (
    <div className="confirmation-page">
      <Brand />
      <div className="confirmation-card">
        <div className="confirmation-spark">✳</div>
        <div className="eyebrow"><span className="eyebrow-line" /> IT'S ON ITS WAY</div>
        <h1>{isAttending ? "Your seat is" : "We'll miss you,"}<br /><em>{isAttending ? "almost yours." : "but we understand."}</em></h1>
        <p>
          {isAttending
            ? `${guestName}, your RSVP for ${eventTitle} is with ${displayGraduate} for approval.`
            : `${displayGraduate} will be sorry to miss you at ${eventTitle}.`}
        </p>
        {isAttending && (
          <div className="confirmation-next">
            <span className="step-icon"><Clock3 size={18} /></span>
            <span>
              <b>Waiting for approval</b>
              <small>We'll send your individual ticket by email once you're approved.</small>
            </span>
            <StatusBadge status={badgeStatus} />
          </div>
        )}
        <Link className="button button-dark" to={`/event/${slug}`}>Back to the invitation <ArrowRight size={16} /></Link>
        <span className="confirmation-signoff">With love, {displayGraduate}</span>
      </div>
    </div>
  );
}

function EventOverviewPage() {
  const { eventId = "" } = useParams();
  const { getEvent, refreshEvent, notify } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const justPublished = typeof location.state === "object" && location.state !== null
    && "justPublished" in location.state && location.state.justPublished === true;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!justPublished) return;
    const timer = window.setTimeout(() => navigate(location.pathname, { replace: true, state: null }), 2600);
    return () => window.clearTimeout(timer);
  }, [justPublished, location.pathname, navigate]);
  useEffect(() => {
    let active = true;
    void refreshEvent(eventId).catch((reason) => {
      if (active) setLoadError(reason instanceof Error ? reason.message : "The event could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [eventId]);
  const event = getEvent(eventId);
  if (loading && !event) return <div className="empty-state"><LoaderCircle className="spin" size={22} /> Loading event details…</div>;
  if (!event) return loadError ? <div className="inline-error" role="alert">{loadError}<Link to="/dashboard/events" className="subtle-link">Back to events</Link></div> : <NotFoundPage />;
  const approvedPeople = event.approvedAttendeeCount ?? 0;
  const checked = 0;
  const pending = event.pendingRegistrationCount ?? 0;
  const shareInvitation = async () => {
    const url = `${window.location.origin}/event/${event.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: `You're invited to celebrate with ${event.graduateName}.`, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify("Invitation link copied. It's ready to share.");
      } else {
        notify(`Copy this invitation link: ${url}`, "error");
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      notify("Couldn't share the invitation. Try copying the link instead.", "error");
    }
  };
  return <div className="page-stack">
    {justPublished && <div className="confetti-burst" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <span key={index} style={{ left: `${(index * 47 + 7) % 100}%`, animationDelay: `${index % 6 * 70}ms`, backgroundColor: `hsl(${(index * 43) % 360} 55% 65%)` }} />)}</div>}
    <div className={`event-overview-hero${event.coverImage ? " has-cover" : ""}`}>{event.coverImage ? <img className="event-overview-cover" src={event.coverImage} alt="" aria-hidden="true" /> : <><div className="event-overview-pattern">✳</div><div className="event-hero-monogram">{event.graduateName.charAt(0)}</div></>}<div className="event-overview-hero-copy"><div className="event-overview-top"><span className="panel-kicker">YOUR CELEBRATION</span><StatusBadge status={event.status} /></div><h1>{event.title}</h1><p>{event.description || "All the details for your special day."}</p><div className="event-hero-meta"><span><CalendarDays size={15} />{formatDate(event.startAt)}</span><span><MapPin size={15} />{event.venue}</span></div><div className="event-overview-actions"><Link to={`/event/${event.slug}`} target="_blank" rel="noopener noreferrer" className="button button-outline button-sm">Preview invitation <ExternalLink size={14} /></Link><button className="button button-dark button-sm" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/event/${event.slug}`).then(() => notify("Invitation link copied."), () => notify("Couldn't copy the link. You can share the invitation directly.", "error")); }}><Copy size={14} /> Copy invitation link</button><button className="button button-outline button-sm" onClick={shareInvitation}><Share2 size={14} /> Share</button></div></div></div>
    <div className="event-mini-stats">{[{ value: String(event.registrationCount ?? 0).padStart(2, "0"), label: "RSVP submissions", icon: Users }, { value: String(pending).padStart(2, "0"), label: "Pending your review", icon: Clock3 }, { value: String(approvedPeople).padStart(2, "0"), label: "Expected guests", icon: CheckCircle2 }, { value: String(checked).padStart(2, "0"), label: "Checked in", icon: QrCode }].map(({ value, label, icon: Icon }) => <div className="mini-stat" key={label}><Icon size={17} /><span><b>{value}</b><small>{label}</small></span></div>)}</div>
    <div className="dashboard-columns"><section className="panel"><div className="panel-heading"><div><span className="panel-kicker">A LITTLE TO DO</span><h2>Guest RSVPs</h2></div><button className="subtle-link" onClick={() => navigate(`/dashboard/events/${event.id}/guests`)}>View all <ArrowRight size={14} /></button></div><EmptyState icon={<CheckCircle2 size={22} />} title={pending ? `${pending} registration${pending === 1 ? "" : "s"} pending.` : "Your RSVP details are ready to view."} text="You can view submitted RSVPs and individual guest details. RSVP approval and rejection aren't available yet." /></section><section className="panel event-quick-panel"><div className="panel-heading"><div><span className="panel-kicker">QUICK LINKS</span><h2>On the day</h2></div></div><Link to={`/dashboard/events/${event.id}/check-in`} className="quick-action"><span className="quick-action-icon peach"><QrCode size={18} /></span><span><b>Open check-in</b><small>Scan a guest ticket</small></span><ArrowRight size={15} /></Link><Link to={`/dashboard/events/${event.id}/tickets`} className="quick-action"><span className="quick-action-icon lavender"><Ticket size={18} /></span><span><b>Manage tickets</b><small>View guest passes</small></span><ArrowRight size={15} /></Link><button className="quick-action" onClick={() => navigate(`/dashboard/events/${event.id}/edit`)}><span className="quick-action-icon sage"><Settings size={18} /></span><span><b>Edit event details</b><small>Make a change</small></span><ArrowRight size={15} /></button></section></div>
  </div>;
}

function GuestManagementPage() {
  const { eventId = "" } = useParams();
  const { getEvent } = usePlatform();
  const event = getEvent(eventId);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "cards">(() => window.matchMedia("(max-width: 680px)").matches ? "cards" : "table");
  const [registrations, setRegistrations] = useState<ApiOrganiserRsvpRegistration[]>([]);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const updateView = () => setView(media.matches ? "cards" : "table");
    media.addEventListener("change", updateView);
    return () => media.removeEventListener("change", updateView);
  }, []);
  useEffect(() => {
    if (!event) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    void api.listOrganiserRsvps(event.id, page, 20).then((result) => {
      if (!active) return;
      setRegistrations(result.registrations);
      setPagination(result.pagination);
    }).catch((reason) => {
      if (!active) return;
      setRegistrations([]);
      setPagination({ page, pageSize: 20, total: 0, totalPages: 0 });
      setLoadError(reason instanceof Error ? reason.message : "Could not load RSVP registrations.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [event?.id, page, reloadCount]);
  if (!event) return <NotFoundPage />;
  const filters = ["All", "Pending", "Approved", "Declined", "Cancelled", "Not required", "Not attending"];
  const resultRows = registrations.map((registration) => {
    const primary = registration.attendees.find((attendee) => attendee.attendeeType === "PRIMARY");
    const additional = registration.attendees.filter((attendee) => attendee.attendeeType === "ADDITIONAL");
    const fullName = (attendee: typeof registration.attendees[number]) => `${attendee.firstName} ${attendee.lastName}`.trim();
    return { registration, primary, additional, fullName };
  });
  const results = resultRows.filter(({ registration, primary, additional, fullName }) => {
    const matchesFilter = filter === "All"
      || (filter === "Not attending" ? registration.attendanceIntent === "NOT_ATTENDING" : registration.status === filter.toUpperCase().replaceAll(" ", "_"));
    const searchable = [primary ? fullName(primary) : "", primary?.email ?? "", primary?.phone ?? "", registration.relationshipToGraduate ?? "", ...additional.map(fullName)].join(" ").toLowerCase();
    return matchesFilter && searchable.includes(query.trim().toLowerCase());
  });
  const statusLabel = (status: string) => status === "NOT_REQUIRED" ? "Not required" : status[0] + status.slice(1).toLowerCase();
  const dateLabel = (value: string) => formatDate(value, { day: "numeric", month: "short", year: "numeric" });
  const pageCounts = (status: string) => status === "All"
    ? registrations.length
    : status === "Not attending"
      ? registrations.filter((item) => item.attendanceIntent === "NOT_ATTENDING").length
      : registrations.filter((item) => item.status === status.toUpperCase().replaceAll(" ", "_")).length;
  return <div className="page-stack">
    <PageTitle eyebrow={event.title.toUpperCase()} title="Your guest list" description="A little hello from everyone who wants to celebrate with you." />
    <div className="guest-summary-grid">{[{ value: pagination.total, label: "Total RSVPs", color: "lavender" }, { value: registrations.length, label: "On this page", color: "peach" }].map((stat) => <div className="guest-summary" key={stat.label}><span className={`summary-dot ${stat.color}`} /><b>{String(stat.value).padStart(2, "0")}</b><small>{stat.label}</small></div>)}</div>
    <section className="panel guest-list-panel"><div className="guest-toolbar"><div className="guest-filter-tabs">{filters.map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}<span>{pageCounts(item)}</span></button>)}</div><div className="guest-search-row"><div className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this page…" /></div><div className="view-switch"><button aria-label="Table view" className={view === "table" ? "selected" : ""} onClick={() => setView("table")}><ListFilter size={16} /></button><button aria-label="Card view" className={view === "cards" ? "selected" : ""} onClick={() => setView("cards")}><LayoutDashboard size={16} /></button></div></div></div>
      {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22} /><h3>Loading RSVPs</h3><p>Fetching registrations for this event.</p></div>
          : loadError ? <EmptyState icon={<XCircle size={22} />} title="RSVPs couldn't load." text={loadError} action={<button className="button button-outline" onClick={() => setReloadCount((current) => current + 1)}>Try again</button>} />
          : results.length ? view === "table" ? <div className="table-scroll"><table className="guest-table"><thead><tr><th>PRIMARY GUEST</th><th>PHONE</th><th>ATTENDANCE</th><th>ADDITIONAL GUESTS</th><th>SUBMITTED</th><th>STATUS</th><th aria-label="Details" /></tr></thead><tbody>{results.map(({ registration, primary, additional, fullName }) => { const name = primary ? fullName(primary) : "Primary guest unavailable"; return <tr key={registration.id}><td><Link to={`/dashboard/events/${event.id}/guests/${registration.id}`} className="guest-name-cell"><span className="guest-avatar">{primary ? name.split(" ").map((p) => p[0]).join("") : "?"}</span><span><b>{name}</b><small>{primary?.email || "Email not provided"}{registration.relationshipToGraduate ? ` · ${registration.relationshipToGraduate}` : ""}</small></span></Link></td><td>{primary?.phone || "Not provided"}</td><td>{registration.attendanceIntent === "ATTENDING" ? "Attending" : "Not attending"}</td><td>{additional.length ? additional.map(fullName).join(", ") : "None"}</td><td>{dateLabel(registration.createdAt)}</td><td><StatusBadge status={statusLabel(registration.status)} /></td><td><Link className="mini-action" to={`/dashboard/events/${event.id}/guests/${registration.id}`} aria-label={`View ${name}`}><ArrowRight size={14} /></Link></td></tr>; })}</tbody></table></div> : <div className="guest-card-grid">{results.map(({ registration, primary, additional, fullName }) => { const name = primary ? fullName(primary) : "Primary guest unavailable"; return <Link className="guest-card" key={registration.id} to={`/dashboard/events/${event.id}/guests/${registration.id}`}><div className="guest-card-top"><span className="guest-avatar guest-avatar-large">{primary ? name.split(" ").map((p) => p[0]).join("") : "?"}</span><StatusBadge status={statusLabel(registration.status)} /></div><h3>{name}</h3><p>{primary?.email || "Email not provided"}</p><div className="guest-card-detail"><span>{primary?.phone || "Phone not provided"}</span><span>{registration.attendanceIntent === "ATTENDING" ? "Attending" : "Not attending"}</span></div><p>{additional.length ? `Additional guests: ${additional.map(fullName).join(", ")}` : "No additional guests"}{registration.relationshipToGraduate ? ` · ${registration.relationshipToGraduate}` : ""}</p><small>{dateLabel(registration.createdAt)}</small></Link>; })}</div>
          : <EmptyState icon={<Search size={22} />} title={registrations.length ? "No RSVPs match that." : "Your guest list is waiting."} text={registrations.length ? "Try another name or filter on this page." : "When guests RSVP, their registrations will appear here."} />}
      {!loading && !loadError && pagination.totalPages > 1 && <div className="guest-pagination"><button className="button button-outline button-sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={pagination.page <= 1}><ChevronLeft size={15} /> Previous</button><span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} registrations</span><button className="button button-outline button-sm" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={pagination.page >= pagination.totalPages}>Next <ChevronRight size={15} /></button></div>}
    </section>
  </div>;
}

function GuestDetailsPage() {
  const { eventId = "", guestId = "" } = useParams();
  const { getEvent } = usePlatform();
  const event = getEvent(eventId);
  const [registration, setRegistration] = useState<ApiOrganiserRsvpRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!event) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    void api.getOrganiserRsvp(event.id, guestId).then(({ registration: result }) => {
      if (active) setRegistration(result);
    }).catch((reason) => {
      if (!active) return;
      setRegistration(null);
      setLoadError(reason instanceof Error ? reason.message : "Could not load this RSVP registration.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [event?.id, guestId]);
  if (!event) return <NotFoundPage />;
  if (loading) return <div className="empty-state"><LoaderCircle className="spin" size={22} /><h3>Loading RSVP details</h3><p>Fetching this registration.</p></div>;
  if (loadError || !registration) return <div className="page-stack"><Link className="back-link" to={`/dashboard/events/${event.id}/guests`}><ArrowLeft size={15} /> Back to all RSVPs</Link><EmptyState icon={<XCircle size={22} />} title="RSVP details couldn't load." text={loadError || "This registration could not be found."} /></div>;
  const primary = registration.attendees.find((attendee) => attendee.attendeeType === "PRIMARY");
  const additional = registration.attendees.filter((attendee) => attendee.attendeeType === "ADDITIONAL");
  const fullName = (attendee: typeof registration.attendees[number]) => `${attendee.firstName} ${attendee.lastName}`.trim();
  const guestName = primary ? fullName(primary) : "Primary guest unavailable";
  const statusLabel = registration.status === "NOT_REQUIRED" ? "Not required" : registration.status[0] + registration.status.slice(1).toLowerCase();
  return <div className="page-stack"><Link className="back-link" to={`/dashboard/events/${event.id}/guests`}><ArrowLeft size={15} /> Back to all RSVPs</Link><div className="guest-detail-header"><div><span className="guest-avatar guest-avatar-xl">{primary ? guestName.split(" ").map((p) => p[0]).join("") : "?"}</span></div><div><div className="eyebrow"><span className="eyebrow-line" /> RSVP DETAILS</div><h1>{guestName}</h1><p>Submitted {formatDate(registration.createdAt)} · {event.title}</p></div><StatusBadge status={statusLabel} /></div><div className="guest-detail-grid"><section className="panel detail-panel"><div className="panel-heading"><div><span className="panel-kicker">A LITTLE ABOUT THEM</span><h2>Guest details</h2></div></div><DetailRow label="Email address" value={primary?.email ?? ""} /><DetailRow label="Phone number" value={primary?.phone ?? ""} /><DetailRow label="Relationship" value={registration.relationshipToGraduate ?? ""} /><DetailRow label="Attendance" value={registration.attendanceIntent === "ATTENDING" ? "Attending" : "Not attending"} /><DetailRow label="Additional guests" value={additional.length ? additional.map(fullName).join(", ") : "None"} /><div className="detail-people"><span className="field-label">ATTENDEES IN THIS GROUP</span>{registration.attendees.length ? registration.attendees.map((attendee) => <div className="detail-person" key={attendee.id}><span className="guest-avatar">{fullName(attendee).split(" ").map((p) => p[0]).join("")}</span><span><b>{fullName(attendee)}</b><small>{attendee.attendeeType === "PRIMARY" ? "Primary guest" : "Additional guest"}</small></span></div>) : <p className="muted-copy">No attendees listed for this registration.</p>}</div></section><aside className="panel detail-actions-panel"><span className="panel-kicker">REGISTRATION STATUS</span><h2>{statusLabel}</h2><p>This RSVP is shown as returned by Gather. This view does not change registration status.</p><DetailRow label="Submitted" value={formatDate(registration.createdAt)} /></aside></div></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><b>{value || "Not provided"}</b></div>;
}

function TicketManagementPage() {
  const { eventId = "" } = useParams();
  const { getEvent, getGuests } = usePlatform();
  const event = getEvent(eventId);
  if (!event) return <NotFoundPage />;
  const people = getGuests(event.id).filter((guest) => guest.status === "Approved" && guest.attending).flatMap((guest) => [guest.name, ...guest.additionalGuests].map((name) => ({ guest, name })));
  return <div className="page-stack"><PageTitle eyebrow={event.title.toUpperCase()} title="Guest tickets" description="Every approved guest gets their own pass to your celebration." action={<span className="tickets-total">{people.length} TICKETS</span>} />{people.length ? <div className="ticket-grid">{people.map(({ guest, name }) => <TicketCard key={`${guest.id}-${name}`} event={event} guest={guest} attendeeName={name} />)}</div> : <EmptyState icon={<Ticket size={22} />} title="Tickets will appear here." text="Approve an attending RSVP to create individual guest tickets." action={<Link className="button button-dark" to={`/dashboard/events/${event.id}/guests`}>Review RSVPs <ArrowRight size={15} /></Link>} />}</div>;
}

function TicketCard({ event, guest, attendeeName }: { event: EventRecord; guest: GuestRecord; attendeeName: string }) {
  const token = ticketToken(guest, attendeeName);
  const checked = guest.checkedIn.includes(attendeeName);
  return <article className="ticket-card"><div className="ticket-card-top"><span className="ticket-brand"><span className="brand-symbol"><img src="/gather-mark.png" alt="" /></span><span>gather<span className="brand-period">.</span></span></span><StatusBadge status={checked ? "Checked in" : "Valid"} /></div><div className="ticket-event-title"><span className="panel-kicker">YOU'RE INVITED TO</span><h2>{event.title}</h2><p>Celebrating {event.graduateName}</p></div><div className="ticket-body"><div><span className="ticket-label">ATTENDEE</span><b className="ticket-attendee">{attendeeName}</b><span className="ticket-label">DATE & TIME</span><b>{formatDate(event.startAt, { day: "numeric", month: "long", year: "numeric" }, event.timezone)}</b><small>{formatTime(event.startAt, event.timezone)}</small><span className="ticket-label">VENUE</span><b>{event.venue}</b><small>{event.address}</small></div><div className={`ticket-qr ${checked ? "ticket-qr-checked" : ""}`} aria-label={`Ticket QR for ${attendeeName}`}><QrVisual value={token} /><small>{checked ? "ALREADY USED" : "NOT VALID AT DOOR"}</small></div></div><div className="ticket-ref"><span>REFERENCE</span><b>{token.slice(-8).toUpperCase()}</b><Link to={`/ticket/${token}`}>Open ticket <ExternalLink size={11} /></Link></div><p className="ticket-security-note"><ShieldCheck size={14} /> Ticket verification must be connected before this pass can be used for entry.</p></article>;
}

function QrVisual({ value }: { value: string }) {
  return <QRCodeSVG value={value} size={122} level="M" includeMargin bgColor="#ffffff" fgColor="#252821" />;
}

function PublicTicketPage() {
  const { token = "" } = useParams();
  const { guests, events } = usePlatform();
  const matched = guests.flatMap((item) => [item.name, ...item.additionalGuests]
    .filter((name) => ticketToken(item, name) === token)
    .map((name) => ({ guest: item, name })))[0];
  const guest = matched?.guest;
  const event = events.find((item) => item.id === guest?.eventId);
  const attendeeName = matched?.name;
  if (!guest || !event || !attendeeName || guest.status !== "Approved") return <div className="simple-error"><Brand /><div className="error-card"><span className="error-ornament">✳</span><div className="eyebrow"><span className="eyebrow-line" /> TICKET NOT FOUND</div><h1>This ticket<br /><em>isn't available.</em></h1><p>Tickets become available after the graduate approves your RSVP. If you think this is a mistake, contact the event host.</p><Link className="button button-dark" to="/">Back to Gather <ArrowRight size={16} /></Link></div></div>;
  return <div className="public-ticket-page"><Brand /><div className="public-ticket-heading"><span className="eyebrow"><span className="eyebrow-line" /> YOUR INVITATION, IN YOUR POCKET</span><h1>A little pass to<br /><em>something special.</em></h1></div><TicketCard event={event} guest={guest} attendeeName={attendeeName} /><p className="public-ticket-help"><Mail size={15} /> Your group receives their tickets by email after approval.</p><Link to={`/event/${event.slug}`} className="back-link"><ArrowLeft size={15} /> Back to the invitation</Link></div>;
}

function CheckInPage() {
  const { eventId = "" } = useParams();
  const { getEvent, getGuests, checkIn, notify } = usePlatform();
  const event = getEvent(eventId);
  const [query, setQuery] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanResult, setScanResult] = useState<{ guest: GuestRecord; name: string; state: "success" | "duplicate" | "invalid" } | null>(null);
  if (!event) return <NotFoundPage />;
  const guests = getGuests(event.id);
  const attendees = guests.filter((guest) => guest.status === "Approved" && guest.attending).flatMap((guest) => [guest.name, ...guest.additionalGuests].map((name) => ({ guest, name })));
  const checkedCount = attendees.filter(({ guest, name }) => guest.checkedIn.includes(name)).length;
  const progress = attendees.length ? Math.round(checkedCount / attendees.length * 100) : 0;
  const results = attendees.filter(({ guest, name }) => `${name} ${guest.name} ${guest.email} ${guest.phone} ${ticketToken(guest, name)}`.toLowerCase().includes(query.toLowerCase()));
  const handleScan = (value: string) => {
    setScanValue(value);
    const found = attendees.find(({ guest, name }) => ticketToken(guest, name) === value.trim());
    if (!found) { setScanResult({ guest: { id: "", eventId: event.id, name: "Unknown guest", email: "", phone: "", relationship: "", attending: true, additionalGuests: [], status: "Declined", submittedAt: "", checkedIn: [] }, name: "", state: "invalid" }); return; }
    if (found.guest.checkedIn.includes(found.name)) { setScanResult({ ...found, state: "duplicate" }); return; }
    const success = checkIn(found.guest.id, found.name);
    setScanResult({ ...found, state: success ? "success" : "duplicate" });
    if (success) notify(`${found.name} is checked in.`);
  };
  const manualCheckIn = (guest: GuestRecord, name: string) => {
    if (guest.checkedIn.includes(name)) { setScanResult({ guest, name, state: "duplicate" }); return; }
    if (!window.confirm(`Check in ${name}?`)) return;
    checkIn(guest.id, name);
    setScanResult({ guest, name, state: "success" });
    notify(`${name} is checked in.`);
  };
  return <div className="page-stack checkin-page"><PageTitle eyebrow="THE DAY IS HERE" title="Welcome them in." description={`Check in guests for ${event.title}.`} action={<span className="checkin-live"><i /> EVENT DAY MODE</span>} />
    <div className="checkin-stats"><div><span className="checkin-stat-icon"><Users size={17} /></span><span><b>{attendees.length}</b><small>Approved attendees</small></span></div><div><span className="checkin-stat-icon checked-stat"><Check size={17} /></span><span><b>{checkedCount}</b><small>Welcomed in</small></span></div><div className="checkin-progress-stat"><span><b>{progress}%</b><small>Check-in complete</small></span><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div></div>
    <div className="checkin-layout"><section className="scanner-panel panel"><div className="scanner-panel-title"><span className="scanner-title-icon"><QrCode size={19} /></span><span><b>Scan a guest's ticket</b><small>Point the camera at their QR code</small></span></div><Suspense fallback={<div className="scanner-viewport"><LoaderCircle className="spin" size={22} /></div>}><Scanner onScan={handleScan} /></Suspense><div className="scanner-divider"><span />OR ENTER TICKET CODE<span /></div><div className="scanner-input-row"><div className="search-field"><QrCode size={16} /><input value={scanValue} onChange={(e) => setScanValue(e.target.value)} placeholder="Paste ticket code…" onKeyDown={(e) => e.key === "Enter" && handleScan(scanValue)} /></div><button className="button button-dark" onClick={() => handleScan(scanValue)}>Check ticket <ArrowRight size={15} /></button></div>{scanResult && <div className={`scan-result scan-${scanResult.state}`}><span className="scan-result-icon">{scanResult.state === "success" ? <Check size={20} /> : scanResult.state === "duplicate" ? <CheckCircle2 size={20} /> : <XCircle size={20} />}</span><span><b>{scanResult.state === "success" ? "You're all set!" : scanResult.state === "duplicate" ? "Already checked in" : "Ticket not recognised"}</b><small>{scanResult.state === "success" ? `${scanResult.name} · Welcome to ${event.title}` : scanResult.state === "duplicate" ? `${scanResult.name} has already been checked in.` : "Try another code or look up your guest manually."}</small></span><button className="icon-button" onClick={() => setScanResult(null)} aria-label="Dismiss scan result"><X size={16} /></button></div>}</section>
      <section className="panel manual-lookup-panel"><div className="panel-heading"><div><span className="panel-kicker">CAMERA NOT COOPERATING?</span><h2>Find them by name.</h2></div><Search size={17} /></div><div className="search-field manual-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, email or ticket code…" /></div><div className="manual-results">{results.slice(0, 8).map(({ guest, name }) => { const checked = guest.checkedIn.includes(name); return <div className="manual-result" key={`${guest.id}-${name}`}><span className="guest-avatar">{name.split(" ").map((p) => p[0]).join("")}</span><span><b>{name}</b><small>{guest.name === name ? "Primary guest" : `With ${guest.name}`}</small></span>{checked ? <StatusBadge status="Checked in" /> : <button className="mini-action approve-action" onClick={() => manualCheckIn(guest, name)} aria-label={`Check in ${name}`}><Check size={15} /></button>}</div>; })}{!results.length && <span className="manual-empty">No approved guests found. Try another search.</span>}</div><Link className="subtle-link checkin-view-guests" to={`/dashboard/events/${event.id}/guests`}>View guest list <ArrowRight size={14} /></Link></section></div>
  </div>;
}

function PhotoGalleryEditor({ photos, onChange }: { photos: GalleryImage[]; onChange: (photos: GalleryImage[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [activeImage, setActiveImage] = useState<number | null>(null);
  const update = (next: GalleryImage[]) => {
    try {
      onChange(next);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/") && file.size <= 1_500_000);
    const skipped = files.length - selected.length;
    if (!selected.length) {
      setError("Choose image files under 1.5 MB each.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setError(skipped ? `${skipped} file${skipped === 1 ? " was" : "s were"} skipped. Choose image files under 1.5 MB each.` : "");
    const added: GalleryImage[] = [];
    const failures: string[] = [];
    try {
      for (const [index, file] of selected.entries()) {
        try {
          const src = await readImagePreview(file, (value) => setProgress(Math.round((index * 100 + value) / selected.length)));
          added.push({ id: crypto.randomUUID(), src, published: false });
        } catch (reason) {
          failures.push(reason instanceof Error ? reason.message : String(reason));
        }
      }
      if (added.length) {
        try {
          onChange([...photos, ...added]);
        } catch (reason) {
          throw reason instanceof Error ? reason : new Error(String(reason));
        }
      }
      const skippedCount = skipped + failures.length;
      if (skippedCount || !added.length) {
        const detail = failures[0] ? ` ${failures[0]}` : "";
        setError(`${added.length} photo${added.length === 1 ? "" : "s"} added; ${skippedCount} file${skippedCount === 1 ? " was" : "s were"} skipped.${detail}`);
      } else {
        setError("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };
  const moveImage = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    update(reordered);
  };
  const uploadAction = <label className={`button button-dark upload-button ${uploading ? "uploading" : ""}`}><Upload size={15} />{uploading ? `Preparing ${progress}%` : "Add photos"}<input type="file" accept="image/*" multiple disabled={uploading} onChange={(event) => { void addImages(event.target.files); event.currentTarget.value = ""; }} /></label>;
  return <section className="photo-editor">
    <div className="photo-editor-heading"><div><label>Graduation memories</label><p>Upload photos, arrange them, and choose which ones guests can see.</p></div>{uploadAction}</div>
    {uploading && <div className="photo-upload-progress" role="status"><span style={{ width: `${progress}%` }} />Uploading and preparing photos · {progress}%</div>}
    {error && <p className="photo-editor-error" role="alert"><XCircle size={15} />{error}</p>}
    {photos.length ? <div className="photo-editor-grid">{photos.map((photo, index) => <figure className="photo-editor-card" key={photo.id}>
      <button type="button" className="photo-editor-preview" onClick={() => setActiveImage(index)} aria-label={`Preview graduation memory ${index + 1}`}><img src={photo.src} alt={`Graduation memory preview ${index + 1}`} /><span><Eye size={14} /> Preview</span></button>
      <div className="photo-editor-controls"><button type="button" className={`photo-public-toggle ${photo.published ? "is-published" : ""}`} aria-pressed={photo.published} onClick={() => update(photos.map((item, current) => current === index ? { ...item, published: !item.published } : item))}><Eye size={14} />{photo.published ? "Published" : "Private"}</button><div><button type="button" aria-label={`Move photo ${index + 1} earlier`} disabled={uploading || index === 0} onClick={() => moveImage(index, -1)}><ChevronUp size={15} /></button><button type="button" aria-label={`Move photo ${index + 1} later`} disabled={uploading || index === photos.length - 1} onClick={() => moveImage(index, 1)}><ChevronDown size={15} /></button><button type="button" aria-label={`Delete photo ${index + 1}`} disabled={uploading} onClick={() => update(photos.filter((_, current) => current !== index))}><Trash2 size={15} /></button></div></div>
    </figure>)}</div> : <div className="photo-editor-empty"><ImagePlus size={20} /><span>No graduation photos yet. Add a few favorites to your invitation.</span></div>}
    {activeImage !== null && <ImageLightbox images={photos.map((photo) => photo.src)} active={activeImage} onSelect={setActiveImage} onClose={() => setActiveImage(null)} />}
  </section>;
}

function GalleryPage() {
  const { eventId = "" } = useParams();
  const { getEvent, saveEvent } = usePlatform();
  const event = getEvent(eventId);
  if (!event) return <NotFoundPage />;
  const photos = event.galleryImages || [];
  const publishedCount = photos.filter((photo) => photo.published).length;
  const savePhotos = (galleryImages: GalleryImage[]) => saveEvent({ ...event, galleryImages });
  return <div className="page-stack">
    <PageTitle eyebrow={event.title.toUpperCase()} title="Graduation memories" description="Create an editorial gallery for your invitation. Preview, arrange, and publish each photo." />
    <div className="gallery-note"><ImagePlus size={17} /><span><b>{publishedCount} of {photos.length} photos published</b><small>Only published photos are visible to anyone with your public invitation link. No RSVP or login is needed.</small></span><StatusBadge status={publishedCount ? "Published" : "Private"} /></div>
    <PhotoGalleryEditor photos={photos} onChange={savePhotos} />
  </div>;
}

function ProfilePage() {
  const { notify, user } = usePlatform();
  const initials = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "G";
  return <div className="page-stack"><PageTitle eyebrow="THE PERSON BEHIND THE PARTY" title="Your profile" description="A few details about you and your account." /><div className="settings-layout"><section className="panel settings-panel"><div className="panel-heading"><div><span className="panel-kicker">YOUR DETAILS</span><h2>Profile information</h2></div></div><div className="profile-edit-avatar"><span className="profile-avatar profile-avatar-xl">{initials}</span></div><div className="form-grid"><Field label="Full name" name="profile-name" defaultValue={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()} /><Field label="Email address" name="profile-email" defaultValue={user?.email ?? ""} type="email" /><div className="field field-span"><label htmlFor="profile-bio">A little about you</label><textarea id="profile-bio" rows={3} placeholder="Tell us something about yourself…" /></div></div><div className="settings-footer"><button className="button button-dark" onClick={() => notify("Profile editing is not available in the current API.", "error")}>Save changes <Check size={15} /></button></div></section><aside className="panel profile-help"><span className="auth-icon"><UserRound size={19} /></span><h3>Your profile, your story.</h3><p>Your Gather account details are loaded securely from your profile.</p><div className="demo-auth-note"><ShieldCheck size={15} /><span>Profile updates are not available in the current API.</span></div></aside></div></div>;
}

function SettingsPage() {
  const { signOut, notify } = usePlatform();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  return <div className="page-stack">
    <PageTitle eyebrow="MAKE YOURSELF AT HOME" title="Settings" description="A few preferences for your Gather workspace." />
    <div className="settings-layout">
      <section className="panel settings-panel">
        <div className="panel-heading"><div><span className="panel-kicker">ACCOUNT & PRIVACY</span><h2>Account settings</h2></div></div>
        <div className="setting-row appearance-setting">
          <span className="setting-icon">{theme === "light" ? <Sun size={17} /> : <Moon size={17} />}</span>
          <span><b>Appearance</b><small>Choose a light or dark look for Gather.</small></span>
          <div className="theme-option-group" role="group" aria-label="Color theme">
            <button type="button" className={`theme-option ${theme === "light" ? "selected" : ""}`} aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={14} /> Light</button>
            <button type="button" className={`theme-option ${theme === "dark" ? "selected" : ""}`} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={14} /> Dark</button>
          </div>
        </div>
        <div className="setting-row"><span className="setting-icon"><Mail size={17} /></span><span><b>Email notifications</b><small>Email delivery requires a connected email service.</small></span><input type="checkbox" disabled aria-label="Email notifications unavailable" title="Connect an email service to enable email notifications" /></div>
        <div className="setting-row"><span className="setting-icon"><LockKeyhole size={17} /></span><span><b>Password & security</b><small>Keep your account safe and up to date.</small></span><button className="button button-outline button-sm" onClick={() => notify("Password changes require a connected API.")}>Change password</button></div>
        <div className="setting-row"><span className="setting-icon"><ShieldCheck size={17} /></span><span><b>Your data</b><small>Export or remove your account information.</small></span><button className="button button-outline button-sm" onClick={() => notify("Data controls will be available with the connected API.")}>Manage</button></div>
        <div className="settings-footer"><button className="button button-outline danger-outline" onClick={() => { signOut(); navigate("/"); }}>Sign out of Gather <LogOut size={15} /></button></div>
      </section>
      <aside className="panel profile-help"><span className="auth-icon"><CircleHelp size={19} /></span><h3>We're here for you.</h3><p>Have a question about your events or guests? We'd love to help make your day easy.</p><a className="subtle-link" href="mailto:hello@gather.example">Get in touch <ArrowRight size={14} /></a></aside>
    </div>
  </div>;
}

function NotFoundPage() {
  return <div className="simple-error"><Brand /><div className="error-card"><span className="error-ornament">✳</span><div className="eyebrow"><span className="eyebrow-line" /> THIS PAGE IS TAKING A MOMENT</div><h1>We can't find<br /><em>that page.</em></h1><p>It may have moved, or maybe the link needs another look.</p><Link className="button button-dark" to="/dashboard">Back to your dashboard <ArrowRight size={16} /></Link></div></div>;
}

export default App;
