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
import { attendeeCount, formatDate, formatTime, getDemoTicketToken, PlatformProvider, slugify, usePlatform } from "./platform";
import type { EventRecord, GalleryImage, GuestRecord, GuestStatus } from "./platform";

const demoEvent = "event-next-chapter";
const ticketToken = (guest: GuestRecord, attendeeName: string) => getDemoTicketToken(guest, attendeeName);
const Scanner = lazy(() => import("./Scanner"));
type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem("gather.theme") === "dark" ? "dark" : "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("gather.theme", theme);
  }, [theme]);

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
  const { authenticated } = usePlatform();
  const location = useLocation();
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
  const { signIn, notify } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (mode === "signup" && data.get("password") !== data.get("confirmPassword")) {
      setError("Those passwords don't match yet.");
      return;
    }
    setError("");
    setBusy(true);
    window.setTimeout(() => {
      signIn();
      notify(mode === "signup" ? "Your account is ready." : "Welcome back. You're signed in.");
      const state = location.state as { from?: string } | null;
      navigate(state?.from || "/dashboard");
      setBusy(false);
    }, 350);
  };
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
        <div className="demo-auth-note"><ShieldCheck size={15} /><span>Sign-in is stored in this browser; secure accounts need a connected authentication service.</span></div>
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
  const { events, guests, signOut } = usePlatform();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const eventId = location.pathname.match(/\/events\/([^/]+)/)?.[1];
  const activeEvent = events.find((event) => event.id === eventId) || events[0];
  const base = activeEvent ? `/dashboard/events/${activeEvent.id}` : "/dashboard/events";
  const pendingCount = activeEvent ? guests.filter((guest) => guest.eventId === activeEvent.id && guest.status === "Pending").length : 0;
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
        <div className="workspace-switch"><span className="workspace-avatar">A</span><span><b>Amara's workspace</b><small>Personal account</small></span><ChevronDown size={15} /></div>
        <nav className="side-nav" aria-label="Dashboard navigation">
          <span className="nav-section-label">WORKSPACE</span>
          {mainItems.map((item) => <SideLink key={item.to} {...item} active={location.pathname === item.to || (item.to === "/dashboard/events" && location.pathname === item.to)} />)}
          <div className="nav-divider" />
          <div className="event-nav-heading"><span className="nav-section-label">YOUR EVENT</span>{activeEvent && <span className="event-nav-name">{activeEvent.title}</span>}</div>
          {eventItems.map((item) => <SideLink key={item.to} {...item} active={location.pathname === item.to || (item.label === "Guests" && location.pathname.includes("/guests"))} />)}
          <div className="nav-divider" /><span className="nav-section-label">ACCOUNT</span>
          {accountItems.map((item) => <SideLink key={item.to} {...item} active={location.pathname === item.to} />)}
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><div className="help-card-icon"><CircleHelp size={17} /></div><b>Need a hand?</b><span>We're here to help you make it special.</span><a href="mailto:hello@gather.example">Get in touch <ArrowUpRight size={13} /></a></div><button className="side-link logout-link" onClick={() => { signOut(); navigate("/"); }}><LogOut size={17} /> <span>Sign out</span></button><div className="sidebar-profile"><span className="profile-avatar">AO</span><span><b>Amara Okafor</b><small>Free plan</small></span><MoreHorizontal size={18} /></div></div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="dashboard-main">
        <header className="dashboard-topbar"><button className="mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><b>{currentLabel}</b></div><div className="topbar-actions"><NotificationCenter /><button className="icon-button theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button><span className="topbar-avatar">AO</span></div></header>
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
  const { events, guests } = usePlatform();
  const navigate = useNavigate();
  const totalRSVP = guests.length;
  const approved = guests.filter((guest) => guest.status === "Approved" && guest.attending).reduce((sum, guest) => sum + attendeeCount(guest), 0);
  const checkedIn = guests.reduce((sum, guest) => sum + guest.checkedIn.length, 0);
  const stats = [{ label: "Your events", value: String(events.length).padStart(2, "0"), change: "All in one place", icon: CalendarDays, tone: "sand" }, { label: "RSVPs received", value: String(totalRSVP).padStart(2, "0"), change: `${guests.filter((guest) => guest.status === "Pending").length} waiting for you`, icon: Users, tone: "lilac" }, { label: "Guests approved", value: String(approved).padStart(2, "0"), change: "Across all your events", icon: CheckCircle2, tone: "mint" }, { label: "Checked in", value: String(checkedIn).padStart(2, "0"), change: "For your celebrations", icon: QrCode, tone: "rose" }];
  const latest = [...events].sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 3);
  const upcoming = events[0];
  const daysUntilEvent = upcoming ? Math.max(0, Math.ceil((new Date(upcoming.startAt).getTime() - Date.now()) / 86_400_000)) : 0;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase();
  return <div className="page-stack">
    <div className="welcome-strip"><div><span className="welcome-overline">{todayLabel}</span><h1>{greeting}, Amara <span>✳</span></h1><p>Your big day is coming together beautifully.</p></div><Link className="button button-dark" to="/dashboard/events/create"><Plus size={16} /> Create an event</Link></div>
    <div className="stats-grid">{stats.map(({ label, value, change, icon: Icon, tone }) => <article className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon size={18} /></div><span className="stat-label">{label}</span><div className="stat-bottom"><strong>{value}</strong><span>{change}</span></div></article>)}</div>
    <div className="dashboard-columns"><section className="panel events-panel"><div className="panel-heading"><div><span className="panel-kicker">YOUR CELEBRATIONS</span><h2>Recent events</h2></div><Link className="subtle-link" to="/dashboard/events">See all <ArrowRight size={15} /></Link></div>{latest.length ? <div className="recent-event-list">{latest.map((event) => <EventRow key={event.id} event={event} onClick={() => navigate(`/dashboard/events/${event.id}`)} />)}</div> : <EmptyState icon={<CalendarDays size={23} />} title="Your first celebration is waiting." text="Create an event and make an invitation your guests will love." action={<Link className="button button-dark" to="/dashboard/events/create"><Plus size={15} /> Create an event</Link>} />}</section>
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">A LITTLE UPDATE</span><h2>Recent activity</h2></div><button className="icon-button" aria-label="More activity"><MoreHorizontal size={18} /></button></div><div className="activity-list"><Activity icon={<Users size={15} />} title="New RSVP from Dara Adebayo" detail="The Next Chapter · 1 day ago" tone="blue" /><Activity icon={<Check size={15} />} title="Zainab Bello was approved" detail="The Next Chapter · 3 days ago" tone="green" /><Activity icon={<QrCode size={15} />} title="A guest checked in" detail="The Next Chapter · 4 days ago" tone="gold" /></div><Link className="activity-footer" to={`/dashboard/events/${events[0]?.id || demoEvent}/guests`}>View all guest activity <ArrowRight size={14} /></Link></section></div>
    <section className="upcoming-banner"><div className="upcoming-text"><span className="panel-kicker">COMING UP NEXT</span><h2>{upcoming?.title || "Your next event"}</h2><p><CalendarDays size={15} /> {upcoming ? formatDate(upcoming.startAt) : "Add a date to your event"} <span className="bullet-separator">·</span> <MapPin size={15} /> {upcoming?.venue || "Add a venue"}</p><Link className="text-link" to={`/dashboard/events/${upcoming?.id || demoEvent}`}>Open event dashboard <ArrowRight size={15} /></Link></div><div className="upcoming-art"><span>✳</span><div className="upcoming-count"><b>{upcoming ? String(daysUntilEvent).padStart(2, "0") : "—"}</b><small>{upcoming ? daysUntilEvent === 0 ? "EVENT DAY" : "DAYS TO GO" : "ADD YOUR DATE"}</small></div></div></section>
  </div>;
}

