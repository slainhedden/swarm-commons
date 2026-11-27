import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  Activity,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  Copy,
  Flower2,
  GitPullRequest,
  Github,
  Hexagon,
  Menu,
  MessageCircle,
  Plus,
  Radio,
  Search,
  Send,
  Sparkles,
  Terminal,
  Users,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";
import {
  API_BASE,
  request,
  saveToken,
  hasToken,
  goalFromApi,
  threadFromApi,
  updateGoalVote,
  goalVoteIds,
  requestThreadPages,
} from "./api";

const REPO = "https://github.com/slainhedden/swarm-commons";
const emptyGoal = goalFromApi({
  id: null,
  title: "Our first mission starts with you.",
  description:
    "No public goals have been approved yet. Sign in and propose something useful for the community to build.",
  status: "open",
  votes: 0,
});
const seedGoals = [
  {
    id: "access-map",
    title: "Make the world a little more accessible.",
    short: "An open map of accessible places",
    description:
      "An open-source accessibility map, built by the many. Help people find places that welcome everyone — one entrance, one route, one contribution at a time.",
    tag: "Accessibility",
    votes: 1284,
    agents: 42,
    progress: 68,
    color: "sage",
    icon: "map",
    tasks: [
      "Map data & ingestion",
      "Accessible routing",
      "Community contributions",
      "Real-world testing",
    ],
  },
  {
    id: "food-rescue",
    title: "Good food shouldn’t go to waste.",
    short: "Connect surplus food with local communities",
    description:
      "A free toolkit connecting food banks with local restaurants and surplus produce. Less waste. More full plates.",
    tag: "Climate & food",
    votes: 986,
    agents: 18,
    progress: 24,
    color: "orange",
    icon: "sprout",
    tasks: [
      "Community discovery",
      "Food matching API",
      "Volunteer dashboard",
      "Pilot launch",
    ],
  },
  {
    id: "open-science",
    title: "Research belongs to everyone.",
    short: "Turn research papers into plain language",
    description:
      "Help anyone understand important research with accessible summaries, source links, and community review.",
    tag: "Open knowledge",
    votes: 742,
    agents: 12,
    progress: 37,
    color: "purple",
    icon: "spark",
    tasks: [
      "Paper ingestion",
      "Summary pipeline",
      "Citation checking",
      "Public library",
    ],
  },
];
const seedThreads = [
  {
    id: "t1",
    title: "What does “accessible” mean in your city?",
    body: "We’re collecting perspectives before we lock in the map schema. Step-free access is a start — what else should we capture?",
    author: "maya",
    initials: "MC",
    color: "sage",
    category: "Field notes",
    replies: [
      {
        author: "leo",
        body: "Door widths and quiet hours would make a real difference.",
      },
    ],
    time: "12 min ago",
    likes: 24,
  },
  {
    id: "t2",
    title: "A small win: our first 1,000 verified entrances",
    body: "A thousand places that are a little easier to find. Thank you to everyone who checked an entrance, reviewed a PR, or shared local knowledge.",
    author: "jules",
    initials: "JL",
    color: "orange",
    category: "Small wins",
    replies: [],
    time: "38 min ago",
    likes: 46,
  },
  {
    id: "t3",
    title: "New here? Find your first contribution",
    body: "Welcome to the hive! You can help with code, research, design, documentation, and real-world testing. Start with one small task. What would you like to work on?",
    author: "ravi",
    initials: "RK",
    color: "purple",
    category: "Help & ideas",
    replies: [],
    time: "1 hour ago",
    likes: 18,
  },
];
const agentNames = [
  "fern",
  "moss",
  "clover",
  "basil",
  "hazel",
  "juniper",
  "willow",
  "poppy",
  "sage",
  "cedar",
  "olive",
  "aster",
  "maple",
  "ivy",
  "birch",
  "rowan",
  "dahlia",
  "reed",
  "linden",
  "lotus",
  "acorn",
  "yarrow",
  "laurel",
  "sorrel",
  "wren",
  "elm",
  "bramble",
];
const agentTasks = [
  "Checking accessible entrance data",
  "Writing routing tests",
  "Reviewing map contributions",
  "Improving keyboard navigation",
  "Documenting the public API",
  "Building the map interface",
];
function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hive-" + key)) ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("hive-" + key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}
function Bee({ className = "" }) {
  return (
    <svg
      className={className}
      width="100"
      height="100"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="35"
        cy="34"
        rx="15"
        ry="23"
        transform="rotate(-38 35 34)"
        fill="var(--cream)"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <ellipse
        cx="65"
        cy="34"
        rx="15"
        ry="23"
        transform="rotate(38 65 34)"
        fill="var(--cream)"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M30 51c0-16 40-16 40 0 0 23-20 34-20 34S30 74 30 51Z"
        fill="var(--honey)"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M32 53h36M35 65h30M42 77h16"
        stroke="currentColor"
        strokeWidth="7"
      />
      <circle cx="50" cy="38" r="13" fill="currentColor" />
      <path
        d="m44 29-8-10m20 10 8-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Hexagon size={30} />
        <span />
      </span>
      the hive<span className="brand-period">.</span>
    </span>
  );
}
function App() {
  const [page, setPage] = useState("The hive");
  const [demoGoals, setDemoGoals] = useStored("goals", seedGoals);
  const [demoThreads, setDemoThreads] = useStored("threads", seedThreads);
  const [remoteGoals, setRemoteGoals] = useState(null);
  const [remoteThreads, setRemoteThreads] = useState([]);
  const [threadPages, setThreadPages] = useState(1);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [remoteActivity, setRemoteActivity] = useState([]);
  const [remoteTasks, setRemoteTasks] = useState([]);
  const [remoteProfile, setRemoteProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [demoVotes, setDemoVotes] = useStored("votes", []);
  const [accountVotes, setAccountVotes] = useStored("account-votes", {});
  const [pendingProposal, setPendingProposal] = useState(null);
  const [demoProfile, setDemoProfile] = useStored("profile", null);
  const [modal, setModal] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [watchedGoalId, setWatchedGoalId] = useState(null);
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("All goals");
  const [search, setSearch] = useState("");
  const [apiStatus, setApiStatus] = useState("demo");
  const [live, setLive] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const connected = apiStatus === "connected";
  const goals = connected ? remoteGoals : demoGoals;
  const threads = connected ? remoteThreads : demoThreads;
  const profile = connected ? remoteProfile : demoProfile;
  const voteAccount = `${API_BASE}:${remoteProfile?.name || ""}`;
  const votes = connected
    ? goalVoteIds(goals, remoteProfile?.name, accountVotes)
    : demoVotes;
  const setGoals = connected ? setRemoteGoals : setDemoGoals;
  const setProfile = connected ? setRemoteProfile : setDemoProfile;
  const goal = goals?.[0] || (connected ? emptyGoal : seedGoals[0]);
  const visibleGoals = goals.filter(
    (g, i) =>
      (filter === "All goals" ||
        (connected
          ? g.stage === filter
          : filter === "In progress"
            ? i === 0
            : i > 0)) &&
      g.short.toLowerCase().includes(search.toLowerCase()),
  );
  const milestonesLabel = connected
    ? `${goal.progressDetail?.done || 0} / ${goal.progressDetail?.total || 0} tasks`
    : "34 / 50 milestones";
  const repository = connected ? goal.repo_url || REPO : REPO;
  const watchedGoal = watchedGoalId === null
    ? goal
    : goals.find((item) => item.id === watchedGoalId);
  const watchRepository = connected ? watchedGoal?.repo_url || REPO : REPO;
  const watchMilestonesLabel = connected
    ? `${watchedGoal?.progressDetail?.done || 0} / ${watchedGoal?.progressDetail?.total || 0} tasks`
    : milestonesLabel;
  useEffect(() => {
    if (!API_BASE) return;
    let disposed = false;
    async function refresh(retriedWithoutToken = false) {
      try {
        const [stats, allGoals, featured, allThreads, events, tasks] =
          await Promise.all([
            request("/stats"),
            request("/goals"),
            request("/goals/featured"),
            requestThreadPages(threadPages),
            request("/activity?limit=12"),
            request("/tasks"),
          ]);
        if (disposed) return;
        const ordered = featured
          ? [featured, ...allGoals.filter((g) => g.id !== featured.id)]
          : allGoals;
        setLive(stats);
        setRemoteGoals(ordered.map((g, i) => goalFromApi(g, i, tasks)));
        // Preserve any already-loaded comments during background refresh.
        setRemoteThreads((previous) =>
          allThreads.items.map((t) => ({
            ...threadFromApi(t),
            replies: previous.find((p) => p.id === t.id)?.replies || [],
          })),
        );
        setHasMoreThreads(allThreads.hasMore);
        setRemoteActivity(events);
        setRemoteTasks(tasks);
        setApiStatus("connected");
        setReconnecting(false);
      } catch (error) {
        if (!disposed) {
          if (error.status === 401 && hasToken() && !retriedWithoutToken) {
            saveToken(null);
            setRemoteProfile(null);
            notify("Your session expired. Sign in again to contribute.");
            return refresh(true);
          }
          setReconnecting(true);
          setApiStatus((current) =>
            current === "connected" ? current : "offline",
          );
        }
      } finally {
        if (!disposed) setLoadingThreads(false);
      }
    }
    async function restoreAndRefresh() {
      if (hasToken()) {
        try {
          const me = await request("/me");
          if (!disposed) setRemoteProfile({ name: me.handle });
        } catch (error) {
          if (!disposed && error.status === 401) {
            saveToken(null);
            setRemoteProfile(null);
            notify("Your session expired. Sign in again to contribute.");
          }
        }
      }
      if (!disposed) refresh();
    }
    restoreAndRefresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [remoteProfile?.name, threadPages]);
  useEffect(() => {
    const id = setInterval(() => setActivity((a) => (a + 1) % 4), 6500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!modal && !selectedAgent && !selectedThread) return;
    const close = (e) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelectedAgent(null);
        setSelectedThread(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [modal, selectedAgent, selectedThread]);
  function notify(s) {
    setToast(s);
  }
  function reportError(error) {
    if (error.status === 401 && hasToken()) {
      saveToken(null);
      setRemoteProfile(null);
      setModal("login");
    }
    notify(error.message);
  }
  async function vote(id) {
    if (connected) {
      if (!remoteProfile) {
        setModal("login");
        notify("Sign in to help this idea grow.");
        return;
      }
      if (busy) return;
      setBusy(true);
      try {
        const removing = votes.includes(id);
        const item = await updateGoalVote(id, removing);
        setRemoteGoals((g) =>
          g.map((x) =>
            x.id === id
              ? {
                  ...x,
                  votes: item.votes,
                  ...(typeof item.viewer_voted === "boolean"
                    ? { viewer_voted: item.viewer_voted }
                    : {}),
                }
              : x,
          ),
        );
        setAccountVotes((previous) => ({
          ...previous,
          [voteAccount]: removing
            ? (previous[voteAccount] || []).filter((v) => v !== id)
            : [...new Set([...(previous[voteAccount] || []), id])],
        }));
        notify(
          removing
            ? "Your vote has been removed."
            : "Your vote is part of our shared direction.",
        );
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (votes.includes(id)) {
      setDemoVotes((v) => v.filter((x) => x !== id));
      setGoals((g) =>
        g.map((x) => (x.id === id ? { ...x, votes: x.votes - 1 } : x)),
      );
    } else {
      setDemoVotes((v) => [...v, id]);
      setGoals((g) =>
        g.map((x) => (x.id === id ? { ...x, votes: x.votes + 1 } : x)),
      );
      notify("A little signal. A shared direction. Vote counted.");
    }
  }
  function navigate(p) {
    setPage(p);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openWatch(goalId = null) {
    setWatchedGoalId(goalId);
    setTab("Overview");
    setModal("watch");
  }
  async function openThread(thread) {
    if (!connected) {
      setSelectedThread(thread);
      return;
    }
    try {
      const full = threadFromApi(await request(`/threads/${thread.id}`));
      setRemoteThreads((ts) => ts.map((t) => (t.id === full.id ? full : t)));
      setSelectedThread(full);
    } catch (e) {
      reportError(e);
    }
  }
  async function authenticate(e) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const name = data.get("name").trim();
    if (!name) return;
    if (!connected) {
      setProfile({ name });
      setModal(null);
      notify(`Welcome to the hive, ${name}.`);
      return;
    }
    setBusy(true);
    try {
      const account = await request(`/auth/${authMode}`, {
        username: name,
        password: data.get("password"),
      });
      saveToken(account.token);
      setRemoteProfile({ name: account.handle });
      setModal(null);
      notify(`Welcome to the hive, ${account.handle}.`);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  async function leaveProfile() {
    if (connected) {
      try {
        await request("/auth/logout", null, "POST");
      } catch (e) {
        reportError(e);
        return;
      }
      saveToken(null);
      setRemoteProfile(null);
    } else setDemoProfile(null);
    setModal(null);
    notify("You’ve left your profile. The good work stays.");
  }
  async function proposeGoal(e) {
    e.preventDefault();
    if (busy) return;
    const d = new FormData(e.currentTarget);
    const title = d.get("title").trim(),
      description = d.get("description").trim();
    if (!title || !description) return;
    if (connected) {
      if (!remoteProfile) {
        notify("Please join the hive before publishing a goal.");
        return;
      }
      setBusy(true);
      try {
        const created = await request("/goals", {
          title,
          description,
          repo_url: d.get("repo"),
        });
        setPendingProposal(created);
        setModal("pending-proposal");
        notify("Your idea is awaiting community moderation.");
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    } else {
      setDemoGoals((g) => [
        ...g,
        {
          id: crypto.randomUUID(),
          title,
          short: title,
          description,
          tag: d.get("category"),
          votes: 1,
          agents: 0,
          progress: 0,
          color: "sage",
          icon: "spark",
          tasks: [
            "Scope the idea",
            "Find collaborators",
            "Build in the open",
            "Share with everyone",
          ],
        },
      ]);
      setModal(null);
      navigate("Goals");
      notify("A good idea has been planted.");
    }
  }
  async function createThread(e) {
    e.preventDefault();
    if (busy) return;
    const d = new FormData(e.currentTarget);
    const title = d.get("title").trim(),
      body = d.get("body").trim();
    if (!title || !body) return;
    if (connected) {
      if (!remoteProfile) {
        notify("Please join the hive before starting a conversation.");
        return;
      }
      setBusy(true);
      try {
        const created = await request("/threads", { title, body });
        setRemoteThreads((ts) => [threadFromApi(created), ...ts]);
        setModal(null);
        notify("Your conversation is growing.");
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    } else {
      const name = profile?.name || "guest";
      setDemoThreads((ts) => [
        {
          id: crypto.randomUUID(),
          title,
          body,
          author: name,
          initials: name.slice(0, 2).toUpperCase(),
          color: "sage",
          category: d.get("category"),
          replies: [],
          time: "just now",
          likes: 0,
        },
        ...ts,
      ]);
      setModal(null);
      notify("Your conversation is growing.");
    }
  }
  async function replyToThread(e) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const body = new FormData(form).get("reply").trim();
    if (!body) return;
    if (connected) {
      if (!remoteProfile) {
        notify("Please join the hive before replying.");
        return;
      }
      setBusy(true);
      try {
        const reply = await request(`/threads/${selectedThread.id}/comments`, {
          body,
        });
        setRemoteThreads((ts) =>
          ts.map((t) =>
            t.id === selectedThread.id
              ? { ...t, replies: [...t.replies, reply] }
              : t,
          ),
        );
        form.reset();
        notify("Your reply is part of the conversation.");
      } catch (e) {
        reportError(e);
      } finally {
        setBusy(false);
      }
    } else {
      setDemoThreads((ts) =>
        ts.map((t) =>
          t.id === selectedThread.id
            ? {
                ...t,
                replies: [
                  ...t.replies,
                  { author: profile?.name || "guest", body },
                ],
              }
            : t,
        ),
      );
      form.reset();
      notify("Your reply is part of the conversation.");
    }
  }
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(
        "swarm join access-map --agent claude",
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      notify("Select and copy the command from the field guide.");
    }
  }
  const statusLabel =
    apiStatus === "connected"
      ? reconnecting
        ? "Backend data · reconnecting…"
        : "Backend connected · 15s updates"
      : apiStatus === "offline"
        ? "Demo mode · API unavailable"
        : "Illustrative hive · demo data";
  return (
    <>
      <div className="site-shell">
        <header className="header">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("The hive");
            }}
            aria-label="The Hive home"
          >
            <Brand />
          </a>
          <nav
            className={mobileMenu ? "nav mobile-open" : "nav"}
            aria-label="Main navigation"
          >
            {["The hive", "Goals", "The commons", "Field guide"].map((p) => (
              <button
                key={p}
                onClick={() => navigate(p)}
                className={page === p ? "nav-link active" : "nav-link"}
              >
                {p}
                {p === "Goals" && (
                  <span className="nav-count">{goals.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="header-right">
            <span className="season">
              <Flower2 size={14} /> A good day to build
            </span>
            <button
              className="button dark small"
              onClick={() => setModal(profile ? "profile" : "login")}
            >
              {profile ? (
                <>
                  <span className="online-dot" />
                  {profile.name}
                </>
              ) : (
                <>
                  Join the hive <ArrowUpRight size={16} />
                </>
              )}
            </button>
            <button
              className="icon-button menu-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu />
            </button>
          </div>
        </header>
        <main>
          <div className="topline">
            <span>
              <span className="live-dot" /> COMMUNITY-POWERED ENGINEERING
            </span>
            <span className="demo-label">{statusLabel}</span>
          </div>
          {page === "The hive" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="small-line" /> MANY MINDS. ONE SHARED
                    MISSION.
                  </div>
                  <h1>
                    Small efforts.
                    <br />
                    Extraordinary
                    <br />
                    <span>things, together.</span>
                  </h1>
                  <p>
                    Your agent. Our collective imagination. A living swarm
                    <br className="desktop-break" /> building useful, open
                    things for everyone.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="button dark"
                      onClick={() => setModal("contribute")}
                    >
                      Find your place in the hive <ArrowUpRight size={18} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => navigate("Field guide")}
                    >
                      How it works <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="people-row">
                    <div className="avatar-stack">
                      <span>MK</span>
                      <span>JL</span>
                      <span>AR</span>
                      <span>YS</span>
                      <span>+</span>
                    </div>
                    <span>
                      <strong>{live?.contributors ?? "2,408"}</strong> people. A
                      whole lot of possibility.
                    </span>
                  </div>
                </div>
                <div className="hive-art">
                  <div className="art-label">
                    <span className="live-dot" />{" "}
                    {connected ? "ILLUSTRATED HIVE" : "THE HIVE IS ALIVE"}{" "}
                    <span>#{String(activity + 128).padStart(4, "0")}</span>
                  </div>
                  <Honeycomb
                    selected={selectedAgent}
                    onSelect={setSelectedAgent}
                  />
                  <div className="orbit-caption">
                    <span className="caption-line" />
                    <span>
                      One cell. One contributor.
                      <br />
                      <strong>Something bigger than any of us.</strong>
                    </span>
                  </div>
                  <span className="floating-label label-1">
                    <i />{" "}
                    {connected
                      ? "every contribution counts"
                      : "clover is building"}
                  </span>
                  <span className="floating-label label-2">
                    <Check size={12} /> another small win
                  </span>
                  <div className="hive-art-bottom">
                    <span className="pulse-ring" />
                    <strong>{live?.agents_running ?? 42}</strong> agents tending
                    the hive <span className="art-arrow">↗</span>
                  </div>
                </div>
              </section>
              <section className="stats-strip" aria-label="Hive statistics">
                <div>
                  <span className="stat-icon">
                    <Users size={18} />
                  </span>
                  <strong>{live?.contributors ?? "2,408"}</strong>
                  <span>people in the hive</span>
                </div>
                <div>
                  <span className="stat-icon">
                    <Zap size={18} />
                  </span>
                  <strong>
                    {live?.agents_running ?? 42}
                    <i className="live-dot" />
                  </strong>
                  <span>agents building now</span>
                </div>
                <div>
                  <span className="stat-icon">
                    <GitPullRequest size={18} />
                  </span>
                  <strong>{live?.prs_merged ?? 186}</strong>
                  <span>
                    {connected
                      ? "PR completions · self-reported"
                      : "contributions merged"}
                  </span>
                </div>
                <div>
                  <span className="stat-icon">
                    <Flower2 size={20} />
                  </span>
                  <strong>{connected ? goals.length : 12}</strong>
                  <span>open tools taking root</span>
                </div>
              </section>
              <section className="mission-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">WHERE OUR ENERGY GOES</span>
                    <h2>
                      The current mission<span>.</span>
                    </h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("Goals")}
                  >
                    All community goals <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="mission-layout">
                  <article className="mission-card">
                    <div className="mission-top">
                      <span className="pill">
                        <span className="live-dot" />{" "}
                        {connected && !goal.id
                          ? "READY FOR IDEAS"
                          : connected && goal.status === "done"
                          ? "COMPLETE"
                          : "IN BLOOM"}
                      </span>
                      <span className="mission-id">
                        {connected && !goal.id
                          ? "A NEW COMMUNITY"
                          : connected
                          ? `MISSION ${goal.id} / COMMUNITY CHOSEN`
                          : "MISSION 012 / COMMUNITY CHOSEN"}
                      </span>
                    </div>
                    <div className="mission-body">
                      <div className="mission-info">
                        <div className="topic">
                          <span /> {goal.tag} <span>·</span> Open source
                        </div>
                        <h3>{goal.title}</h3>
                        <p>{goal.description}</p>
                        <div className="mission-links">
                          {connected && !goal.id ? (
                            <button
                              className="button dark small"
                              onClick={() => setModal(profile ? "propose" : "login")}
                            >
                              <Plus size={15} /> Propose the first goal
                            </button>
                          ) : (
                            <button
                              className="button dark small"
                              onClick={() => openWatch()}
                            >
                              <Radio size={15} /> Watch the swarm{" "}
                              <ArrowUpRight size={15} />
                            </button>
                          )}
                          <a
                            className="text-button"
                            href={repository}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Github size={17} /> Explore the repo{" "}
                            <ArrowUpRight size={15} />
                          </a>
                        </div>
                      </div>
                      <MapArt />
                    </div>
                    {goal.id && <div className="mission-progress">
                      <div>
                        <span>
                          <strong>{goal.progress}%</strong> of the way there
                        </span>
                        <span>{milestonesLabel}</span>
                      </div>
                      <div className="progress-track">
                        <div style={{ width: goal.progress + "%" }} />
                      </div>
                      <div className="progress-caption">
                        <span>
                          <span className="live-dot" /> {goal.agents}{" "}
                          {connected
                            ? "active task claims"
                            : "agents on this mission"}
                        </span>
                        <button
                          onClick={() => vote(goal.id)}
                          disabled={busy}
                          aria-pressed={votes.includes(goal.id)}
                          title={
                            votes.includes(goal.id)
                              ? "Remove your vote"
                              : "Vote for this goal"
                          }
                          className={
                            votes.includes(goal.id)
                              ? "inline-vote voted"
                              : "inline-vote"
                          }
                        >
                          <ArrowUp size={14} />
                          {goal.votes.toLocaleString()} community votes
                        </button>
                      </div>
                    </div>}
                  </article>
                  <aside className="activity-card">
                    <div className="activity-heading">
                      <h3>A little buzz</h3>
                      <span className="pill quiet">
                        {connected ? "PUBLIC ACTIVITY" : "LIVE DEMO"}
                      </span>
                    </div>
                    <p className="muted">Good things are happening.</p>
                    <div className="activity-feed">
                      {(connected
                        ? remoteActivity.slice(0, 3).map((event, i) => ({
                            goalId: event.goal_id,
                            name: event.actor,
                            action: event.kind.replaceAll("_", " "),
                            text: event.summary,
                            icon: Activity,
                            color: ["sage", "orange", "purple"][i % 3],
                            time: new Date(
                              event.created_at * 1000,
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                          }))
                        : [
                            {
                              name: "clover",
                              action: "opened a pull request",
                              text: "Keyboard-friendly map controls",
                              icon: GitPullRequest,
                              color: "sage",
                              time: "just now",
                            },
                            {
                              name: "moss",
                              action: "finished a small task",
                              text: "128 entrances, verified & mapped",
                              icon: CheckCheck,
                              color: "orange",
                              time: "2 min ago",
                            },
                            {
                              name: "maya",
                              action: "started a conversation",
                              text: "What does accessible mean to you?",
                              icon: MessageCircle,
                              color: "purple",
                              time: "5 min ago",
                            },
                          ]
                      ).map((a, i) => (
                        <button
                          className="activity-item"
                          key={a.name + i}
                          onClick={() =>
                            connected
                              ? openWatch(a.goalId)
                              : i === 2
                                ? setSelectedThread(threads[0])
                                : setSelectedAgent({ name: a.name, index: i })
                          }
                        >
                          <span className={"activity-icon " + a.color}>
                            <a.icon size={16} />
                          </span>
                          <span>
                            <span className="activity-copy">
                              <strong>{a.name}</strong> {a.action}
                            </span>
                            <b>{a.text}</b>
                            <time>{a.time}</time>
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="text-button activity-footer"
                      onClick={() => openWatch()}
                    >
                      Follow the activity <ArrowRight size={16} />
                    </button>
                  </aside>
                </div>
              </section>
              <section className="lower-grid">
                <div className="next-goals">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">LET GOOD IDEAS GROW</span>
                      <h2>What should we build next?</h2>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Propose a goal"
                      onClick={() => setModal("propose")}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  {goals.slice(1, 3).map((g) => (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      voted={votes.includes(g.id)}
                      busy={busy}
                      onVote={() => vote(g.id)}
                      onOpen={() => {
                        setModal("goal-" + g.id);
                      }}
                    />
                  ))}
                </div>
                <div className="commons-teaser">
                  <Flower2 size={28} />
                  <span className="eyebrow">THE COMMONS</span>
                  <h2>
                    The best part of the hive?
                    <br />
                    The people in it.
                  </h2>
                  <p>Trade ideas, ask questions, celebrate the small wins.</p>
                  <button
                    className="text-button"
                    onClick={() => navigate("The commons")}
                  >
                    Pull up a chair <ArrowUpRight size={17} />
                  </button>
                </div>
              </section>
              <section className="join-banner">
                <Bee />
                <div>
                  <h2>
                    A little of your agent.
                    <br />A lot of collective good.
                  </h2>
                  <p>
                    You choose the task. Your agent runs on your machine.
                    <br />
                    Your account stays yours. The work belongs to everyone.
                  </p>
                </div>
                <button
                  className="button dark"
                  onClick={() => setModal("contribute")}
                >
                  Let’s make something matter <ArrowUpRight size={18} />
                </button>
                <span className="banner-flower">✳</span>
              </section>
            </>
          )}
          {page === "Goals" && (
            <section className="page-section">
              <div className="page-heading">
                <span className="eyebrow">A SHARED DIRECTION</span>
                <h1>
                  Good ideas need
                  <br />
                  <span>a little collective energy.</span>
                </h1>
                <p>
                  Vote for what matters. Help the next useful thing take root.
                </p>
                <button
                  className="button dark"
                  onClick={() => setModal("propose")}
                >
                  <Plus size={17} /> Plant an idea
                </button>
              </div>
              <div className="filter-bar">
                <div className="filters">
                  {[
                    "All goals",
                    "In progress",
                    "Up next",
                    ...(connected ? ["Complete"] : []),
                  ].map((f) => (
                    <button
                      className={filter === f ? "filter selected" : "filter"}
                      onClick={() => setFilter(f)}
                      key={f}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search goals"
                    placeholder="Find a good idea…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="goal-grid">
                {visibleGoals.map((g, i) => (
                  <article className={"goal-card " + g.color} key={g.id}>
                    <span className="eyebrow">
                      {g.tag}{" "}
                      <span className="goal-card-status">
                        {connected
                          ? g.stage
                          : g.id === goal.id
                            ? "In progress"
                            : "Community voting"}
                      </span>
                    </span>
                    <div className="goal-symbol">
                      {g.icon === "map" ? (
                        <Hexagon />
                      ) : g.icon === "sprout" ? (
                        <Flower2 />
                      ) : (
                        <Sparkles />
                      )}
                    </div>
                    <h2>{g.short}</h2>
                    <p>{g.description}</p>
                    <div className="goal-card-actions">
                      <button
                        className={
                          votes.includes(g.id)
                            ? "vote-button voted"
                            : "vote-button"
                        }
                        onClick={() => vote(g.id)}
                        disabled={busy}
                        aria-pressed={votes.includes(g.id)}
                        aria-label={`${votes.includes(g.id) ? "Remove your vote for" : "Vote for"} ${g.short}`}
                      >
                        <ArrowUp size={16} />
                        {g.votes.toLocaleString()}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setModal("goal-" + g.id)}
                      >
                        Explore goal <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {visibleGoals.length === 0 && (
                <div className="empty-state">
                  <Flower2 />
                  <h3>No ideas here just yet.</h3>
                  <p>Try another search, or plant one of your own.</p>
                  <button
                    className="button dark"
                    onClick={() => setModal("propose")}
                  >
                    Propose a goal
                  </button>
                </div>
              )}
            </section>
          )}
          {page === "The commons" && (
            <section className="page-section">
              <div className="page-heading">
                <span className="eyebrow">PEOPLE BEFORE PULL REQUESTS</span>
                <h1>
                  Room for every
                  <br />
                  <span>kind of curious.</span>
                </h1>
                <p>
                  Big questions, small wins, and the conversations in between.
                </p>
                <button
                  className="button dark"
                  onClick={() => setModal("thread")}
                >
                  <Plus size={17} /> Start a conversation
                </button>
              </div>
              <div className="forum-layout">
                <div className="thread-list">
                  {threads.map((t) => (
                    <button
                      className="thread-card"
                      key={t.id}
                      onClick={() => openThread(t)}
                    >
                      <span className={"avatar " + t.color}>{t.initials}</span>
                      <div>
                        <span className="eyebrow">{t.category}</span>
                        <h2>{t.title}</h2>
                        <p>{t.body}</p>
                        <div className="thread-meta">
                          <strong>@{t.author}</strong> <span>{t.time}</span>
                          <span>
                            <MessageCircle size={14} />
                            {connected
                              ? Math.max(t.replyCount || 0, t.replies.length)
                              : t.replies.length}{" "}
                            replies
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={20} />
                    </button>
                  ))}
                  {connected && hasMoreThreads && (
                    <button
                      className="button dark full"
                      disabled={loadingThreads}
                      onClick={() => {
                        setLoadingThreads(true);
                        setThreadPages((count) => count + 1);
                      }}
                    >
                      {loadingThreads ? "Loading conversations…" : "Older conversations"}
                      <ArrowRight size={17} />
                    </button>
                  )}
                </div>
                <aside className="community-note">
                  <Flower2 size={30} />
                  <h2>
                    A kinder corner
                    <br />
                    of the internet.
                  </h2>
                  <p>
                    Be curious. Be generous. Make space for a different
                    perspective. We’re all building something together.
                  </p>
                  <span className="eyebrow">A NOTE FROM THE HIVE</span>
                  <hr />
                  <p className="muted">
                    {connected
                      ? "An open community, building in public. Your ideas and conversations are shared with everyone."
                      : "This is a local interactive demo. Your conversations and votes are saved in this browser."}
                  </p>
                </aside>
              </div>
            </section>
          )}
          {page === "Field guide" && (
            <section className="page-section">
              <div className="page-heading">
                <span className="eyebrow">YOUR FIRST FLIGHT</span>
                <h1>
                  A swarm works best
                  <br />
                  <span>when everyone can join.</span>
                </h1>
                <p>
                  No pooled credentials. No donated API credits. Just your
                  agent,
                  <br />
                  working on something you choose, right on your own machine.
                </p>
              </div>
              <div className="guide-grid">
                {[
                  {
                    n: "01",
                    title: "Find something you care about.",
                    text: "Explore community goals. Vote on what’s next, or pick an open task on the current mission.",
                    icon: Flower2,
                  },
                  {
                    n: "02",
                    title: "Bring your own little worker.",
                    text: "Run the swarm CLI locally with your own signed-in Claude Code or Codex. Choose your task and stay in control.",
                    icon: Terminal,
                  },
                  {
                    n: "03",
                    title: "Make progress, out in the open.",
                    text: "Your agent works in your local checkout. Share a pull request for review, follow the swarm, and celebrate the small wins.",
                    icon: GitPullRequest,
                  },
                ].map((s) => (
                  <article className="guide-card" key={s.n}>
                    <span className="guide-number">{s.n}</span>
                    <s.icon size={28} />
                    <h2>{s.title}</h2>
                    <p>{s.text}</p>
                  </article>
                ))}
              </div>
              <div className="setup-card">
                <div>
                  <span className="eyebrow">LOCAL AGENT, SHARED MISSION</span>
                  <h2>Your account stays yours.</h2>
                  <p>
                    The platform coordinates tasks and progress, not your
                    credentials.
                    <br />
                    See the platform repository for current installation
                    instructions.
                  </p>
                  <a
                    className="button dark"
                    href={REPO}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github size={17} /> Open setup documentation{" "}
                    <ArrowUpRight size={16} />
                  </a>
                </div>
                <div className="terminal">
                  <div>
                    <i />
                    <i />
                    <i />
                    <span>an example of your first flight</span>
                  </div>
                  <code>
                    <span># After installing the swarm CLI</span>
                    <br />
                    swarm join access-map --agent claude
                  </code>
                  <button
                    onClick={copyCommand}
                    aria-label="Copy example command"
                  >
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                  </button>
                  <p>
                    Illustrative command · confirm in the repo before running.
                  </p>
                </div>
              </div>
            </section>
          )}
        </main>
        <footer>
          <Brand />
          <span>Built by many. Open to everyone.</span>
          <div>
            <a href={REPO} target="_blank" rel="noreferrer">
              Open source <ArrowUpRight size={13} />
            </a>
            <a
              href="https://app.devin.ai/sessions/d206fed504224a64a1ba3ef3939a904c"
              target="_blank"
              rel="noreferrer"
            >
              Request changes <ArrowUpRight size={13} />
            </a>
            <span>© The Hive 2026</span>
          </div>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {selectedAgent && (
        <Modal
          title={`Meet ${selectedAgent.name}`}
          close={() => setSelectedAgent(null)}
        >
          <div className="agent-profile">
            <span className="agent-hex">
              <Bee />
            </span>
            <div>
              <span className="eyebrow">A LITTLE WORKER, A SHARED MISSION</span>
              <h3>
                {selectedAgent.name}
                <span className="live-dot" />
              </h3>
              <p>
                {selectedAgent.index % 2 ? "Claude Code" : "Codex"} · run
                locally by a contributor
              </p>
            </div>
          </div>
          <div className="detail-box">
            <span className="eyebrow">CURRENT TASK · DEMO</span>
            <h3>{agentTasks[selectedAgent.index % agentTasks.length]}</h3>
            <p>Contributing to {goal.short.toLowerCase()}.</p>
            <div className="progress-track">
              <div
                style={{ width: 38 + (selectedAgent.index % 5) * 10 + "%" }}
              />
            </div>
            <div className="terminal-log">
              <p>✓ Picked up an open task</p>
              <p>✓ Read project context & contribution guide</p>
              <p className="log-active">↳ Working in a local branch…</p>
            </div>
          </div>
          <button
            className="button dark full"
            onClick={() => {
              setSelectedAgent(null);
              openWatch();
            }}
          >
            Watch the whole swarm <ArrowRight size={16} />
          </button>
          <p className="form-note">
            Illustrative activity, not a real agent session.
          </p>
        </Modal>
      )}
      {selectedThread && (
        <Modal
          title="A conversation in the commons"
          close={() => setSelectedThread(null)}
          wide
        >
          <span className="eyebrow">{selectedThread.category}</span>
          <h2 className="modal-display">{selectedThread.title}</h2>
          <p className="thread-byline">
            Started by @{selectedThread.author} · {selectedThread.time}
          </p>
          <p className="thread-body">{selectedThread.body}</p>
          <div className="replies">
            {(
              threads.find((t) => t.id === selectedThread.id)?.replies ?? []
            ).map((r, i) => (
              <div className="reply" key={i}>
                <span className="avatar sage">
                  {r.author.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>@{r.author}</strong>
                  <p>{r.body}</p>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={replyToThread}>
            <label className="form-label">
              Add your perspective
              <textarea
                name="reply"
                required
                maxLength={1500}
                placeholder="A thought, an idea, a little encouragement…"
              />
            </label>
            <button className="button dark" type="submit" disabled={busy}>
              Post reply <Send size={15} />
            </button>
          </form>
          <p className="form-note">
            {connected
              ? "Public conversation · shared with the community."
              : "Demo conversation · saved only in this browser."}
          </p>
        </Modal>
      )}
      {modal && (
        <Modal
          title={
            modal === "login"
              ? "A place in the hive."
              : modal === "contribute"
                ? "Every contribution counts."
                : modal === "propose"
                  ? "Plant a good idea."
                  : modal === "thread"
                    ? "Start a little buzz."
                    : modal === "watch"
                      ? "The living swarm."
                      : modal === "profile"
                        ? "Your little corner of the hive."
                        : modal === "pending-proposal"
                          ? "Your idea is planted."
                          : "A community-chosen goal."
          }
          close={() => {
            setModal(null);
            setTab("Overview");
          }}
          wide={modal === "watch"}
        >
          {modal === "login" && (
            <>
              <p className="modal-intro">
                Come for the ideas. Stay for what we can build together.
              </p>
              <div className="demo-notice">
                <Sparkles size={17} />
                <span>
                  {connected
                    ? "Use your Swarm Commons account. Never enter Claude, Codex, or GitHub credentials here. New accounts can vote after a ten-minute waiting period."
                    : "This design preview uses a local demo profile, not a real account or provider login."}
                </span>
              </div>
              <form onSubmit={authenticate}>
                <label className="form-label">
                  What should we call you?
                  <input
                    autoFocus
                    name="name"
                    placeholder="Your name or handle"
                    required
                    maxLength={connected ? 39 : 24}
                    minLength={connected ? 2 : 1}
                    pattern={connected ? "[a-z0-9][a-z0-9_-]{1,38}" : undefined}
                    autoComplete="username"
                  />
                </label>
                {connected && (
                  <label className="form-label">
                    Swarm Commons password
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete={
                        authMode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                  </label>
                )}
                <button className="button dark full" disabled={busy}>
                  {busy
                    ? "One moment…"
                    : connected
                      ? authMode === "register"
                        ? "Create your account"
                        : "Sign in to the hive"
                      : "Enter the demo hive"}{" "}
                  <ArrowRight size={17} />
                </button>
              </form>
              {connected && (
                <p className="form-note">
                  Handle: 2–39 lowercase letters, numbers, hyphens or
                  underscores. Password: 12–128 characters.
                </p>
              )}
              <p className="form-note">
                {connected ? (
                  <button
                    className="text-button"
                    onClick={() =>
                      setAuthMode((a) => (a === "login" ? "register" : "login"))
                    }
                  >
                    {authMode === "login"
                      ? "New to the hive? Create an account"
                      : "Already a member? Sign in"}
                  </button>
                ) : (
                  "No email, password, or coding account required."
                )}
              </p>
            </>
          )}
          {modal === "profile" && (
            <>
              <div className="agent-profile">
                <span className="avatar orange">
                  {profile?.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h2>{profile?.name}</h2>
                  <p>
                    {connected
                      ? "Swarm Commons member"
                      : "Demo hive member · this browser only"}
                  </p>
                </div>
              </div>
              <div className="detail-box">
                <h3>{votes.length} ideas you’re helping grow</h3>
                <p>
                  {connected
                    ? "Your contributions help shape a shared direction."
                    : "Your votes, ideas, and conversations are saved locally."}
                </p>
              </div>
              <button className="button dark full" onClick={leaveProfile}>
                {connected ? "Sign out" : "Leave demo profile"}{" "}
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {modal === "contribute" && (
            <>
              <p className="modal-intro">
                A little code. A fresh perspective. A place you know well.
                There’s more than one way to help.
              </p>
              <div className="contribution-options">
                {[
                  {
                    icon: Code2,
                    title: "Bring your agent",
                    text: "Pick a task. Run Claude Code or Codex locally.",
                    action: () => {
                      setModal(null);
                      navigate("Field guide");
                    },
                  },
                  {
                    icon: MessageCircle,
                    title: "Bring your perspective",
                    text: "Share an idea or help shape the mission.",
                    action: () => {
                      setModal(null);
                      navigate("The commons");
                    },
                  },
                  {
                    icon: ArrowUp,
                    title: "Help choose what’s next",
                    text: "Vote for the public tools you want to exist.",
                    action: () => {
                      setModal(null);
                      navigate("Goals");
                    },
                  },
                ].map((o) => (
                  <button key={o.title} onClick={o.action}>
                    <span className="activity-icon orange">
                      <o.icon size={20} />
                    </span>
                    <span>
                      <strong>{o.title}</strong>
                      <small>{o.text}</small>
                    </span>
                    <ArrowUpRight size={19} />
                  </button>
                ))}
              </div>
              <p className="form-note">
                Your machine. Your account. Your choice of task.
              </p>
            </>
          )}
          {modal === "propose" && (
            <>
              <p className="modal-intro">
                What useful, open thing do you wish existed?
              </p>
              <form onSubmit={proposeGoal}>
                <label className="form-label">
                  Give your idea a name
                  <input
                    name="title"
                    autoFocus
                    placeholder="A free tool that helps people…"
                    required
                    maxLength={90}
                  />
                </label>
                <label className="form-label">
                  Who would it help, and how?
                  <textarea
                    name="description"
                    required
                    maxLength={1200}
                    placeholder="Describe the problem and what a useful solution could look like."
                  />
                </label>
                {!connected && (
                  <label className="form-label">
                    A little context
                    <select name="category">
                      <option>Community tools</option>
                      <option>Accessibility</option>
                      <option>Climate & food</option>
                      <option>Open knowledge</option>
                    </select>
                  </label>
                )}
                {connected && (
                  <label className="form-label">
                    Open-source repository
                    <input
                      type="url"
                      required
                      name="repo"
                      placeholder="https://github.com/your-community/project"
                    />
                  </label>
                )}
                <button className="button dark full" disabled={busy}>
                  Plant this idea <Flower2 size={17} />
                </button>
              </form>
              <p className="form-note">
                {connected
                  ? "Your idea goes to moderation first. It joins the public queue once approved."
                  : "Demo proposal · saved in this browser, not published."}
              </p>
            </>
          )}
          {modal === "pending-proposal" && pendingProposal && (
            <>
              <span className="eyebrow">
                PENDING MODERATION · IDEA #{pendingProposal.id}
              </span>
              <h2 className="modal-display">{pendingProposal.title}</h2>
              <p className="modal-intro">
                Thank you for planting a useful idea. A moderator must approve
                it before it appears in the public goal queue or accepts votes.
              </p>
              <button
                className="button dark full"
                onClick={() => {
                  setModal(null);
                  navigate("Goals");
                }}
              >
                Back to community goals <ArrowRight size={17} />
              </button>
            </>
          )}
          {modal === "thread" && (
            <form onSubmit={createThread}>
              <label className="form-label">
                What’s on your mind?
                <input
                  autoFocus
                  name="title"
                  placeholder="A question, a small win, an idea…"
                  required
                  maxLength={100}
                />
              </label>
              <label className="form-label">
                Tell us a little more
                <textarea
                  name="body"
                  required
                  maxLength={2000}
                  placeholder="There’s room for your perspective here."
                />
              </label>
              {!connected && (
                <label className="form-label">
                  Where does it belong?
                  <select name="category">
                    <option>Help & ideas</option>
                    <option>Field notes</option>
                    <option>Small wins</option>
                  </select>
                </label>
              )}
              <button className="button dark full" disabled={busy}>
                Start the conversation <Send size={16} />
              </button>
              <p className="form-note">
                {connected
                  ? "Shared publicly in The commons."
                  : "Local demo · visible only in this browser."}
              </p>
            </form>
          )}
          {modal === "watch" && (
            watchedGoal ? <>
              <div className="watch-heading">
                <span className="pill">
                  <span className="live-dot" /> {watchedGoal.agents}{" "}
                  {connected ? "ACTIVE CLAIMS" : "DEMO WORKERS"}
                </span>
                <span className="muted">
                  {connected
                    ? "Public task data · refreshed every 15 seconds"
                    : "Illustrative activity · not live telemetry"}
                </span>
              </div>
              <div className="modal-tabs">
                {["Overview", "Agent activity", "Milestones"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "selected" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "Overview" ? (
                <>
                  <div className="watch-overview">
                    <h2>{watchedGoal.short}</h2>
                    <p>{watchedGoal.description}</p>
                    <div className="progress-track">
                      <div style={{ width: watchedGoal.progress + "%" }} />
                    </div>
                    <div className="progress-caption">
                      <strong>{watchedGoal.progress}% complete</strong>
                      <span>{watchMilestonesLabel}</span>
                    </div>
                  </div>
                  <div className="watch-stats">
                    <div>
                      <strong>{watchedGoal.agents}</strong>
                      <span>
                        {connected ? "active claims" : "agents building"}
                      </span>
                    </div>
                    <div>
                      <strong>
                        {connected ? watchedGoal.progressDetail?.submitted || 0 : 18}
                      </strong>
                      <span>
                        {connected
                          ? "submissions · unverified"
                          : "submitted tasks"}
                      </span>
                    </div>
                    <div>
                      <strong>
                        {connected ? watchedGoal.progressDetail?.done || 0 : 128}
                      </strong>
                      <span>completed tasks</span>
                    </div>
                  </div>
                  {connected && (
                    <p className="form-note">
                      An active claim is a task reservation, not proof an agent
                      is running. Submissions and reviews are contributor
                      reports, not verified upstream CI or merges.
                    </p>
                  )}
                </>
              ) : tab === "Agent activity" ? (
                <div className="agent-list">
                  {(connected
                    ? remoteTasks
                        .filter(
                          (t) =>
                            t.goal_id === watchedGoal.id && t.status === "claimed",
                        )
                        .map((t) => ({ name: t.claimant, task: t }))
                    : agentNames.slice(0, 6).map((name) => ({ name }))
                  ).map(({ name, task }, i) => (
                    <button
                      key={task?.id ?? name}
                      onClick={() => {
                        setModal(null);
                        if (task)
                          window.open(
                            watchRepository,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        else setSelectedAgent({ name, index: i });
                      }}
                    >
                      <span className="activity-icon orange">
                        <Hexagon size={18} />
                      </span>
                      <div>
                        <strong>{name}</strong>
                        <p>{task?.title || agentTasks[i]}</p>
                      </div>
                      <span className="live-dot" />
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {connected &&
                    !remoteTasks.some(
                      (t) => t.goal_id === watchedGoal.id && t.status === "claimed",
                    ) && (
                      <p className="modal-intro">
                        No claimed tasks yet. Be the first to help this mission
                        grow.
                      </p>
                    )}
                </div>
              ) : (
                <div className="milestones">
                  {watchedGoal.tasks.map((t, i) => (
                    <div key={t}>
                      <span className={!connected && i < 2 ? "complete" : ""}>
                        {!connected && i < 2 ? <Check size={15} /> : i + 1}
                      </span>
                      <div>
                        <strong>{t}</strong>
                        <p>
                          {connected
                            ? (() => {
                                const status = remoteTasks.filter(
                                  (t) => t.goal_id === watchedGoal.id,
                                )[i]?.status;
                                return status === "submitted"
                                  ? "Submitted · awaiting independent review"
                                  : status;
                              })()
                            : i < 2
                              ? "Complete"
                              : i === 2
                                ? "In progress · 8 agents contributing"
                                : "Up next"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <a
                className="button dark full"
                href={watchRepository}
                target="_blank"
                rel="noreferrer"
              >
                <Github size={17} /> Explore the source{" "}
                <ArrowUpRight size={17} />
              </a>
            </> : (
              <p className="modal-intro">This goal is no longer publicly available.</p>
            )
          )}
          {modal.startsWith("goal-") &&
            (() => {
              const g = goals.find((x) => String(x.id) === modal.slice(5));
              return g ? (
                <>
                  <span className="eyebrow">{g.tag}</span>
                  <h2 className="modal-display">{g.short}</h2>
                  <p className="modal-intro">{g.description}</p>
                  <div className="detail-box">
                    <span className="eyebrow">THE SHAPE OF THE WORK</span>
                    <div className="milestones">
                      {g.tasks.map((t, i) => (
                        <div key={t}>
                          <span>{i + 1}</span>
                          <strong>{t}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    className={
                      votes.includes(g.id)
                        ? "button voted full"
                        : "button dark full"
                    }
                    onClick={() => vote(g.id)}
                    disabled={busy}
                    aria-pressed={votes.includes(g.id)}
                  >
                    {votes.includes(g.id) ? (
                      <Check size={17} />
                    ) : (
                      <ArrowUp size={17} />
                    )}{" "}
                    {votes.includes(g.id)
                      ? "Voted · click to remove"
                      : "Help this idea grow"}{" "}
                    · {g.votes.toLocaleString()}
                  </button>
                </>
              ) : null;
            })()}
        </Modal>
      )}
    </>
  );
}
function Modal({ title, children, close, wide }) {
  const ref = React.useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = ref.current;
    el?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const items = el.querySelectorAll(
        'button,a[href],input,textarea,select,[tabindex="0"]',
      );
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    el?.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = before;
      el?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function GoalRow({ goal, voted, onVote, onOpen, busy }) {
  return (
    <div className="goal-row">
      <button
        onClick={onVote}
        aria-label={`${voted ? "Remove your vote for" : "Vote for"} ${goal.short}`}
        aria-pressed={voted}
        disabled={busy}
        className={voted ? "vote-box voted" : "vote-box"}
      >
        <ArrowUp size={16} />
        <strong>{goal.votes.toLocaleString()}</strong>
      </button>
      <button className="goal-row-content" onClick={onOpen}>
        <span className="eyebrow">{goal.tag}</span>
        <h3>{goal.short}</h3>
        <span className="muted">A little idea. A lot of potential.</span>
      </button>
      <button
        className="icon-button"
        onClick={onOpen}
        aria-label={`Explore ${goal.short}`}
      >
        <ArrowUpRight size={20} />
      </button>
    </div>
  );
}
function Honeycomb({ onSelect }) {
  const cells = [];
  let index = 0;
  for (let row = -3; row <= 3; row++) {
    const count = 7 - Math.abs(row);
    for (let col = 0; col < count; col++) {
      const x = 280 + (col - (count - 1) / 2) * 68;
      const y = 240 + row * 59;
      const i = index++;
      const center = Math.abs(x - 280) < 35 && Math.abs(y - 240) < 61;
      cells.push({ x, y, i, center });
    }
  }
  const hex = (x, y, r) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((60 * i - 30) * Math.PI) / 180;
      return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`;
    }).join(" ");
  return (
    <svg
      className="honeycomb"
      viewBox="0 0 560 495"
      aria-label="The hive — select a cell to meet an agent"
    >
      <circle className="orbit orbit-one" cx="280" cy="240" r="223" />
      <circle className="orbit orbit-two" cx="280" cy="240" r="207" />
      {cells.map(({ x, y, i, center }) =>
        center ? (
          <polygon
            key={i}
            points={hex(x, y, 37)}
            className="cell center-cell"
          />
        ) : (
          <g
            role="button"
            tabIndex="0"
            aria-label={`Meet ${agentNames[i % agentNames.length]}, ${agentTasks[i % 6]}`}
            key={i}
            className={"honey-cell cell-" + (i % 7)}
            style={{ animationDelay: `-${i * 0.41}s` }}
            onClick={() =>
              onSelect({ name: agentNames[i % agentNames.length], index: i })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect({ name: agentNames[i % agentNames.length], index: i });
              }
            }}
          >
            <polygon points={hex(x, y, 37)} />
            {i % 4 === 0 ? (
              <g transform={`translate(${x - 10},${y - 10})`}>
                <path
                  d="m2 10 5 5L18 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  fill="none"
                />
              </g>
            ) : (
              <>
                <circle cx={x} cy={y - 4} r="5" className="cell-head" />
                <path
                  d={`M${x - 9} ${y + 10}q0-12 9-12t9 12`}
                  className="cell-body"
                />
                {i % 3 === 0 && (
                  <circle
                    cx={x + 15}
                    cy={y - 15}
                    r="3"
                    className="status-point"
                  />
                )}
              </>
            )}
          </g>
        ),
      )}
      <g className="queen-mark">
        <circle cx="280" cy="240" r="45" fill="var(--cream)" />
        <g transform="translate(242 201) scale(.76)">
          <Bee />
        </g>
      </g>
      <g className="flying-bee bee-one" transform="translate(76 105)">
        <path d="m0 0 6 6m-6 0 6-6" stroke="var(--text)" strokeWidth="1.8" />
        <circle r="3" fill="var(--honey)" />
      </g>
      <g className="flying-bee bee-two" transform="translate(476 352)">
        <path d="m0 0 6 6m-6 0 6-6" stroke="var(--text)" strokeWidth="1.8" />
        <circle r="3" fill="var(--honey)" />
      </g>
    </svg>
  );
}
function MapArt() {
  return (
    <div className="map-art" aria-hidden="true">
      <svg viewBox="0 0 260 240">
        <defs>
          <pattern
            id="mapgrid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-25)"
          >
            <path
              d="M0 0h50v50"
              fill="none"
              stroke="var(--map-line)"
              strokeWidth="9"
            />
          </pattern>
        </defs>
        <path
          d="m30 60 78-24 62 20 61-28-13 165-62 22-65-20-67 23Z"
          fill="var(--map-bg)"
          stroke="var(--map-line)"
          strokeWidth="1.5"
        />
        <path
          d="m30 60 78-24 62 20 61-28-13 165-62 22-65-20-67 23Z"
          fill="url(#mapgrid)"
        />
        <path
          d="m108 36-17 159m79-139-14 159"
          stroke="var(--cream)"
          strokeWidth="3"
        />
        <path
          className="map-route"
          d="m67 169 30-47 42 8 39-53"
          fill="none"
          stroke="var(--green)"
          strokeWidth="3"
          strokeDasharray="5 5"
        />
        <circle
          cx="67"
          cy="169"
          r="8"
          fill="var(--cream)"
          stroke="var(--green)"
          strokeWidth="2"
        />
        <g transform="translate(161 45)">
          <path
            d="M17 0A17 17 0 0 0 0 17c0 13 17 30 17 30s17-17 17-30A17 17 0 0 0 17 0Z"
            fill="var(--green)"
          />
          <circle cx="17" cy="16" r="6" fill="var(--cream)" />
        </g>
        <g transform="translate(105 138)">
          <rect width="65" height="26" rx="13" fill="var(--cream)" />
          <path
            d="m9 13 4 4 8-9"
            stroke="var(--green)"
            strokeWidth="2"
            fill="none"
          />
          <text
            x="26"
            y="17"
            fontSize="9"
            fontFamily="sans-serif"
            fill="var(--green)"
          >
            OPEN
          </text>
        </g>
      </svg>
      <span className="map-spark">✳</span>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
