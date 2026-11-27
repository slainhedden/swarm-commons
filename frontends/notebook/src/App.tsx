import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  GitBranch,
  Github,
  Heart,
  Menu,
  MessageCircle,
  Play,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";
import {
  agents as demoAgents,
  demoGoals,
  notes as demoNotes,
  readStored,
  store,
  updateStored,
  type Goal,
  type Note,
} from "./data";
import {
  API_BASE,
  ApiError,
  getAccountVotes,
  getSession,
  request,
  saveAccountVotes,
  saveSession,
  timeAgo,
  useCommunity,
  type Session,
} from "./api";
import { contributionPrompt } from "./safety";

type Tab = "The commons" | "Goal board" | "Field notes";
type Modal =
  | "join"
  | "login"
  | "agents"
  | "how"
  | "propose"
  | "new-thread"
  | null;
const REPO = "https://github.com/slainhedden/swarm-commons";
const tabs: Tab[] = ["The commons", "Goal board", "Field notes"];

function Bee({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 125 100"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M48 47C14 5 71-2 65 43C66 2 105 14 84 48"
          fill="var(--paper)"
        />
        <path
          d="M31 54C44 31 91 40 99 60C110 86 59 96 38 77C31 71 29 61 31 54Z"
          fill="var(--yellow)"
        />
        <path d="M56 44C48 56 47 72 51 84M75 44C66 59 67 74 70 86M98 64L106 67M31 64L22 66" />
        <circle cx="86" cy="58" r="2" fill="currentColor" />
        <path
          d="M25 78C1 88 5 57 17 65C26 72 1 77 5 91"
          strokeDasharray="3 5"
        />
      </g>
    </svg>
  );
}
function Star({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 50 50"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m25 3 4 16 16-4-11 12 10 13-17-5-8 13-1-18L3 25l16-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Avatar({
  initials,
  color = "green",
  small = false,
}: {
  initials: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <span className={`avatar ${color} ${small ? "small" : ""}`}>
      {initials}
    </span>
  );
}
function People() {
  return (
    <div className="people">
      <Avatar initials="MK" color="pink" small />
      <Avatar initials="TR" color="purple" small />
      <Avatar initials="JL" small />
      <span className="people-more">+125</span>
    </div>
  );
}
function MapDoodle() {
  return (
    <div className="map-doodle" aria-hidden="true">
      <svg viewBox="0 0 270 216" fill="none">
        <path
          d="m29 54 69-23 72 19 68-23-1 143-67 22-73-19-69 25Z"
          fill="var(--paper)"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="m98 32-1 141m73-122v141"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="4 4"
        />
        <path
          d="m32 105 41-12 29 29 53-28 28 23 52-25M55 44l13 44 26 10m23 80 16-41 32 5 40 36"
          stroke="var(--map-road)"
          strokeWidth="8"
        />
        <path
          d="m32 105 41-12 29 29 53-28 28 23 52-25M55 44l13 44 26 10m23 80 16-41 32 5 40 36"
          stroke="var(--ink)"
          strokeWidth="1.2"
        />
        <path
          d="M29 156c49-42 65 5 98-32s67-39 110-45"
          stroke="var(--map-water)"
          strokeWidth="10"
        />
        <g stroke="var(--ink)" strokeWidth="2">
          <path
            d="M81 62c-17 0-20 20 0 37 20-17 18-37 0-37Z"
            fill="var(--orange)"
          />
          <circle cx="81" cy="76" r="5" fill="var(--paper)" />
          <path
            d="M181 114c-17 0-20 20 0 37 20-17 18-37 0-37Z"
            fill="var(--orange)"
          />
          <circle cx="181" cy="128" r="5" fill="var(--paper)" />
        </g>
        <path
          d="m133 62 3-8 4 8 8 3-8 4-4 8-3-8-8-4Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path d="M209 52h10m-5-5v10" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span>good food. closer.</span>
    </div>
  );
}
function Dialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      dialog?.close();
    };
  }, [title]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`dialog sketch-border ${wide ? "wide" : ""}`}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={23} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const initialTab =
    tabs.find(
      (tab) =>
        tab.toLowerCase().replaceAll(" ", "-") === location.hash.slice(1),
    ) || "The commons";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [session, setSession] = useState<Session | null>(getSession);
  const [toast, setToast] = useState("");
  const expireSession = useCallback(() => {
    saveSession(null);
    setSession(null);
    setToast("Your session ended. Please sign in again.");
  }, []);
  const {
    snapshot,
    live,
    error: connectionError,
    loading,
    loadMoreNotes,
    refresh,
    updateVote,
  } = useCommunity(session, expireSession);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [remoteVotes, setRemoteVotes] = useState<string[]>([]);
  const [remoteComments, setRemoteComments] = useState<
    { id: number; author: string; body: string }[]
  >([]);
  const [menu, setMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [thread, setThread] = useState<Note | null>(null);
  const [votes, setVotes] = useState<string[]>(() => readStored("votes", []));
  const [profile, setProfile] = useState<string>(() =>
    readStored("profile", ""),
  );
  const [proposals, setProposals] = useState<Goal[]>(() =>
    readStored("proposals", []),
  );
  const [comments, setComments] = useState<
    Record<string, { name: string; body: string }[]>
  >(() => readStored("comments", {}));
  const [filter, setFilter] = useState("All ideas");
  const [query, setQuery] = useState("");
  const [noteFilter, setNoteFilter] = useState("All notes");
  const [tool, setTool] = useState("claude");
  const [joinGoal, setJoinGoal] = useState("food-map");
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [pendingGoalTitle, setPendingGoalTitle] = useState("");
  const [comment, setComment] = useState("");
  const [localNotes, setLocalNotes] = useState<Note[]>(() =>
    readStored("notes", []),
  );
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const goals = live ? snapshot!.goals : [...demoGoals, ...proposals];
  const featured = snapshot?.featured || demoGoals[0];
  const featuredAvailable = !live || Boolean(snapshot?.featured);
  const notes = live ? snapshot!.notes : [...localNotes, ...demoNotes];
  const agents = live ? snapshot!.agents : demoAgents;
  const shownVotes = live && !session
    ? []
    : live
    ? goals
        .filter((goal) =>
          snapshot!.viewer === session?.handle &&
          typeof goal.viewerVoted === "boolean"
            ? goal.viewerVoted
            : remoteVotes.includes(goal.id),
        )
        .map((goal) => goal.id)
    : votes;
  const displayedProfile = live ? session?.handle || "" : profile;
  const goTab = (next: Tab) => {
    setTab(next);
    location.hash = next.toLowerCase().replaceAll(" ", "-");
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const syncDemo = (event: StorageEvent) => {
      if (event.key !== null && !["votes", "profile", "proposals", "comments", "notes"]
        .some((key) => event.key === `swarm-notebook:${key}`)) return;
      setVotes(readStored("votes", []));
      setProfile(readStored("profile", ""));
      setProposals(readStored("proposals", []));
      setComments(readStored("comments", {}));
      setLocalNotes(readStored("notes", []));
    };
    window.addEventListener("storage", syncDemo);
    return () => window.removeEventListener("storage", syncDemo);
  }, []);
  useEffect(() => {
    const handle = () =>
      setTab(
        tabs.find(
          (item) =>
            item.toLowerCase().replaceAll(" ", "-") === location.hash.slice(1),
        ) || "The commons",
      );
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setRequestError("");
  }, [modal, thread]);
  useEffect(() => {
    if (modal || thread || !dialogReturnFocusRef.current) return;
    const target = dialogReturnFocusRef.current;
    // Let every native dialog finish closing before restoring the chain's
    // original trigger. Intermediate dialogs may otherwise restore BODY.
    const frame = requestAnimationFrame(() => {
      if (target.isConnected && target.getClientRects().length) {
        target.focus({ preventScroll: true });
      }
      dialogReturnFocusRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [modal, thread]);
  useEffect(() => {
    setRemoteVotes(getAccountVotes(session?.handle));
    setPendingGoalTitle("");
  }, [session?.handle]);
  useEffect(() => {
    if (!thread || !live) return;
    let cancelled = false;
    setRemoteComments([]);
    void request<{ comments: { id: number; author: string; body: string }[] }>(
      `/threads/${thread.id}`,
    )
      .then((result) => {
        if (!cancelled) setRemoteComments(result.comments);
      })
      .catch((cause) => {
        if (!cancelled) setRequestError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [thread, live]);
  function requireSession() {
    if (session) return true;
    setToast("Sign in to add your voice to the public community.");
    setThread(null);
    setModal("login");
    return false;
  }
  async function vote(id: string) {
    if (live) {
      if (!requireSession() || busy) return;
      const removing = shownVotes.includes(id);
      setBusy(true);
      try {
        const result = await request<{ votes: number; viewer_voted?: boolean }>(
          `/goals/${id}/vote`,
          {
            method: removing ? "DELETE" : "POST",
            token: session!.token,
          },
        );
        const selected = result.viewer_voted ?? !removing;
        const next = !selected
          ? remoteVotes.filter((value) => value !== id)
          : [...new Set([...remoteVotes, id])];
        setRemoteVotes(next);
        saveAccountVotes(session!.handle, next);
        updateVote(id, result.votes, selected);
        await refresh();
        setToast(
          removing
            ? "Your vote has been removed."
            : "Your vote is in. Thanks for helping choose what’s next.",
        );
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) expireSession();
        setToast(
          cause instanceof Error ? cause.message : "Could not save your vote.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    setVotes(await updateStored("votes", votes, (current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]));
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    if (live) {
      setBusy(true);
      setRequestError("");
      try {
        const result = await request<Session>(`/auth/${authMode}`, {
          method: "POST",
          body: { username: name.trim(), password },
        });
        setSession(result);
        saveSession(result);
        setPassword("");
        setModal(null);
        setToast(`Welcome to the notebook, ${result.handle}!`);
      } catch (cause) {
        setRequestError(
          cause instanceof Error ? cause.message : "Could not sign in.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    setProfile(name.trim());
    store("profile", name.trim());
    setModal(null);
    setToast(`Welcome to the notebook, ${name.trim()}!`);
  }
  async function signOut() {
    if (live && session) {
      setBusy(true);
      try {
        await request("/auth/logout", { method: "POST", token: session.token });
        setSession(null);
        saveSession(null);
        setModal(null);
        setToast("Signed out. See you around the commons!");
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          setSession(null);
          saveSession(null);
          setModal(null);
          setToast("Your session has ended. You’re signed out.");
          return;
        }
        setRequestError(
          cause instanceof Error
            ? cause.message
            : "Could not sign out. Please try again.",
        );
      } finally {
        setBusy(false);
      }
    } else {
      setProfile("");
      store("profile", "");
      setModal(null);
      setToast("You’ve put down your name tag. See you soon!");
    }
  }
  async function propose(event: FormEvent) {
    event.preventDefault();
    if (!idea.trim() || !ideaDescription.trim() || busy) return;
    if (live) {
      if (!requireSession()) return;
      setBusy(true);
      setRequestError("");
      try {
        await request("/goals", {
          method: "POST",
          token: session!.token,
          body: {
            title: idea.trim(),
            description: ideaDescription.trim(),
            repo_url: REPO,
          },
        });
        await refresh();
        setPendingGoalTitle(idea.trim());
        setModal(null);
        setIdea("");
        setIdeaDescription("");
        setQuery("");
        setFilter("All ideas");
        goTab("Goal board");
        setToast("Your goal was sent for approval. Thanks for the idea!");
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) expireSession();
        setRequestError(
          cause instanceof Error
            ? cause.message
            : "Could not publish the goal.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    const next = await updateStored<Goal[]>("proposals", proposals, (current) => [
      ...current,
      {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: idea.trim(),
        description: ideaDescription.trim(),
        category: "Community",
        votes: 0,
        status: "Up next",
        progress: 0,
        agents: 0,
      },
    ]);
    setProposals(next);
    setModal(null);
    setIdea("");
    setIdeaDescription("");
    setQuery("");
    setFilter("All ideas");
    goTab("Goal board");
    setToast("Your idea is saved in this browser’s demo board.");
  }
  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!thread || !comment.trim() || busy) return;
    if (live) {
      if (!requireSession()) return;
      setBusy(true);
      setRequestError("");
      try {
        const result = await request<{
          id: number;
          author: string;
          body: string;
        }>(`/threads/${thread.id}/comments`, {
          method: "POST",
          token: session!.token,
          body: { body: comment.trim() },
        });
        setRemoteComments((current) => [...current, result]);
        setComment("");
        await refresh();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) expireSession();
        setRequestError(
          cause instanceof Error
            ? cause.message
            : "Could not publish your reply.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    const next = await updateStored("comments", comments, (current) => ({
      ...current,
      [thread.id]: [
        ...(current[thread.id] || []),
        { name: profile || "A friendly builder", body: comment.trim() },
      ],
    }));
    setComments(next);
    setComment("");
  }
  async function addThread(event: FormEvent) {
    event.preventDefault();
    if (!noteTitle.trim() || !noteBody.trim() || busy) return;
    if (live) {
      if (!requireSession()) return;
      setBusy(true);
      setRequestError("");
      try {
        await request("/threads", {
          method: "POST",
          token: session!.token,
          body: { title: noteTitle.trim(), body: noteBody.trim() },
        });
        await refresh();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) expireSession();
        setRequestError(
          cause instanceof Error
            ? cause.message
            : "Could not publish your note.",
        );
        return;
      } finally {
        setBusy(false);
      }
    } else {
      const next = await updateStored<Note[]>("notes", localNotes, (current) => [
        {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: profile || "A friendly builder",
          initials: (profile || "FB").slice(0, 2).toUpperCase(),
          color: "green",
          type: "Idea",
          title: noteTitle.trim(),
          body: noteBody.trim(),
          replies: 0,
          time: "Just now",
          category: "community",
        },
        ...current,
      ]);
      setLocalNotes(next);
    }
    setNoteTitle("");
    setNoteBody("");
    setNoteFilter("All notes");
    setModal(null);
    goTab("Field notes");
    setToast(
      live
        ? "Your note is now part of the public conversation."
        : "Your note is saved in this browser’s demo notebook.",
    );
  }
  const selectedGoal = goals.find((goal) => goal.id === joinGoal) || featured;
  const prompt = contributionPrompt(
    selectedGoal,
    tool === "claude" ? "Claude Code" : "Codex",
  );
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setToast("Contribution prompt copied. Paste it into your local agent.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setToast("Clipboard unavailable. Select and copy the prompt below.");
    }
  }
  const filteredGoals = goals
    .filter(
      (goal) =>
        (filter === "All ideas" ||
          goal.category === filter ||
          goal.status === filter) &&
        `${goal.title} ${goal.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.votes +
        Number(!live && votes.includes(b.id)) -
        (a.votes + Number(!live && votes.includes(a.id))),
    );
  return (
    <>
      <div className="notebook-holes" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="site-shell">
        <header className="header">
          <a
            className="brand"
            href="#the-commons"
            onClick={() => goTab("The commons")}
            aria-label="Swarm home"
          >
            <Bee />
            <span>
              swarm<span className="brand-period">.</span>
            </span>
          </a>
          <nav
            className={menu ? "navigation open" : "navigation"}
            aria-label="Main navigation"
          >
            {tabs.map((item) => (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                aria-current={tab === item ? "page" : undefined}
                onClick={() => goTab(item)}
              >
                {item}
              </button>
            ))}
            <button
              onClick={() => {
                // Keep a visible return target until the entire dialog chain
                // closes; this menu item is hidden when its menu closes.
                if (menu) dialogReturnFocusRef.current = mobileMenuRef.current;
                setModal("how");
                setMenu(false);
              }}
            >
              How it works <ArrowUpRight size={14} />
            </button>
          </nav>
          <div className="header-actions">
            <button className="sign-in" onClick={() => setModal("login")}>
              {displayedProfile ? (
                <>
                  <Avatar
                    small
                    initials={displayedProfile.slice(0, 2).toUpperCase()}
                  />
                  <span>{displayedProfile.split(" ")[0]}</span>
                </>
              ) : (
                "Sign in"
              )}
            </button>
            <button
              className="button dark header-join"
              onClick={() => setModal("join")}
            >
              Join the swarm <ArrowUpRight size={16} />
            </button>
            <button
              ref={mobileMenuRef}
              className="icon-button mobile-menu"
              aria-label="Toggle menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </header>

        <main>
          {API_BASE && (
            <div
              className={`connection-banner ${live ? "connected" : ""}`}
              role="status"
            >
              <span className="status-dot" />
              {loading
                ? "Opening the community notebook… Showing a preview while we connect."
                : connectionError
                  ? live
                    ? "Connection interrupted. Showing the last community update."
                    : "Community server is unavailable. You’re exploring the local demo."
                  : "Connected to the community · refreshes every 20 seconds"}
              {connectionError && (
                <button onClick={() => void refresh()}>
                  Try again <ArrowRight size={13} />
                </button>
              )}
            </div>
          )}
          {tab === "The commons" && (
            <>
              <section className="intro">
                <div>
                  <p className="eyebrow">
                    <span className="little-star">✳</span> A small
                    contribution. A collective difference.
                  </p>
                  <h1>
                    Good things,
                    <br />
                    <span className="scribble-underline">built together.</span>
                  </h1>
                  <p className="intro-copy">
                    A community of people and their coding agents,
                    <br className="desktop-break" /> making useful things for
                    everyone. Open source. Always.
                  </p>
                </div>
                <div className="intro-art" aria-hidden="true">
                  <div className="hand-note">
                    Your spare capacity.
                    <br />
                    Someone’s next big help.
                  </div>
                  <svg className="curvy-arrow" viewBox="0 0 120 60" fill="none">
                    <path
                      d="M8 8c90-14 111 25 28 33m0 0 14-13M36 41l20 9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <Bee />
                  <Star className="star-one" />
                  <Star className="star-two" />
                  <span className="art-plus">+</span>
                </div>
                <div className="edition">
                  <span /> The notebook edition{" "}
                  <span className="edition-number">No. 006</span>
                </div>
              </section>

              <div className="dashboard-grid">
                <div className="main-column">
                  {featuredAvailable ? (
                    <section className="featured sketch-border">
                      <span className="tape tape-left" aria-hidden="true" />
                      <div className="featured-top">
                        <span className="hand-label">
                          <span className="status-dot" /> On the workbench
                        </span>
                        <span className="issue-number">
                          GOAL / {live ? featured.id.padStart(3, "0") : "001"}
                        </span>
                      </div>
                      <div className="featured-body">
                        <div className="featured-copy">
                          <span className="category-label">COMMUNITY GOOD</span>
                          <h2>{featured.title}</h2>
                          <p>{featured.description}</p>
                        </div>
                        {live ? (
                          <Bee className="featured-bee" />
                        ) : (
                          <MapDoodle />
                        )}
                      </div>
                      <div className="progress-meta">
                        <span>Turning “what if” into “here it is”</span>
                        <strong>
                          {featured.progress}
                          <span>%</span>
                        </strong>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label="Current goal completion"
                        aria-valuenow={featured.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div style={{ width: `${featured.progress}%` }} />
                      </div>
                      <div className="project-stats">
                        <span>
                          <strong>{featured.agents}</strong>{" "}
                          {live ? "tasks claimed" : "agents helping"}
                        </span>
                        <span>
                          <strong>
                            {live ? featured.done : 32}
                            <span className="stat-fraction">
                              {" "}
                              / {live ? featured.total : 47}
                            </span>
                          </strong>{" "}
                          tasks {live ? "done" : "shipped"}
                        </span>
                        <span>
                          <strong>
                            {(
                              featured.votes +
                              Number(!live && votes.includes(featured.id))
                            ).toLocaleString()}
                          </strong>{" "}
                          believers
                        </span>
                      </div>
                      <div className="featured-bottom">
                        <button
                          className="button orange"
                          onClick={() => {
                            setJoinGoal(featured.id);
                            setModal("join");
                          }}
                        >
                          Lend a little compute <ArrowUpRight size={17} />
                        </button>
                        <button
                          className="text-button watch"
                          onClick={() => setModal("agents")}
                        >
                          <Play size={14} /> Watch the build
                        </button>
                        <a
                          className="repo-link"
                          href={featured.repoUrl || REPO}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="View current project repository"
                        >
                          <Github size={19} />
                          <span>Repo</span>
                          <ArrowUpRight size={13} />
                        </a>
                      </div>
                    </section>
                  ) : (
                    <section className="featured sketch-border empty-state">
                      <Bee className="empty-bee" />
                      <h2>A fresh page, waiting for you.</h2>
                      <p>No public goals yet. What should we build together?</p>
                      <button
                        className="button orange"
                        onClick={() => setModal("propose")}
                      >
                        Propose the first goal <Plus size={17} />
                      </button>
                    </section>
                  )}

                  <section className="next-section">
                    <div className="section-heading">
                      <div>
                        <h2>
                          What should we build next?
                          <span className="pencil-mark">↴</span>
                        </h2>
                        <p>Big problems, small first steps. You decide.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setQuery("");
                          setFilter("All ideas");
                          goTab("Goal board");
                        }}
                      >
                        All ideas <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="idea-list">
                      {goals
                        .filter((goal) => goal.id !== featured.id)
                        .slice(0, 3)
                        .map((goal, index) => (
                          <GoalRow
                            key={goal.id}
                            goal={goal}
                            index={index}
                            voted={shownVotes.includes(goal.id)}
                            onVote={() => void vote(goal.id)}
                            onOpen={() => {
                              setQuery(goal.title);
                              setFilter("All ideas");
                              goTab("Goal board");
                            }}
                          />
                        ))}
                    </div>
                    <button
                      className="new-idea"
                      onClick={() => setModal("propose")}
                    >
                      <Plus size={17} /> Have a little big idea?{" "}
                      <span>Put it in the notebook.</span>
                      <ArrowUpRight size={17} />
                    </button>
                  </section>
                </div>

                <aside className="sidebar">
                  <section className="sticky-note">
                    <span className="tape" aria-hidden="true" />
                    <div className="sticky-title">
                      A few hands make
                      <br />
                      <span>light work.</span>
                      <Star />
                    </div>
                    <p>
                      You don’t need to change the world on your own. Just bring
                      your agent, pick a task, and help a little.
                    </p>
                    <div className="sticky-people">
                      {live ? (
                        <span className="community-count">
                          {snapshot!.stats.contributors} builders & counting.
                        </span>
                      ) : (
                        <>
                          <People />
                          <span>Room for one more.</span>
                        </>
                      )}
                    </div>
                    <button onClick={() => setModal("how")}>
                      How this whole thing works <ArrowUpRight size={16} />
                    </button>
                  </section>
                  <section className="pulse">
                    <div className="aside-heading">
                      <h2>Little wins, lately</h2>
                      <span className="sample-label">
                        {live ? "COMMUNITY FEED" : "SAMPLE FEED"}
                      </span>
                    </div>
                    <div className="timeline">
                      {live ? (
                        snapshot!.activity.length ? (
                          snapshot!.activity.slice(0, 3).map((event) => (
                            <div key={event.id}>
                              <span className="timeline-icon green">
                                <GitBranch size={13} />
                              </span>
                              <p>
                                <b>{event.actor}</b>
                                <small>{event.summary}</small>
                                <time>{timeAgo(event.created_at)}</time>
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="form-help">
                            Quiet for now. The next little win could be yours.
                          </p>
                        )
                      ) : (
                        <>
                          <div>
                            <span className="timeline-icon green">
                              <Check size={13} />
                            </span>
                            <p>
                              <b>Location search</b> is in.
                              <small>One less barrier to a warm meal.</small>
                              <time>8 min ago</time>
                            </p>
                          </div>
                          <div>
                            <span className="timeline-icon orange">
                              <GitBranch size={13} />
                            </span>
                            <p>
                              <b>12 new pull requests</b>
                              <small>Good ideas are taking shape.</small>
                              <time>24 min ago</time>
                            </p>
                          </div>
                          <div>
                            <span className="timeline-icon purple">
                              <Heart size={12} />
                            </span>
                            <p>
                              <b>Welcome, 28 new builders!</b>
                              <small>More minds. More possibilities.</small>
                              <time>About an hour ago</time>
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setModal("agents")}
                    >
                      Peek into the workshop <ArrowUpRight size={15} />
                    </button>
                  </section>
                  <div className="margin-note">
                    <svg viewBox="0 0 65 50" aria-hidden="true">
                      <path
                        d="M60 3C30 4 58 42 8 33m0 0 12-10M8 33l12 9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                    <p>
                      Built in the open.
                      <br />
                      Better with you in it.
                    </p>
                    <span>♡</span>
                  </div>
                </aside>
              </div>

              <section className="community-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Notes from the commons{" "}
                      <span className="tiny-doodle">✷</span>
                    </h2>
                    <p>People behind the pull requests.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => goTab("Field notes")}
                  >
                    Pull up a chair <ArrowRight size={16} />
                  </button>
                </div>
                <div className="notes-grid">
                  {notes.slice(0, 3).map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      extraComments={live ? 0 : comments[note.id]?.length || 0}
                      onOpen={() => setThread(note)}
                    />
                  ))}
                </div>
                {notes.length === 0 && (
                  <p className="empty-notes">
                    No notes yet.{" "}
                    <button
                      className="text-button"
                      onClick={() => setModal("new-thread")}
                    >
                      Start a conversation <ArrowUpRight size={12} />
                    </button>
                  </p>
                )}
              </section>
            </>
          )}

          {tab === "Goal board" && (
            <section className="board-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">THE NEXT GOOD THING STARTS HERE</p>
                  <h1>
                    The idea{" "}
                    <span className="scribble-underline">notebook.</span>
                  </h1>
                  <p>
                    Vote for something useful. Or scribble down an idea of your
                    own.
                  </p>
                </div>
                <button
                  className="button orange"
                  onClick={() => setModal("propose")}
                >
                  <Plus size={18} /> Propose a goal
                </button>
              </div>
              {live && pendingGoalTitle && (
                <div className="info-note proposal-notice" role="status">
                  <p>
                    “{pendingGoalTitle}” was sent for approval. Approved goals
                    appear on this public board.
                  </p>
                </div>
              )}
              <div className="board-controls">
                <div className="filters" aria-label="Filter goals">
                  {[
                    "All ideas",
                    "Community",
                    "Accessibility",
                    "Climate",
                    live ? "Complete" : "Shipped",
                  ].map((value) => (
                    <button
                      className={filter === value ? "selected" : ""}
                      key={value}
                      onClick={() => setFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <label className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Search goals"
                    placeholder="Find a little big idea…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
              </div>
              <p className="board-caption">
                {filteredGoals.length}{" "}
                {filteredGoals.length === 1 ? "idea" : "ideas"}{" "}
                <span>
                  Sorted by community votes <ChevronDown size={13} />
                </span>
              </p>
              <div className="board-goals">
                {filteredGoals.map((goal, index) => (
                  <article key={goal.id} className="board-goal sketch-border">
                    <div className="board-goal-top">
                      <span
                        className={`status-tag ${["Shipped", "Complete"].includes(goal.status) ? "complete" : ""}`}
                      >
                        {goal.status === "Building" && (
                          <span className="status-dot" />
                        )}
                        {goal.status}
                      </span>
                      <span className="issue-number">
                        IDEA / {String(index + 1).padStart(3, "0")}
                      </span>
                    </div>
                    <div className="board-goal-body">
                      <Vote
                        goal={goal}
                        voted={shownVotes.includes(goal.id)}
                        onVote={() => void vote(goal.id)}
                      />
                      <div>
                        <span className="category-label">{goal.category}</span>
                        <h2>{goal.title}</h2>
                        <p>{goal.description}</p>
                        {goal.progress > 0 && (
                          <span className="goal-completion">
                            {["Shipped", "Complete"].includes(goal.status) ? (
                              <Check size={15} />
                            ) : (
                              <GitBranch size={15} />
                            )}{" "}
                            {goal.progress}% complete{" "}
                            {goal.agents > 0 &&
                              ` · ${goal.agents} ${live ? "tasks claimed" : "agents helping"}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="text-button goal-contribute"
                      onClick={() => {
                        setJoinGoal(goal.id);
                        setModal("join");
                      }}
                    >
                      Explore & contribute <ArrowUpRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
              {filteredGoals.length === 0 && (
                <div className="empty-state">
                  <Search size={30} />
                  <h2>No ideas on this page yet.</h2>
                  <p>Try another search or add the first one.</p>
                  <button
                    className="button"
                    onClick={() => {
                      setQuery("");
                      setFilter("All ideas");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>
          )}

          {tab === "Field notes" && (
            <section className="field-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">THE PEOPLE PART OF THE PROJECT</p>
                  <h1>
                    Field <span className="scribble-underline">notes.</span>
                  </h1>
                  <p>
                    Build logs, open questions, and ideas passed across the
                    table.
                  </p>
                </div>
                <button
                  className="button orange"
                  onClick={() => setModal("new-thread")}
                >
                  <Plus size={17} /> Leave a note
                </button>
              </div>
              <div className="filters field-filters">
                {(live
                  ? ["All notes", "Discussion"]
                  : ["All notes", "Build log", "Question", "Idea"]
                ).map((value) => (
                  <button
                    className={noteFilter === value ? "selected" : ""}
                    key={value}
                    onClick={() => setNoteFilter(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="notes-grid field-notes">
                {notes
                  .filter(
                    (note) =>
                      noteFilter === "All notes" || note.type === noteFilter,
                  )
                  .map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      extraComments={live ? 0 : comments[note.id]?.length || 0}
                      onOpen={() => setThread(note)}
                    />
                  ))}
              </div>
              {live && snapshot?.hasMoreNotes && (
                <button className="button outline" disabled={loading} onClick={loadMoreNotes}>
                  {loading ? "Loading older notes…" : "Load older notes"} <ArrowRight size={16} />
                </button>
              )}
              <div className="field-callout">
                <Bee />
                <div>
                  <h2>Good work starts with a conversation.</h2>
                  <p>Open a note to join in. Every question is welcome.</p>
                </div>
              </div>
            </section>
          )}
        </main>

        <footer>
          <div>
            <a
              className="footer-brand"
              href="#the-commons"
              onClick={() => goTab("The commons")}
            >
              swarm.
            </a>
            <span>Small efforts. Shared purpose.</span>
          </div>
          <p>
            Made of people, not magic. <Heart size={12} />
          </p>
          <div>
            <span className="demo-marker">
              {live
                ? "Connected to Swarm Commons"
                : "Interactive concept · sample data"}
            </span>
            <a href={REPO} target="_blank" rel="noreferrer">
              Open source <ArrowUpRight size={13} />
            </a>
          </div>
        </footer>
      </div>

      {modal === "login" && (
        <Dialog
          title={
            displayedProfile ? "Your little corner" : "Hello, fellow builder."
          }
          close={() => {
            setModal(null);
            setPassword("");
          }}
        >
          <p className="dialog-intro">
            {displayedProfile
              ? `${live ? "Signed in" : "Exploring"} as ${displayedProfile}.`
              : "Grab a name tag and make yourself at home."}
          </p>
          <div className="info-note">
            {live ? (
              "Use a Swarm Commons account. Never enter your Claude, Codex, or GitHub password here."
            ) : (
              <>
                <strong>This is a demo profile.</strong> It stays in this
                browser. No account is created and no password or coding
                credentials are collected.
              </>
            )}
          </div>
          {(!live || !session) && (
            <form onSubmit={signIn}>
              {live && (
                <div className="filters auth-tabs">
                  <button
                    type="button"
                    className={authMode === "login" ? "selected" : ""}
                    onClick={() => setAuthMode("login")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={authMode === "register" ? "selected" : ""}
                    onClick={() => setAuthMode("register")}
                  >
                    Create an account
                  </button>
                </div>
              )}
              <label className="form-label" htmlFor="name">
                {live ? "Your community handle" : "What should we call you?"}
              </label>
              <input
                id="name"
                className="form-input"
                maxLength={live ? 39 : 40}
                minLength={live ? 2 : 1}
                pattern={live ? "[-a-z0-9_]{2,39}" : undefined}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={live ? "your-handle" : profile || "Your name"}
                required
                autoComplete={live ? "username" : "given-name"}
              />
              {live && (
                <>
                  <p className="form-help auth-help">
                    2–39 lowercase letters, numbers, hyphens, or underscores.
                  </p>
                  <label className="form-label" htmlFor="password">
                    Your Swarm Commons password
                  </label>
                  <input
                    className="form-input"
                    id="password"
                    type="password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={
                      authMode === "register"
                        ? "new-password"
                        : "current-password"
                    }
                  />
                  <p className="form-help auth-help">
                    At least 12 characters. Keep it different from your coding
                    accounts.
                  </p>
                  {authMode === "register" && (
                    <p className="form-help auth-help">
                      New accounts may need to wait before voting.
                    </p>
                  )}
                </>
              )}
              {requestError && (
                <p className="request-error" role="alert">
                  {requestError}
                </p>
              )}
              <button
                className="button dark full"
                disabled={busy}
                type="submit"
              >
                {busy
                  ? "One moment…"
                  : live
                    ? authMode === "login"
                      ? "Come on in"
                      : "Make myself at home"
                    : profile
                      ? "Update my name tag"
                      : "Come on in"}{" "}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {displayedProfile && (
            <>
              <button
                className="text-button signout"
                disabled={busy}
                onClick={() => void signOut()}
              >
                {live ? "Sign out of Swarm Commons" : "Leave the demo profile"}
              </button>
              {requestError && live && session && (
                <p className="request-error" role="alert">
                  {requestError}
                </p>
              )}
            </>
          )}
        </Dialog>
      )}

      {modal === "how" && (
        <Dialog
          title="A swarm, not a supercomputer."
          close={() => setModal(null)}
          wide
        >
          <p className="dialog-intro">
            A lot of people doing a little good, together.
          </p>
          <div className="how-steps">
            {[
              [
                "01",
                "Pick something worth building.",
                "The community proposes public goals and votes on what matters. Every project is open source.",
              ],
              [
                "02",
                "Bring your own coding agent.",
                "Use Claude Code or Codex, signed in on your machine. You choose a task and decide when your agent runs.",
              ],
              [
                "03",
                "Make one small thing better.",
                "The swarm coordinates tasks and progress. Your agent makes a reviewable contribution, not a blind change.",
              ],
            ].map(([number, title, body]) => (
              <div key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="info-note">
            <Heart size={17} />
            <p>
              Your account stays yours. No shared logins, pooled credentials, or
              donated API credits.
            </p>
          </div>
          <button className="button orange" onClick={() => setModal("join")}>
            Find my first contribution <ArrowUpRight size={17} />
          </button>
        </Dialog>
      )}

      {modal === "join" && goals.length > 0 && (
        <Dialog
          title="A little help goes a long way."
          close={() => setModal(null)}
          wide
        >
          <p className="dialog-intro">Your machine. Your agent. Your say.</p>
          <label className="form-label" htmlFor="join-goal">
            1. Pick a public goal
          </label>
          <select
            className="form-input"
            id="join-goal"
            value={selectedGoal.id}
            onChange={(event) => setJoinGoal(event.target.value)}
          >
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
          <span className="form-label">
            2. Bring your locally signed-in agent
          </span>
          <div className="tool-options">
            {["claude", "codex"].map((value) => (
              <button
                className={tool === value ? "selected" : ""}
                key={value}
                onClick={() => setTool(value)}
                aria-pressed={tool === value}
              >
                <Code2 size={21} />
                <span>
                  {value === "claude" ? "Claude Code" : "Codex"}
                  <small>Runs on your own machine</small>
                </span>
                {tool === value && <Check size={17} />}
              </button>
            ))}
          </div>
          <span className="form-label">
            3. Start a conversation with your agent
          </span>
          <p className="form-help">
            Copy this starting prompt into your local tool. Review the
            repository and choose a task before running anything.
          </p>
          <pre className="prompt-preview" tabIndex={0}>
            {prompt}
          </pre>
          <div className="join-actions">
            <button className="button dark" onClick={copyPrompt}>
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {copied ? "Copied!" : "Copy starting prompt"}
            </button>
            <a
              className="text-button"
              href={selectedGoal.repoUrl || REPO}
              target="_blank"
              rel="noreferrer"
            >
              Read the project guide <ExternalLink size={15} />
            </a>
          </div>
          <div className="info-note">
            This concept does not launch an agent or spend your usage. Nothing
            runs until you start it locally.
          </div>
        </Dialog>
      )}

      {modal === "join" && goals.length === 0 && (
        <Dialog
          title="First, a goal worth sharing."
          close={() => setModal(null)}
        >
          <p className="dialog-intro">
            There are no public goals yet. Add one, then bring your agent along.
          </p>
          <button
            className="button orange full"
            onClick={() => setModal("propose")}
          >
            Propose the first goal <Plus size={17} />
          </button>
        </Dialog>
      )}

      {modal === "agents" && (
        <Dialog
          title="A peek into the workshop."
          close={() => setModal(null)}
          wide
        >
          <div className="workshop-heading">
            <p className="dialog-intro">
              {live
                ? `${snapshot!.stats.agents_running} agents running across the commons.`
                : "128 little efforts. One shared goal."}
            </p>
            <span className="sample-label">
              {live ? "COMMUNITY ACTIVITY" : "SAMPLE ACTIVITY"}
            </span>
          </div>
          <p className="workshop-disclaimer">
            {live
              ? "Active task claims from contributors’ local agents. Running agents are counted by recent heartbeats; claimed tasks may still be waiting to start."
              : "An example of the shared build view. These are illustrative agents, not a live connection."}
          </p>
          <div className="agent-list">
            {agents.map((agent, index) => (
              <article key={agent.taskId || index}>
                <Avatar initials={agent.initials} color={agent.color} />
                <div>
                  <h3>
                    {agent.name}
                    <span>{agent.tool}</span>
                  </h3>
                  <p>{agent.task}</p>
                  <small>
                    <GitBranch size={12} />
                    {agent.branch}
                  </small>
                </div>
                <span className="agent-status">
                  <span className="status-dot" />
                  {agent.state}
                </span>
              </article>
            ))}
            {agents.length === 0 && (
              <p className="form-help">
                No tasks are claimed right now. Pick a goal and start something
                good.
              </p>
            )}
          </div>
          <div className="workshop-bottom">
            <span>
              <Check size={16} />
              {live
                ? `${snapshot!.stats.prs_merged} tasks marked done by contributors`
                : "32 tasks shipped · 15 still to go"}
            </span>
            <a
              className="text-button"
              href={`${REPO}/pulls`}
              target="_blank"
              rel="noreferrer"
            >
              See real pull requests <ArrowUpRight size={16} />
            </a>
          </div>
          <button className="button orange" onClick={() => setModal("join")}>
            There’s a task for you, too <ArrowUpRight size={17} />
          </button>
        </Dialog>
      )}

      {modal === "propose" && (
        <Dialog
          title="What’s your little big idea?"
          close={() => setModal(null)}
        >
          <p className="dialog-intro">
            Think useful, public, and possible together.
          </p>
          <form onSubmit={propose}>
            <label className="form-label" htmlFor="idea-title">
              Give it a name
            </label>
            <input
              className="form-input"
              id="idea-title"
              placeholder="e.g. A map of quiet places"
              maxLength={90}
              required
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
            />
            <label className="form-label" htmlFor="idea-description">
              Who could it help, and how?
            </label>
            <textarea
              className="form-input"
              id="idea-description"
              rows={4}
              placeholder="The problem, the people, the first small step…"
              maxLength={1000}
              required
              value={ideaDescription}
              onChange={(event) => setIdeaDescription(event.target.value)}
            />
            <div className="info-note">
              {live
                ? "Sign in to propose a goal linked to the community repository. It needs approval before appearing on the public board."
                : "Demo board: your idea is saved only in this browser, not published to a public community."}
            </div>
            {requestError && (
              <p className="request-error" role="alert">
                {requestError}
              </p>
            )}
            <button
              className="button orange full"
              type="submit"
              disabled={busy}
            >
              {busy ? "Adding your idea…" : "Add it to the notebook"}{" "}
              <Plus size={17} />
            </button>
          </form>
        </Dialog>
      )}

      {modal === "new-thread" && (
        <Dialog title="Think a little out loud." close={() => setModal(null)}>
          <p className="dialog-intro">
            A question, a build log, a spark of an idea.
          </p>
          <form onSubmit={addThread}>
            <label className="form-label" htmlFor="note-title">
              What’s on your mind?
            </label>
            <input
              id="note-title"
              className="form-input"
              maxLength={150}
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              required
              placeholder="Give your note a title"
            />
            <label className="form-label" htmlFor="note-body">
              Tell us a little more
            </label>
            <textarea
              id="note-body"
              className="form-input"
              rows={5}
              maxLength={5000}
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              required
              placeholder="There’s room for every thought…"
            />
            <div className="info-note">
              {live
                ? "This starts a public community discussion. Sign in to publish it."
                : "Demo notebook: saved only in this browser, not published publicly."}
            </div>
            {requestError && (
              <p className="request-error" role="alert">
                {requestError}
              </p>
            )}
            <button className="button dark full" type="submit" disabled={busy}>
              {busy ? "Leaving your note…" : "Leave a note"}
              <Send size={16} />
            </button>
          </form>
        </Dialog>
      )}
      {thread && (
        <Dialog
          title={thread.title}
          close={() => {
            setThread(null);
            setComment("");
          }}
          wide
        >
          <div className="note-author thread-author">
            <Avatar initials={thread.initials} color={thread.color} />
            <div>
              <b>{thread.name}</b>
              <small>
                {thread.type} · {thread.time}
                {!live && " · demo note"}
              </small>
            </div>
          </div>
          <p className="thread-body">{thread.body}</p>
          <div className="thread-replies">
            <h3>
              The conversation <MessageCircle size={17} />
            </h3>
            <p className="form-help">
              {live
                ? "A public conversation. Be kind, be curious, be useful."
                : "Try adding a reply. Demo replies are private to this browser."}
            </p>
            {(live
              ? remoteComments.map((reply) => ({
                  name: reply.author,
                  body: reply.body,
                }))
              : comments[thread.id] || []
            ).map((reply, index) => (
              <div className="reply" key={index}>
                <Avatar initials={reply.name.slice(0, 2).toUpperCase()} small />
                <div>
                  <b>{reply.name}</b>
                  <p>{reply.body}</p>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={addComment}>
            <label className="form-label" htmlFor="reply">
              Add your two cents
            </label>
            <textarea
              className="form-input"
              id="reply"
              rows={3}
              maxLength={1500}
              required
              placeholder="A thought, a question, a little encouragement…"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            {requestError && (
              <p className="request-error" role="alert">
                {requestError}
              </p>
            )}
            <button className="button dark" type="submit" disabled={busy}>
              {busy ? "Leaving your note…" : "Leave a note"} <Send size={15} />
            </button>
          </form>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function Vote({
  goal,
  voted,
  onVote,
}: {
  goal: Goal;
  voted: boolean;
  onVote: () => void;
}) {
  return (
    <button
      className={`vote ${voted ? "voted" : ""}`}
      onClick={onVote}
      aria-label={`${voted ? "Remove vote for" : "Vote for"} ${goal.title}`}
      aria-pressed={voted}
    >
      <ArrowUp size={17} />
      <strong>
        {(goal.votes + Number(voted && !goal.live)).toLocaleString()}
      </strong>
    </button>
  );
}
function GoalRow({
  goal,
  index,
  voted,
  onVote,
  onOpen,
}: {
  goal: Goal;
  index: number;
  voted: boolean;
  onVote: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="idea-row">
      <Vote goal={goal} voted={voted} onVote={onVote} />
      <div className="idea-content">
        <button onClick={onOpen}>{goal.title}</button>
        <span>
          <i className={`category-dot category-${index}`} />
          {goal.category}
          <span className="separator">·</span>Proposed by the community
        </span>
      </div>
      <button
        className="icon-button idea-arrow"
        aria-label={`Explore ${goal.title}`}
        onClick={onOpen}
      >
        <ArrowUpRight size={20} />
      </button>
    </article>
  );
}
function NoteCard({
  note,
  extraComments,
  onOpen,
}: {
  note: Note;
  extraComments: number;
  onOpen: () => void;
}) {
  return (
    <button className="note-card" onClick={onOpen}>
      <div className="note-author">
        <Avatar initials={note.initials} color={note.color} small />
        <span>
          <b>{note.name}</b>
          <small>{note.time}</small>
        </span>
        <span
          className={`note-type ${note.type.toLowerCase().replace(" ", "-")}`}
        >
          {note.type}
        </span>
      </div>
      <h3>{note.title}</h3>
      <div className="note-card-bottom">
        <span>
          <MessageCircle size={14} />
          {note.replies + extraComments}{" "}
          {note.replies + extraComments === 1 ? "reply" : "replies"}
        </span>
        <ArrowUpRight size={17} />
      </div>
    </button>
  );
}