function Activity({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail: string; tone: string }) {
  return <div className="activity-item"><span className={`activity-icon ${tone}`}>{icon}</span><span><b>{title}</b><small>{detail}</small></span></div>;
}

function EventRow({ event, onClick }: { event: EventRecord; onClick: () => void }) {
  const { getGuests } = usePlatform();
  const guests = getGuests(event.id);
  return <button className="recent-event-row" onClick={onClick}><div className={`event-thumb ${event.status === "Published" ? "thumb-published" : "thumb-draft"}`}><span>{event.graduateName?.slice(0, 1) || "G"}</span><i>✳</i></div><span className="event-row-main"><b>{event.title || "Untitled event"}</b><small>{formatDate(event.startAt, { day: "numeric", month: "short", year: "numeric" })}<span>·</span>{event.venue || "Venue to be confirmed"}</small></span><span className="event-row-count"><b>{guests.length}</b><small>RSVPs</small></span><StatusBadge status={event.status} /><ArrowRight size={16} className="row-arrow" /></button>;
}

function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  return <span className={`status-badge status-${lower.replaceAll(" ", "-")}`}><i />{status}</span>;
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function EventsPage() {
  const { events, getGuests, saveEvent, removeEvent, notify } = usePlatform();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All events");
  const navigate = useNavigate();
  const filtered = events.filter((event) => (filter === "All events" || event.status === filter) && `${event.title} ${event.category}`.toLowerCase().includes(query.toLowerCase()));
  const togglePublish = (event: EventRecord) => {
    const status = event.status === "Published" ? "Unpublished" : "Published";
    saveEvent({ ...event, status });
    notify(status === "Published" ? "Your invitation is live." : "Your invitation has been unpublished.");
  };
  const deleteEvent = (event: EventRecord) => {
    if (window.confirm(`Delete “${event.title}” and its guest list?`)) {
      removeEvent(event.id);
      notify("Event removed.");
    }
  };
  return <div className="page-stack">
    <PageTitle eyebrow="A PLACE FOR EVERY MILESTONE" title="My events" description="Every celebration, all in one place." action={<Link className="button button-dark" to="/dashboard/events/create"><Plus size={16} /> Create event</Link>} />
    <div className="list-toolbar"><div className="search-field"><Search size={17} /><input placeholder="Search your events…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" /></div><div className="filter-wrap"><Filter size={15} /><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status"><option>All events</option><option>Published</option><option>Draft</option><option>Unpublished</option><option>Archived</option></select><ChevronDown size={14} /></div><span className="result-count">{filtered.length} {filtered.length === 1 ? "event" : "events"}</span></div>
    {filtered.length ? <div className="events-grid">{filtered.map((event) => <article className="event-card" key={event.id}><button className={`event-card-cover ${event.status === "Published" ? "cover-olive" : "cover-rose"}`} style={event.coverImage ? { backgroundImage: `linear-gradient(rgba(40,43,37,.25),rgba(40,43,37,.25)),url(${event.coverImage})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined} onClick={() => navigate(`/dashboard/events/${event.id}`)} aria-label={`View ${event.title}`}><span className="cover-ornament">✳</span><span className="cover-title">{event.graduateName.split(" ").map((word) => word[0]).join("")}</span><span className="cover-date">{formatDate(event.startAt, { day: "numeric", month: "short" }).toUpperCase()}</span></button><div className="event-card-body"><div className="event-card-title"><div><span className="event-category">{event.category || "CELEBRATION"}</span><h3>{event.title || "Untitled event"}</h3></div><button className="icon-button" aria-label={`More actions for ${event.title}`} onClick={() => navigate(`/dashboard/events/${event.id}/edit`)}><MoreHorizontal size={18} /></button></div><div className="event-meta"><span><CalendarDays size={14} />{formatDate(event.startAt, { day: "numeric", month: "short", year: "numeric" })}</span><span><MapPin size={14} />{event.venue || "Venue to be confirmed"}</span></div><div className="event-card-stats"><span><b>{getGuests(event.id).length}</b> RSVPs</span><span><b>{getGuests(event.id).filter((guest) => guest.status === "Approved").reduce((n, guest) => n + attendeeCount(guest), 0)}</b> guests approved</span><StatusBadge status={event.status} /></div><div className="event-card-actions"><Link className="button button-outline button-sm" to={`/dashboard/events/${event.id}`}>Manage event</Link><button className="icon-button" title={event.status === "Published" ? "Unpublish" : "Publish"} aria-label={event.status === "Published" ? "Unpublish event" : "Publish event"} onClick={() => togglePublish(event)}><Share2 size={16} /></button><button className="icon-button danger-icon" title="Delete event" aria-label="Delete event" onClick={() => deleteEvent(event)}><Trash2 size={16} /></button></div></div></article>)}</div> : <EmptyState icon={<CalendarDays size={24} />} title={query || filter !== "All events" ? "Nothing here just yet." : "Your first celebration is waiting."} text={query || filter !== "All events" ? "Try changing the search or status filter." : "Create an event and bring your favourite people together."} action={!events.length ? <Link className="button button-dark" to="/dashboard/events/create"><Plus size={15} /> Create your first event</Link> : undefined} />}
  </div>;
}

const categories = ["Graduation Ceremony", "Graduation Party", "Thanksgiving", "Graduation Dinner", "Other"];
const wizardLabels = ["The basics", "Your story", "When & where", "Guest list", "Make it yours", "Preview"];

function EventWizard() {
  const { eventId } = useParams();
  const { events, getEvent, saveEvent, notify } = usePlatform();
  const existing = eventId ? getEvent(eventId) : undefined;
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [imageProgress, setImageProgress] = useState<number | null>(null);
  const [form, setForm] = useState<EventRecord>(() => existing || ({
    id: `event-${crypto.randomUUID()}`, slug: "", title: "", category: "", description: "",
    graduateName: "Amara Okafor", institution: "", faculty: "", department: "", qualification: "",
    startAt: "", endAt: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos",
    venue: "", address: "", instructions: "", rsvpDeadline: "", additionalLimit: 1,
    personalMessage: "", status: "Draft", accent: "#b18a55",
  }));
  const set = (key: keyof EventRecord, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
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
    setStep((current) => Math.min(current + 1, wizardLabels.length - 1));
  };
  const persist = (publish: boolean) => {
    const baseSlug = form.slug || slugify(form.title) || `celebration-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 2;
    while (events.some((event) => event.slug === slug && event.id !== form.id)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const saved = { ...form, slug, status: publish ? "Published" as const : "Draft" as const };
    try {
      saveEvent(saved);
      notify(publish ? "Your invitation is live. Share it with your people." : "Your event has been saved as a draft.");
      navigate(`/dashboard/events/${saved.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
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
  return <div className="page-stack wizard-page">
    <div className="wizard-topline"><Link to="/dashboard/events" className="back-link"><ArrowLeft size={15} /> All events</Link><span className="draft-save-indicator"><i /> Draft saved in this browser</span></div>
    <div className="wizard-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {existing ? "MAKE A FEW CHANGES" : "A NEW CELEBRATION"}</div><h1>{existing ? "Edit your event" : "Let's make it yours."}</h1><p>Thoughtful details make the best invitations. You can always come back to these.</p></div><span className="step-counter">0{step + 1} <i>/</i> 06</span></div>
    <div className="wizard-progress">{wizardLabels.map((label, index) => <button type="button" className={`wizard-step ${index === step ? "current" : ""} ${index < step ? "complete" : ""}`} key={label} onClick={() => index < step && setStep(index)} disabled={index > step}><span className="wizard-step-dot">{index < step ? <Check size={13} /> : `0${index + 1}`}</span><span>{label}</span></button>)}</div>
    <div className="wizard-layout"><div className="wizard-form panel">
      <div className="wizard-panel-heading"><span className="panel-kicker">STEP 0{step + 1} OF 06</span><h2>{["Start with the basics", "Tell us about you", "Set the scene", "Make room for your people", "A few personal touches", "Take a look"][step]}</h2><p>{["A name and a few words to set the tone.", "A little context makes your invitation feel like you.", "Give your guests everything they need to be there.", "You decide how many extra seats each guest can bring.", "Make the invitation feel like your kind of celebration.", "Everything together, just as your guests will see it."][step]}</p></div>
      {step === 0 && <div className="form-grid"><div className="field field-span"><label htmlFor="title">Event title <span className="required-star">*</span></label><input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. The Next Chapter" maxLength={70} /></div><div className="field"><label htmlFor="category">What are you celebrating? <span className="required-star">*</span></label><select id="category" value={form.category} onChange={(e) => set("category", e.target.value)}><option value="">Choose a celebration</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></div><div className="field field-span"><label htmlFor="description">A little about the day</label><textarea id="description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Tell your guests what this day means to you…" maxLength={300} /><span className="field-foot">{form.description.length}/300</span></div></div>}
      {step === 1 && <div className="form-grid"><div className="field field-span"><label htmlFor="graduateName">Your name <span className="required-star">*</span></label><input id="graduateName" value={form.graduateName} onChange={(e) => set("graduateName", e.target.value)} /></div><div className="field field-span"><label htmlFor="institution">Institution <span className="required-star">*</span></label><input id="institution" value={form.institution} onChange={(e) => set("institution", e.target.value)} placeholder="University or college" /></div><div className="field"><label htmlFor="faculty">Faculty</label><input id="faculty" value={form.faculty} onChange={(e) => set("faculty", e.target.value)} placeholder="Faculty of…" /></div><div className="field"><label htmlFor="department">Department</label><input id="department" value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="Your department" /></div><div className="field field-span"><label htmlFor="qualification">Qualification <span className="optional-label">OPTIONAL</span></label><input id="qualification" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} placeholder="e.g. B.A. English" /></div></div>}
      {step === 2 && <div className="form-grid"><div className="field"><label htmlFor="startAt">Date & start time <span className="required-star">*</span></label><input id="startAt" type="datetime-local" value={form.startAt} onChange={(e) => set("startAt", e.target.value)} /></div><div className="field"><label htmlFor="endAt">End time <span className="optional-label">OPTIONAL</span></label><input id="endAt" type="datetime-local" value={form.endAt} onChange={(e) => set("endAt", e.target.value)} /></div><div className="field field-span"><label htmlFor="timezone">Time zone <span className="required-star">*</span></label><select id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>{Array.from(new Set([form.timezone, "Africa/Lagos", "UTC", "Europe/London", "America/New_York"])).map((zone) => <option key={zone}>{zone}</option>)}</select><span className="field-foot">Times on your invitation use this time zone.</span></div><div className="field field-span"><label htmlFor="venue">Venue name <span className="required-star">*</span></label><input id="venue" value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Where the magic happens" /></div><div className="field field-span"><label htmlFor="address">Full address <span className="required-star">*</span></label><input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, area, city" /></div><div className="field field-span"><label htmlFor="instructions">A note for getting there <span className="optional-label">OPTIONAL</span></label><textarea id="instructions" rows={2} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Parking, entrance, what to look for…" /></div></div>}
      {step === 3 && <div className="form-grid"><div className="field field-span"><label htmlFor="rsvpDeadline">Please reply by <span className="required-star">*</span></label><input id="rsvpDeadline" type="date" value={form.rsvpDeadline} onChange={(e) => set("rsvpDeadline", e.target.value)} /></div><div className="field field-span"><label htmlFor="additionalLimit">Additional guests per invitation</label><div className="limit-select"><button type="button" onClick={() => set("additionalLimit", Math.max(0, form.additionalLimit - 1))} aria-label="Remove one additional guest">−</button><span><b>{form.additionalLimit}</b><small>extra {form.additionalLimit === 1 ? "guest" : "guests"} allowed</small></span><button type="button" onClick={() => set("additionalLimit", Math.min(3, form.additionalLimit + 1))} aria-label="Add one additional guest">+</button></div><span className="field-foot">Your guests can bring themselves plus up to {form.additionalLimit} additional people.</span></div><div className="approval-note"><ShieldCheck size={17} /><span><b>You'll review every RSVP.</b><small>Guests get their tickets after you approve their group.</small></span></div></div>}
      {step === 4 && <div className="form-grid"><div className="field field-span"><label htmlFor="personalMessage">A personal note for your guests</label><textarea id="personalMessage" rows={4} value={form.personalMessage} onChange={(e) => set("personalMessage", e.target.value)} placeholder="I couldn't have made it here without the people I love…" /><span className="field-foot">A few words from you make it feel extra special.</span></div><div className="field field-span"><label>Cover image <span className="optional-label">OPTIONAL</span></label>{form.coverImage ? <div className="upload-preview" style={{ backgroundImage: `url(${form.coverImage})` }}><button type="button" onClick={() => setForm((current) => ({ ...current, coverImage: "" }))} aria-label="Remove cover image"><X size={15} /></button></div> : <label className="upload-zone"><ImagePlus size={22} /><b>{imageProgress === null ? "Choose a cover image" : "Preparing your image…"}</b><span>{imageProgress === null ? "JPG or PNG · up to 1.5 MB" : `${imageProgress}% ready`}</span><input type="file" accept="image/*" disabled={imageProgress !== null} onChange={(e) => handleImage(e.target.files?.[0])} /></label>}</div><div className="field field-span"><PhotoGalleryEditor photos={form.galleryImages || []} onChange={(galleryImages) => setForm((current) => ({ ...current, galleryImages }))} /><span className="field-foot">Only photos you mark as published appear on your public invitation.</span></div><div className="field field-span"><label>Invitation accent</label><div className="accent-picker">{["#b18a55", "#71826b", "#9d7580", "#64748b", "#292d28"].map((color) => <button type="button" key={color} style={{ background: color }} className={form.accent === color ? "accent-selected" : ""} onClick={() => set("accent", color)} aria-label={`Choose accent ${color}`} />)}<span>Keep it warm, or choose a shade that feels like you.</span></div></div></div>}
      {step === 5 && <InvitationMiniPreview event={form} />}
      {error && <div className="inline-error wizard-error"><XCircle size={16} />{error}</div>}
      <div className="wizard-footer"><button className="button button-outline" onClick={() => step === 0 ? navigate("/dashboard/events") : setStep((current) => current - 1)}>{step === 0 ? <ArrowLeft size={15} /> : <ChevronLeft size={16} />}{step === 0 ? "Cancel" : "Back"}</button><div><button className="button button-quiet" onClick={() => persist(false)}>Save as draft</button>{step < wizardLabels.length - 1 ? <button className="button button-dark" onClick={goNext}>Continue <ArrowRight size={15} /></button> : <button className="button button-dark" onClick={() => persist(true)}><Sparkles size={15} /> Publish event</button>}</div></div>
    </div><aside className="wizard-aside"><div className="wizard-aside-art"><span>✳</span><div className="aside-mini-card"><small>YOU'RE INVITED</small><b>{form.title || "Your celebration"}</b><i>{form.graduateName}</i><span className="aside-mini-line" /><small>{form.startAt ? formatDate(form.startAt, { day: "numeric", month: "long", year: "numeric" }).toUpperCase() : "YOUR SPECIAL DAY"} · LAGOS</small></div></div><div className="wizard-tip"><Sparkles size={16} /><span><b>A little note</b><small>You can edit everything later. Your invitation isn't shared until you publish it.</small></span></div><div className="wizard-help"><CircleHelp size={16} /><span>Need inspiration?</span><a href="#preview" onClick={(event) => { event.preventDefault(); setStep(5); }}>See your invitation preview</a></div></aside></div>
  </div>;
}

function InvitationMiniPreview({ event }: { event: EventRecord }) {
  return <div className="mini-invitation" style={{ borderColor: `${event.accent}55` }}><div className="mini-invitation-art" style={{ backgroundColor: event.accent }}><span>✳</span><div className="mini-monogram">{event.graduateName?.charAt(0) || "G"}</div><small>WITH JOY IN OUR HEARTS</small></div><div className="mini-invitation-copy"><span className="event-category">{event.category || "A CELEBRATION"}</span><h2>{event.title || "Your celebration"}</h2><p>Join {event.graduateName || "your graduate"} as they celebrate their next chapter.</p><span><CalendarDays size={14} /> {formatDate(event.startAt)}</span><span><MapPin size={14} /> {event.venue || "Venue to be confirmed"}</span><button className="button button-dark button-sm">RSVP now</button></div></div>;
}

function PublicEventPage() {
  const { slug = "" } = useParams();
  const { getEvent, getPublishedGallery } = usePlatform();
  const event = getEvent(slug);
  if (!event || event.status !== "Published") return <UnavailablePage />;
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
  return <section className="countdown-wrap"><div><span className="panel-kicker">{upcoming ? "THE COUNTDOWN IS ON" : "THE DAY HAS ARRIVED"}</span><h2>{upcoming ? "Until we celebrate together…" : "What a day to remember."}</h2></div>{upcoming ? <div className="countdown">{[[days, "DAYS"], [hours, "HOURS"], [minutes, "MINUTES"], [seconds, "SECONDS"]].map(([value, label]) => <div key={String(label)}><b>{String(value).padStart(2, "0")}</b><small>{label}</small></div>)}</div> : <span className="completed-pill"><CheckCircle2 size={16} /> Celebration day</span>}</section>;
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
  const previous = () => onSelect((active - 1 + images.length) % images.length);
  const next = () => onSelect((active + 1) % images.length);
  return <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}><button className="lightbox-close" onClick={onClose} aria-label="Close photo viewer"><X size={20} /></button><button className="lightbox-nav lightbox-prev" onClick={(event) => { event.stopPropagation(); previous(); }} aria-label="Previous photo"><ChevronLeft size={22} /></button><img src={images[active]} alt={`Photo ${active + 1} of ${images.length}`} onClick={(event) => event.stopPropagation()} /><div className="lightbox-controls" onClick={(event) => event.stopPropagation()}><span>{String(active + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span><a href={images[active]} download={`gather-memory-${active + 1}.jpg`} className="button button-light button-sm"><Download size={14} /> Download photo</a></div><button className="lightbox-nav lightbox-next" onClick={(event) => { event.stopPropagation(); next(); }} aria-label="Next photo"><ChevronRight size={22} /></button></div>;
}

function RsvpPage() {
  const { slug = "" } = useParams();
  const { getEvent, getGuests, addGuest, notify } = usePlatform();
  const event = getEvent(slug);
  const navigate = useNavigate();
  const [attending, setAttending] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!event || event.status !== "Published") return <UnavailablePage />;
  const closed = event.rsvpDeadline && new Date(`${event.rsvpDeadline}T23:59:59`) < new Date();
  if (closed) return <div className="rsvp-closed-page"><Brand /><div className="simple-auth-card"><div className="auth-icon"><Clock3 size={20} /></div><span className="eyebrow"><span className="eyebrow-line" /> RSVP WINDOW CLOSED</span><h1>We wish you<br /><em>could join us.</em></h1><p>RSVPs for {event.title} closed on {formatDate(event.rsvpDeadline)}. Please reach out to {event.graduateName} if you have any questions.</p><Link className="back-link" to={`/event/${slug}`}><ArrowLeft size={15} /> Back to invitation</Link></div></div>;
  const handleCount = (value: number) => {
    const safe = Math.min(event.additionalLimit, Math.max(0, value));
    setCount(safe);
    setNames((current) => Array.from({ length: safe }, (_, index) => current[index] || ""));
  };
  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (attending === null) { setError("Let us know if you'll be there."); return; }
    const data = new FormData(formEvent.currentTarget);
    const extras = attending ? names.map((name) => name.trim()) : [];
    if (extras.some((name) => !name)) { setError("Add a name for each of your guests."); return; }
    const email = String(data.get("email")).trim().toLowerCase();
    const phone = String(data.get("phone")).replace(/\D/g, "");
    const duplicate = getGuests(event.id).some((guest) =>
      guest.email.trim().toLowerCase() === email || guest.phone.replace(/\D/g, "") === phone);
    if (duplicate) {
      setError("It looks like you may already have responded. Please contact the event host to update your RSVP.");
      return;
    }
    setError("");
    setBusy(true);
    window.setTimeout(() => {
      const guest = addGuest({ eventId: event.id, name: String(data.get("name")).trim(), email: String(data.get("email")).trim(), phone: String(data.get("phone")).trim(), relationship: String(data.get("relationship")), attending, additionalGuests: extras, status: "Pending" });
      notify("Your RSVP has been received.");
      navigate(`/event/${slug}/confirmation`, { state: { guestId: guest.id } });
      setBusy(false);
    }, 450);
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
  const { getEvent, guests } = usePlatform();
  const location = useLocation();
  const event = getEvent(slug);
  const guestId = (location.state as { guestId?: string } | null)?.guestId;
  const guest = guests.find((item) => item.id === guestId);
  return <div className="confirmation-page"><Brand /><div className="confirmation-card"><div className="confirmation-spark">✳</div><div className="eyebrow"><span className="eyebrow-line" /> IT'S ON ITS WAY</div><h1>{guest?.attending ? "Your seat is" : "We'll miss you,"}<br /><em>{guest?.attending ? "almost yours." : "but we understand."}</em></h1><p>{guest ? (guest.attending ? `${guest.name}, your RSVP for ${event?.title} is with ${event?.graduateName} for approval.` : `${event?.graduateName} will be sorry to miss you at ${event?.title}.`) : "Your RSVP was submitted. Check your email for next steps."}</p>{guest?.attending && <div className="confirmation-next"><span className="step-icon"><Clock3 size={18} /></span><span><b>Waiting for approval</b><small>We'll send your individual ticket by email once you're approved.</small></span><StatusBadge status={guest.status} /></div>}<Link className="button button-dark" to={`/event/${slug}`}>Back to the invitation <ArrowRight size={16} /></Link><span className="confirmation-signoff">With love, {event?.graduateName || "your graduate"}</span></div></div>;
}

function EventOverviewPage() {
  const { eventId = "" } = useParams();
  const { getEvent, getGuests, notify } = usePlatform();
  const navigate = useNavigate();
  const event = getEvent(eventId);
  if (!event) return <NotFoundPage />;
  const guests = getGuests(event.id);
  const approvedPeople = guests.filter((guest) => guest.status === "Approved" && guest.attending).reduce((sum, guest) => sum + attendeeCount(guest), 0);
  const checked = guests.reduce((sum, guest) => sum + guest.checkedIn.length, 0);
  const pending = guests.filter((guest) => guest.status === "Pending").length;
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
    <div className={`event-overview-hero${event.coverImage ? " has-cover" : ""}`}>{event.coverImage ? <img className="event-overview-cover" src={event.coverImage} alt="" aria-hidden="true" /> : <><div className="event-overview-pattern">✳</div><div className="event-hero-monogram">{event.graduateName.charAt(0)}</div></>}<div className="event-overview-hero-copy"><div className="event-overview-top"><span className="panel-kicker">YOUR CELEBRATION</span><StatusBadge status={event.status} /></div><h1>{event.title}</h1><p>{event.description || "All the details for your special day."}</p><div className="event-hero-meta"><span><CalendarDays size={15} />{formatDate(event.startAt)}</span><span><MapPin size={15} />{event.venue}</span></div><div className="event-overview-actions"><Link to={`/event/${event.slug}`} target="_blank" rel="noopener noreferrer" className="button button-outline button-sm">Preview invitation <ExternalLink size={14} /></Link><button className="button button-dark button-sm" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/event/${event.slug}`).then(() => notify("Invitation link copied."), () => notify("Couldn't copy the link. You can share the invitation directly.", "error")); }}><Copy size={14} /> Copy invitation link</button><button className="button button-outline button-sm" onClick={shareInvitation}><Share2 size={14} /> Share</button></div></div></div>
    <div className="event-mini-stats">{[{ value: String(guests.length).padStart(2, "0"), label: "RSVP submissions", icon: Users }, { value: String(pending).padStart(2, "0"), label: "Pending your review", icon: Clock3 }, { value: String(approvedPeople).padStart(2, "0"), label: "Expected guests", icon: CheckCircle2 }, { value: String(checked).padStart(2, "0"), label: "Checked in", icon: QrCode }].map(({ value, label, icon: Icon }) => <div className="mini-stat" key={label}><Icon size={17} /><span><b>{value}</b><small>{label}</small></span></div>)}</div>
    <div className="dashboard-columns"><section className="panel"><div className="panel-heading"><div><span className="panel-kicker">A LITTLE TO DO</span><h2>Guest approvals</h2></div><button className="subtle-link" onClick={() => navigate(`/dashboard/events/${event.id}/guests`)}>View all <ArrowRight size={14} /></button></div>{guests.filter((guest) => guest.status === "Pending").length ? <div className="compact-guest-list">{guests.filter((guest) => guest.status === "Pending").slice(0, 4).map((guest) => <div className="compact-guest" key={guest.id}><span className="guest-avatar">{guest.name.split(" ").map((p) => p[0]).join("")}</span><span><b>{guest.name}</b><small>{guest.attending ? `${attendeeCount(guest)} people` : "Not attending"} · ${formatDate(guest.submittedAt, { day: "numeric", month: "short" })}</small></span><StatusBadge status={guest.status} /><Link to={`/dashboard/events/${event.id}/guests/${guest.id}`} className="icon-button" aria-label={`Review ${guest.name}`}><ArrowRight size={15} /></Link></div>)}</div> : <EmptyState icon={<CheckCircle2 size={22} />} title="You're all caught up." text="New RSVP requests will show up here." />}</section><section className="panel event-quick-panel"><div className="panel-heading"><div><span className="panel-kicker">QUICK LINKS</span><h2>On the day</h2></div></div><Link to={`/dashboard/events/${event.id}/check-in`} className="quick-action"><span className="quick-action-icon peach"><QrCode size={18} /></span><span><b>Open check-in</b><small>Scan a guest ticket</small></span><ArrowRight size={15} /></Link><Link to={`/dashboard/events/${event.id}/tickets`} className="quick-action"><span className="quick-action-icon lavender"><Ticket size={18} /></span><span><b>Manage tickets</b><small>View guest passes</small></span><ArrowRight size={15} /></Link><button className="quick-action" onClick={() => navigate(`/dashboard/events/${event.id}/edit`)}><span className="quick-action-icon sage"><Settings size={18} /></span><span><b>Edit event details</b><small>Make a change</small></span><ArrowRight size={15} /></button></section></div>
  </div>;
}

function GuestManagementPage() {
  const { eventId = "" } = useParams();
  const { getEvent, getGuests, updateGuestStatus, notify } = usePlatform();
  const event = getEvent(eventId);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "cards">(() => window.matchMedia("(max-width: 680px)").matches ? "cards" : "table");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const updateView = () => setView(media.matches ? "cards" : "table");
    media.addEventListener("change", updateView);
    return () => media.removeEventListener("change", updateView);
  }, []);
  if (!event) return <NotFoundPage />;
  const guests = getGuests(event.id);
  const filters = ["All", "Pending", "Approved", "Declined", "Not attending"];
  const results = guests.filter((guest) => {
    const matchesFilter = filter === "All" || (filter === "Not attending" ? !guest.attending : guest.status === filter);
    const search = `${guest.name} ${guest.email} ${guest.phone}`.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && search;
  });
  const act = (guest: GuestRecord, status: GuestStatus) => {
    updateGuestStatus(guest.id, status);
    notify(`${guest.name}'s group was ${status.toLowerCase()}.`);
  };
  return <div className="page-stack">
    <PageTitle eyebrow={event.title.toUpperCase()} title="Your guest list" description="A little hello from everyone who wants to celebrate with you." action={<button className="button button-outline" onClick={() => notify("Guest export will be available when connected to your API.")}><Download size={15} /> Export list</button>} />
    <div className="guest-summary-grid">{[{ value: guests.length, label: "RSVPs received", color: "lavender" }, { value: guests.filter((guest) => guest.status === "Pending").length, label: "Need your approval", color: "peach" }, { value: guests.filter((guest) => guest.status === "Approved").reduce((n, guest) => n + attendeeCount(guest), 0), label: "Guests approved", color: "sage" }, { value: guests.reduce((n, guest) => n + guest.checkedIn.length, 0), label: "Checked in", color: "sky" }].map((stat) => <div className="guest-summary" key={stat.label}><span className={`summary-dot ${stat.color}`} /><b>{String(stat.value).padStart(2, "0")}</b><small>{stat.label}</small></div>)}</div>
    <section className="panel guest-list-panel"><div className="guest-toolbar"><div className="guest-filter-tabs">{filters.map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}<span>{item === "All" ? guests.length : item === "Not attending" ? guests.filter((guest) => !guest.attending).length : guests.filter((guest) => guest.status === item).length}</span></button>)}</div><div className="guest-search-row"><div className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guests…" /></div><div className="view-switch"><button aria-label="Table view" className={view === "table" ? "selected" : ""} onClick={() => setView("table")}><ListFilter size={16} /></button><button aria-label="Card view" className={view === "cards" ? "selected" : ""} onClick={() => setView("cards")}><LayoutDashboard size={16} /></button></div></div></div>
      {results.length ? view === "table" ? <div className="table-scroll"><table className="guest-table"><thead><tr><th>GUEST</th><th>PHONE</th><th>GROUP</th><th>SUBMITTED</th><th>STATUS</th><th aria-label="Actions" /></tr></thead><tbody>{results.map((guest) => <tr key={guest.id}><td><Link to={`/dashboard/events/${event.id}/guests/${guest.id}`} className="guest-name-cell"><span className="guest-avatar">{guest.name.split(" ").map((p) => p[0]).join("")}</span><span><b>{guest.name}</b><small>{guest.email}</small></span></Link></td><td>{guest.phone}</td><td>{guest.attending ? `${attendeeCount(guest)} ${attendeeCount(guest) === 1 ? "person" : "people"}` : "Not attending"}</td><td>{formatDate(guest.submittedAt, { day: "numeric", month: "short" })}</td><td><StatusBadge status={guest.status} /></td><td><div className="table-actions">{guest.status === "Pending" && guest.attending && <button className="mini-action approve-action" onClick={() => act(guest, "Approved")} aria-label={`Approve ${guest.name}`}><Check size={14} /></button>}{guest.status === "Pending" && <button className="mini-action decline-action" onClick={() => { if (window.confirm(`Decline ${guest.name}'s RSVP?`)) act(guest, "Declined"); }} aria-label={`Decline ${guest.name}`}><X size={14} /></button>}<Link className="mini-action" to={`/dashboard/events/${event.id}/guests/${guest.id}`} aria-label={`View ${guest.name}`}><ArrowRight size={14} /></Link></div></td></tr>)}</tbody></table></div> : <div className="guest-card-grid">{results.map((guest) => <GuestCard key={guest.id} guest={guest} eventId={event.id} onApprove={() => act(guest, "Approved")} onDecline={() => { if (window.confirm(`Decline ${guest.name}'s RSVP?`)) act(guest, "Declined"); }} />)}</div> : <EmptyState icon={<Search size={22} />} title={guests.length ? "No guests match that." : "Your guest list is waiting."} text={guests.length ? "Try another name or filter." : "When your guests RSVP, you'll find them right here."} />}
    </section>
  </div>;
}

function GuestCard({ guest, eventId, onApprove, onDecline }: { guest: GuestRecord; eventId: string; onApprove: () => void; onDecline: () => void }) {
  return <article className="guest-card"><div className="guest-card-top"><span className="guest-avatar guest-avatar-large">{guest.name.split(" ").map((p) => p[0]).join("")}</span><StatusBadge status={guest.status} /></div><h3>{guest.name}</h3><p>{guest.email}</p><div className="guest-card-detail"><span>{guest.phone}</span><span>{attendeeCount(guest)} {attendeeCount(guest) === 1 ? "guest" : "guests"}</span></div><div className="guest-card-actions">{guest.status === "Pending" && guest.attending && <button className="button button-dark button-sm" onClick={onApprove}>Approve</button>}{guest.status === "Pending" && <button className="button button-outline button-sm" onClick={onDecline}>Decline</button>}<Link className="button button-outline button-sm" to={`/dashboard/events/${eventId}/guests/${guest.id}`}>Details</Link></div></article>;
}

function GuestDetailsPage() {
  const { eventId = "", guestId = "" } = useParams();
  const { getEvent, getGuests, updateGuestStatus, notify } = usePlatform();
  const navigate = useNavigate();
  const event = getEvent(eventId);
  const guest = getGuests(eventId).find((item) => item.id === guestId);
  if (!event || !guest) return <NotFoundPage />;
  const approve = () => { updateGuestStatus(guest.id, "Approved"); notify("Guest group approved. Individual tickets are ready."); };
  const decline = () => { if (window.confirm(`Decline ${guest.name}'s RSVP?`)) { updateGuestStatus(guest.id, "Declined"); notify("Guest group declined."); } };
  const people = guest.attending ? [guest.name, ...guest.additionalGuests] : [];
  return <div className="page-stack"><Link className="back-link" to={`/dashboard/events/${event.id}/guests`}><ArrowLeft size={15} /> Back to all guests</Link><div className="guest-detail-header"><div><span className="guest-avatar guest-avatar-xl">{guest.name.split(" ").map((p) => p[0]).join("")}</span></div><div><div className="eyebrow"><span className="eyebrow-line" /> RSVP DETAILS</div><h1>{guest.name}</h1><p>Submitted {formatDate(guest.submittedAt)} · {event.title}</p></div><StatusBadge status={guest.status} /></div><div className="guest-detail-grid"><section className="panel detail-panel"><div className="panel-heading"><div><span className="panel-kicker">A LITTLE ABOUT THEM</span><h2>Guest details</h2></div></div><DetailRow label="Email address" value={guest.email} /><DetailRow label="Phone number" value={guest.phone} /><DetailRow label="Relationship" value={guest.relationship} /><DetailRow label="Attending" value={guest.attending ? "Yes, looking forward to it" : "Sorry to miss it"} /><DetailRow label="Group size" value={`${attendeeCount(guest)} ${attendeeCount(guest) === 1 ? "person" : "people"}`} /><div className="detail-people"><span className="field-label">ATTENDEES IN THIS GROUP</span>{people.length ? people.map((name, index) => <div className="detail-person" key={name}><span className="guest-avatar">{name.split(" ").map((p) => p[0]).join("")}</span><span><b>{name}</b><small>{index === 0 ? "Primary guest" : "Additional guest"}</small></span>{guest.checkedIn.includes(name) && <StatusBadge status="Checked in" />}</div>) : <p className="muted-copy">No attendees in this group.</p>}</div></section><aside className="panel detail-actions-panel"><span className="panel-kicker">WHAT'S NEXT</span><h2>{guest.status === "Pending" ? "Review this RSVP" : guest.status === "Approved" ? "Your guest is all set." : "This RSVP was declined."}</h2><p>{guest.status === "Pending" ? "Approving confirms the whole group. Individual tickets will be created for each attendee." : guest.status === "Approved" ? "Every attendee has their own ticket to make check-in easy." : "No valid tickets are issued for a declined group."}</p>{guest.status === "Pending" && <><button className="button button-dark button-full" onClick={approve}><Check size={15} /> Approve this group</button><button className="button button-outline button-full" onClick={decline}><X size={15} /> Decline RSVP</button></>}{guest.status === "Approved" && <button className="button button-dark button-full" onClick={() => navigate(`/dashboard/events/${event.id}/tickets`)}><Ticket size={15} /> View their tickets</button>}</aside></div></div>;
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
  const { notify } = usePlatform();
  return <div className="page-stack"><PageTitle eyebrow="THE PERSON BEHIND THE PARTY" title="Your profile" description="A few details about you and your account." /><div className="settings-layout"><section className="panel settings-panel"><div className="panel-heading"><div><span className="panel-kicker">YOUR DETAILS</span><h2>Profile information</h2></div></div><div className="profile-edit-avatar"><span className="profile-avatar profile-avatar-xl">AO</span><button className="button button-outline button-sm" onClick={() => notify("Profile photo uploads are available when connected to the API.")}>Change photo</button></div><div className="form-grid"><Field label="Full name" name="profile-name" defaultValue="Amara Okafor" /><Field label="Email address" name="profile-email" defaultValue="amara@example.com" type="email" /><div className="field field-span"><label htmlFor="profile-bio">A little about you</label><textarea id="profile-bio" rows={3} placeholder="Tell us something about yourself…" /></div></div><div className="settings-footer"><button className="button button-dark" onClick={() => notify("Profile updates require a connected account service.", "error")}>Save changes <Check size={15} /></button></div></section><aside className="panel profile-help"><span className="auth-icon"><UserRound size={19} /></span><h3>Your profile, your story.</h3><p>Your profile helps personalise the invitations you create. Update your name and details any time.</p><div className="demo-auth-note"><ShieldCheck size={15} /><span>Account changes are stored in this browser.</span></div></aside></div></div>;
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
