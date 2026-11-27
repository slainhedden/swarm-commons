import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowUp,
  Terminal,
  FolderOpen,
  MessageSquare,
  Globe,
  Users,
  Github,
  Volume2,
  Settings,
  Plus,
  Check,
  Copy,
  Monitor,
  MousePointer2,
  Heart,
  Zap,
  Search,
  ExternalLink,
} from "lucide-react";
import "./style.css";
import PlatformBrowser from "./PlatformBrowser";
import { API_BASE } from "./api";
import { readStored, updateStored } from "./demoStorage";

const REPO = "https://github.com/slainhedden/swarm-commons";
const SESSION =
  "https://app.devin.ai/sessions/a3a22edd0d644a62a6799ec37b00acdc";
const initialGoals = [
  {
    id: 1,
    title: "Make public research actually public.",
    description:
      "An open-source research library that brings open-access papers into one searchable, accessible home. Built by all of us. Owned by no one.",
    category: "OPEN KNOWLEDGE",
    votes: 1248,
    tasks: 42,
    done: 28,
    agents: 128,
  },
  {
    id: 2,
    title: "A simpler way to find local mutual aid",
    description:
      "A community-owned directory connecting neighbors to food, shelter, and the people who can help.",
    category: "COMMUNITY TOOLS",
    votes: 846,
    tasks: 24,
    done: 0,
    agents: 0,
  },
  {
    id: 3,
    title: "Open source accessibility checker",
    description:
      "Give every small website a free, practical accessibility audit with fixes people can actually use.",
    category: "ACCESSIBILITY",
    votes: 632,
    tasks: 18,
    done: 0,
    agents: 0,
  },
  {
    id: 4,
    title: "Map the world’s public drinking water",
    description:
      "A free, open map of drinking fountains and water refill stations, maintained by the community.",
    category: "PUBLIC GOOD",
    votes: 419,
    tasks: 20,
    done: 0,
    agents: 0,
  },
];
const initialThreads = [
  {
    id: 1,
    tag: "IDEAS",
    tone: "pink",
    title: "What should we build after the research library?",
    body: "Small tools can make a big difference. What’s one thing your community needs that doesn’t exist yet?",
    author: "pixelpusher",
    avatar: "P",
    time: "12 min ago",
    replies: 24,
  },
  {
    id: 2,
    tag: "BUILD LOG",
    tone: "green",
    title: "We just made 10,000 papers searchable :)",
    body: "The first indexing milestone is here. Huge thanks to everyone who reviewed metadata and worked on the search pipeline.",
    author: "mira.codes",
    avatar: "M",
    time: "38 min ago",
    replies: 18,
  },
  {
    id: 3,
    tag: "HELP WANTED",
    tone: "blue",
    title: "First time here? Grab a good first task.",
    body: "Start with documentation, a small bug, or a test. You choose the task and run your own signed-in agent locally. There’s room for everyone.",
    author: "sam.builds",
    avatar: "S",
    time: "1 hr ago",
    replies: 12,
  },
];
const agentEvents = [
  {
    name: "claude-042",
    task: "Improving search relevance",
    status: "building",
    color: "green",
  },
  {
    name: "codex-019",
    task: "Reviewing metadata parser",
    status: "reviewing",
    color: "pink",
  },
  {
    name: "claude-081",
    task: "Adding keyboard navigation",
    status: "building",
    color: "green",
  },
  {
    name: "codex-036",
    task: "Writing integration tests",
    status: "testing",
    color: "yellow",
  },
];
function useStored(key, fallback) {
  const [value, setValue] = useState(() => readStored(key, fallback));
  const current = useRef(value);
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== key && event.key !== null) return;
      current.current = readStored(key, fallback);
      setValue(current.current);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, fallback]);
  return [value, (update) => {
    current.current = updateStored(key, update, current.current);
    setValue(current.current);
  }];
}
function Smile({ size = 88 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="#e8fd6f"
        stroke="currentColor"
        strokeWidth="4"
      />
      <ellipse cx="35" cy="38" rx="4.5" ry="8" fill="currentColor" />
      <ellipse cx="65" cy="38" rx="4.5" ry="8" fill="currentColor" />
      <path
        d="M25 57c9 25 41 25 50 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function PixelMark({ small = false }) {
  return (
    <span className={`pixel-mark ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function Window({ title, children, className = "", id, onMinimize }) {
  return (
    <section className={`window ${className}`} id={id}>
      <header className="window-bar">
        <span>
          <span className="tiny-box" /> {title}
        </span>
        <div className="window-controls">
          <button onClick={onMinimize} aria-label={`Minimize ${title}`}>
            _
          </button>
          <button onClick={onMinimize} aria-label={`Close ${title}`}>
            ×
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}
function App() {
  const [page, setPage] = useState(API_BASE ? "platform" : "desktop");
  const [modal, setModal] = useState(null);
  const [user, setUser] = useStored("swarm-retro-user", null);
  const [votes, setVotes] = useStored("swarm-retro-votes", []);
  const [goals, setGoals] = useStored("swarm-retro-goals", initialGoals);
  const [threads, setThreads] = useStored(
    "swarm-retro-threads",
    initialThreads,
  );
  const [replies, setReplies] = useStored("swarm-retro-replies", {});
  const [hidden, setHidden] = useState([]);
  const [start, setStart] = useState(false);
  const [theme, setTheme] = useStored("swarm-retro-theme", "lavender");
  const [toast, setToast] = useState("");
  const [selectedGoal, setSelectedGoal] = useState(initialGoals[0]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [provider, setProvider] = useState("Claude Code");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("Popular");
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const close = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const focusable = [
          ...document.querySelectorAll(
            ".modal button,.modal input,.modal textarea,.modal select,.modal a[href]",
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", close);
    document
      .querySelector(".modal input,.modal textarea,.modal button")
      ?.focus();
    return () => {
      document.removeEventListener("keydown", close);
      previous?.focus();
    };
  }, [modal]);
  const notify = (text) => setToast(text);
  const show = (id) => {
    setHidden((h) => h.filter((x) => x !== id));
  };
  const hide = (id) => setHidden((h) => [...h, id]);
  const navigate = (p) => {
    setPage(p);
    setStart(false);
    setSearch("");
    setHidden([]);
  };
  const vote = (id) => {
    if (!user) {
      setModal("login");
      return;
    }
    setVotes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  };
  const openGoal = (goal) => {
    setSelectedGoal(goal);
    setModal("goal");
  };
  const openThread = (thread) => {
    setSelectedThread(thread);
    setModal("thread");
  };
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied to your clipboard.");
    } catch {
      notify("Clipboard unavailable — select and copy the text.");
    }
  };
  const goal = goals[0];
  const sortedGoals = [...goals]
    .filter((g) =>
      `${g.title} ${g.category}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Newest"
        ? b.id - a.id
        : b.votes +
          Number(votes.includes(b.id)) -
          (a.votes + Number(votes.includes(a.id))),
    );
  const brief = `Goal: ${selectedGoal.title}\n\n${selectedGoal.description}\n\nSuggested first task: Review the project documentation and propose a small, testable improvement. Use your own signed-in ${provider} locally. Review all changes before opening a pull request.\n\nRepository: ${REPO}`;
  return (
    <div className={`app theme-${theme}`}>
      <div className="system-top">
        <span>
          <span className="online-dot" /> ALL SYSTEMS COLLABORATIVE
        </span>
        <span>
          GOOD THINGS ARE A GROUP PROJECT.
          <span className="top-version"> v.0.1 / COMMUNITY PREVIEW</span>
        </span>
      </div>
      <div className="desktop-shell">
        <aside className="desktop-icons" aria-label="Desktop shortcuts">
          <button
            className={page === "desktop" ? "selected" : ""}
            onClick={() => navigate("desktop")}
          >
            <span className="desktop-icon purple">
              <Monitor />
            </span>
            <span>My swarm</span>
          </button>
          <button
            className={page === "goals" ? "selected" : ""}
            onClick={() => navigate("goals")}
          >
            <span className="desktop-icon yellow">
              <FolderOpen />
            </span>
            <span>Goal queue</span>
          </button>
          <button
            className={page === "forum" ? "selected" : ""}
            onClick={() => navigate("forum")}
          >
            <span className="desktop-icon pink">
              <MessageSquare />
            </span>
            <span>Town square</span>
          </button>
          <button onClick={() => setModal("guide")}>
            <span className="desktop-icon green">
              <Terminal />
            </span>
            <span>Read me.txt</span>
          </button>
          <a href={REPO} target="_blank" rel="noreferrer">
            <span className="desktop-icon gray">
              <Github />
            </span>
            <span>The source</span>
          </a>
          <div className="side-bottom">
            <span>
              made for
              <br />
              the commons.
            </span>
            <Heart size={18} />
          </div>
        </aside>
        <main>
          <nav className="main-nav">
            <button className="wordmark" onClick={() => navigate("desktop")}>
              <PixelMark small /> swarm.exe<span>™</span>
            </button>
            <div className="nav-links">
              <button
                className={page === "goals" ? "active" : ""}
                onClick={() => navigate("goals")}
              >
                {API_BASE ? "Demo goals" : "The goals"}
              </button>
              <button
                className={page === "forum" ? "active" : ""}
                onClick={() => navigate("forum")}
              >
                {API_BASE ? "Demo people" : "The people"}
              </button>
              <button onClick={() => setModal("guide")}>
                How it works <ArrowUpRight size={14} />
              </button>
            </div>
            <button
              className="retro-button login"
              onClick={() =>
                API_BASE
                  ? navigate("platform")
                  : setModal(user ? "account" : "login")
              }
            >
              <Users size={15} />
              {API_BASE ? "Live account" : user ? user.name : "Demo profile"}
              <ArrowUpRight size={14} />
            </button>
          </nav>
          <header className="desktop-heading">
            <div>
              <div className="eyebrow">
                WELCOME TO THE INTERNET’S SHARED WORKSPACE
              </div>
              <h1>
                {page === "goals" ? (
                  "Big ideas. Open queue."
                ) : page === "forum" ? (
                  "The human side of the swarm."
                ) : (
                  <>
                    A little spare compute.
                    <br />
                    <span>A lot of collective good.</span>
                  </>
                )}
              </h1>
              <p>
                {page === "desktop"
                  ? "Your agent. Our next big thing. Let’s build something useful, together."
                  : page === "goals"
                    ? "Propose something useful. Vote for what matters. Help make it happen."
                    : "Pull up a chair. Share an idea. Find your people."}
              </p>
            </div>
            <div className="hero-sticker">
              <Smile size={88} />
              <span>
                less scrolling.
                <br />
                more building.
              </span>
              <MousePointer2 className="sticker-cursor" size={36} />
            </div>
          </header>
          <div className="workspace-toolbar">
            <div className="tab-group">
              {[
                ["desktop", "Desktop"],
                ["goals", "Goal queue"],
                ["forum", "Town square"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={page === id ? "active" : ""}
                  onClick={() => navigate(id)}
                >
                  {API_BASE ? `Demo ${label}` : label}
                  {id === "goals" && <span>{goals.length}</span>}
                </button>
              ))}
              {API_BASE && (
                <button
                  className={`platform-tab ${page === "platform" ? "active" : ""}`}
                  onClick={() => navigate("platform")}
                >
                  Platform <ArrowUpRight size={11} />
                </button>
              )}
            </div>
            <span className="demo-indicator">
              <span className="online-dot" />{" "}
              {page === "platform" ? "LIVE PLATFORM" : "DEMO WORKSPACE"}{" "}
              <span
                className="info-help"
                title={
                  page === "platform"
                    ? "Connected to the real shared platform. Other tabs are local demo content."
                    : "Sample community activity. Your votes and posts are saved in this browser only."
                }
              >
                ?
              </span>
            </span>
          </div>
          {page === "platform" && (
            <PlatformBrowser
              onDemo={() => navigate("desktop")}
              notify={notify}
            />
          )}
          {page === "desktop" && (
            <>
              <div className="top-grid">
                {!hidden.includes("goal") && (
                  <Window
                    title="the_current_mission.txt"
                    className="mission-window"
                    onMinimize={() => hide("goal")}
                  >
                    <div className="mission-content">
                      <div className="mission-label">
                        <span className="tag green">
                          <span className="online-dot" /> NOW BUILDING
                        </span>
                        <span>GOAL_001</span>
                      </div>
                      <h2>{goal.title}</h2>
                      <p className="mission-description">{goal.description}</p>
                      <div className="mission-meta">
                        <span>
                          <Globe size={15} /> Open knowledge
                        </span>
                        <span>
                          <Users size={15} /> 128 agents running
                        </span>
                      </div>
                      <div className="progress-label">
                        <span>GOOD THINGS TAKE A LITTLE TEAMWORK</span>
                        <b>67%</b>
                      </div>
                      <div
                        className="segmented-progress"
                        aria-label="67 percent complete"
                      >
                        <div style={{ width: "67%" }} />
                      </div>
                      <div className="progress-footer">
                        <span>28 of 42 tasks completed</span>
                        <button onClick={() => openGoal(goal)}>
                          View the roadmap <ArrowUpRight size={13} />
                        </button>
                      </div>
                      <div className="mission-actions">
                        <button
                          className="retro-button primary"
                          onClick={() => {
                            setSelectedGoal(goal);
                            setModal("join");
                          }}
                        >
                          Put your agent to work <ArrowUpRight size={17} />
                        </button>
                        <button
                          className="retro-button"
                          onClick={() => setModal("watch")}
                        >
                          <span className="record-dot" /> Watch the swarm
                        </button>
                        <a
                          className="repo-button"
                          href={REPO}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open the swarm repository"
                        >
                          <Github size={21} />
                        </a>
                      </div>
                    </div>
                    <div className="window-status">
                      <span>★ COMMUNITY PICK</span>
                      <span>1,248 people believe in this.</span>
                    </div>
                  </Window>
                )}
                {!hidden.includes("activity") && (
                  <Window
                    title="swarm_monitor.exe"
                    className="monitor-window"
                    onMinimize={() => hide("activity")}
                  >
                    <div className="monitor-top">
                      <span>
                        <span className="online-dot" /> SAMPLE ACTIVITY
                      </span>
                      <span className="monitor-bars">▂▄▆█</span>
                    </div>
                    <div className="globe-display">
                      <svg viewBox="0 0 300 150" aria-hidden="true">
                        <defs>
                          <radialGradient id="glow">
                            <stop stopColor="#9bebad" stopOpacity=".18" />
                            <stop
                              offset="1"
                              stopColor="#9bebad"
                              stopOpacity="0"
                            />
                          </radialGradient>
                        </defs>
                        <ellipse
                          cx="150"
                          cy="77"
                          rx="108"
                          ry="72"
                          fill="url(#glow)"
                        />
                        <g stroke="#80b595" fill="none" opacity=".65">
                          <ellipse cx="150" cy="77" rx="94" ry="60" />
                          <ellipse cx="150" cy="77" rx="67" ry="60" />
                          <ellipse cx="150" cy="77" rx="28" ry="60" />
                          <ellipse cx="150" cy="77" rx="94" ry="25" />
                          <ellipse cx="150" cy="77" rx="94" ry="46" />
                          <path d="M56 77h188M150 17v120" />
                        </g>
                        <g fill="#caff90">
                          {[
                            [89, 43],
                            [128, 84],
                            [202, 64],
                            [174, 114],
                            [74, 96],
                            [166, 37],
                            [225, 91],
                          ].map(([cx, cy], i) => (
                            <g key={i}>
                              <circle cx={cx} cy={cy} r="7" opacity=".15" />
                              <rect
                                x={cx - 2}
                                y={cy - 2}
                                width="4"
                                height="4"
                              />
                            </g>
                          ))}
                        </g>
                        <path
                          d="M89 43L128 84 202 64 174 114M166 37L128 84 74 96"
                          stroke="#d8ff9a"
                          fill="none"
                          strokeDasharray="3 4"
                          opacity=".7"
                        />
                      </svg>
                      <div className="globe-caption">
                        <strong>128</strong>
                        <span>agents. one shared goal.</span>
                      </div>
                    </div>
                    <div className="agent-list">
                      {agentEvents.slice(0, 3).map((a) => (
                        <button
                          className="agent-row"
                          key={a.name}
                          onClick={() => setModal("watch")}
                        >
                          <span className={`agent-pixel ${a.color}`}>⌘</span>
                          <span>
                            <b>{a.name}</b>
                            <small>{a.task}</small>
                          </span>
                          <i className={`status-dot ${a.color}`} />
                        </button>
                      ))}
                    </div>
                    <button
                      className="monitor-bottom"
                      onClick={() => setModal("watch")}
                    >
                      Open activity monitor <ArrowUpRight size={14} />
                    </button>
                  </Window>
                )}
              </div>
              <div className="stats-strip">
                <div>
                  <span className="stat-icon pink">
                    <Users size={23} />
                  </span>
                  <p>
                    <strong>2,408</strong>
                    <span>humans in the loop</span>
                  </p>
                </div>
                <div>
                  <span className="stat-icon yellow">
                    <Zap size={23} />
                  </span>
                  <p>
                    <strong>128</strong>
                    <span>agents doing their thing</span>
                  </p>
                </div>
                <div>
                  <span className="stat-icon green">
                    <FolderOpen size={23} />
                  </span>
                  <p>
                    <strong>16</strong>
                    <span>good things shipped</span>
                  </p>
                </div>
                <div className="stats-note">
                  No big tech. No big ego.
                  <br />
                  <b>Just a really good group project.</b>
                  <span>Illustrative community stats</span>
                </div>
              </div>
              <div className="bottom-grid">
                {!hidden.includes("queue") && (
                  <Window
                    title="what_should_we_build_next?"
                    className="queue-window"
                    onMinimize={() => hide("queue")}
                  >
                    <div className="section-intro">
                      <div>
                        <h3>The next big little thing.</h3>
                        <p>The community decides what’s worth building.</p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Propose a goal"
                        onClick={() => setModal(user ? "propose" : "login")}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="queue-list">
                      {goals.slice(1, 4).map((g, i) => (
                        <div className="queue-row" key={g.id}>
                          <button
                            className={`vote-button ${votes.includes(g.id) ? "voted" : ""}`}
                            onClick={() => vote(g.id)}
                            aria-label={`Vote for ${g.title}`}
                            aria-pressed={votes.includes(g.id)}
                          >
                            <ArrowUp size={16} />
                            <b>{g.votes + Number(votes.includes(g.id))}</b>
                          </button>
                          <button
                            className="queue-title"
                            onClick={() => openGoal(g)}
                          >
                            <span className={`small-category c${i}`}>
                              {g.category}
                            </span>
                            <h4>{g.title}</h4>
                          </button>
                          <ArrowUpRight size={16} />
                        </div>
                      ))}
                    </div>
                    <button
                      className="window-bottom-link"
                      onClick={() => navigate("goals")}
                    >
                      Explore the goal queue <ArrowUpRight size={14} />
                    </button>
                  </Window>
                )}
                {!hidden.includes("forum") && (
                  <Window
                    title="town_square.bbs"
                    className="forum-window"
                    onMinimize={() => hide("forum")}
                  >
                    <div className="section-intro">
                      <div>
                        <h3>People, not just prompts.</h3>
                        <p>Good ideas start with a conversation.</p>
                      </div>
                      <MessageSquare size={23} />
                    </div>
                    {threads.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        className="thread-preview"
                        onClick={() => openThread(t)}
                      >
                        <span className={`avatar ${t.tone}`}>{t.avatar}</span>
                        <span className="thread-summary">
                          <span className={`small-category ${t.tone}`}>
                            {t.tag}
                          </span>
                          <b>{t.title}</b>
                          <small>
                            {t.author} <span>·</span> {t.time}
                          </small>
                        </span>
                        <span className="reply-count">
                          <MessageSquare size={12} />
                          {t.replies + (replies[t.id]?.length || 0)}
                        </span>
                      </button>
                    ))}
                    <button
                      className="window-bottom-link"
                      onClick={() => navigate("forum")}
                    >
                      Meet us in the town square <ArrowUpRight size={14} />
                    </button>
                  </Window>
                )}
              </div>
            </>
          )}
          {page === "goals" && (
            <Window
              title="community_goal_queue.exe"
              className="full-window"
              onMinimize={() => navigate("desktop")}
            >
              <div className="list-toolbar">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a good thing to build…"
                    aria-label="Search goals"
                  />
                </label>
                <div className="list-actions">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="Sort goals"
                  >
                    <option>Popular</option>
                    <option>Newest</option>
                  </select>
                  <button
                    className="retro-button primary"
                    onClick={() => setModal(user ? "propose" : "login")}
                  >
                    <Plus size={16} /> Propose a goal
                  </button>
                </div>
              </div>
              <div className="goals-grid">
                {sortedGoals.map((g) => (
                  <article className="goal-card" key={g.id}>
                    <span className={`tag ${g.id === 1 ? "green" : "pink"}`}>
                      {g.id === 1 ? "NOW BUILDING" : "UP FOR A VOTE"}
                    </span>
                    <span className="eyebrow">{g.category}</span>
                    <button className="plain-goal" onClick={() => openGoal(g)}>
                      <h2>{g.title}</h2>
                    </button>
                    <p>{g.description}</p>
                    <footer>
                      <button
                        className={`retro-button ${votes.includes(g.id) ? "is-voted" : ""}`}
                        onClick={() => vote(g.id)}
                        aria-pressed={votes.includes(g.id)}
                      >
                        <ArrowUp size={16} />
                        {g.votes + Number(votes.includes(g.id))} votes
                      </button>
                      <button className="text-link" onClick={() => openGoal(g)}>
                        Explore <ArrowUpRight size={16} />
                      </button>
                    </footer>
                  </article>
                ))}
                {!sortedGoals.length && (
                  <p className="empty-state">
                    No goals found. Try another search or propose your idea.
                  </p>
                )}
              </div>
            </Window>
          )}
          {page === "forum" && (
            <Window
              title="town_square.bbs — everybody’s welcome"
              className="full-window"
              onMinimize={() => navigate("desktop")}
            >
              <div className="list-toolbar">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search discussions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a conversation…"
                  />
                </label>
                <button
                  className="retro-button primary"
                  onClick={() => setModal(user ? "post" : "login")}
                >
                  <Plus size={16} /> Start a conversation
                </button>
              </div>
              <div className="forum-table">
                {threads
                  .filter((t) =>
                    `${t.title} ${t.body}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <button
                      className="forum-table-row"
                      key={t.id}
                      onClick={() => openThread(t)}
                    >
                      <span className={`avatar ${t.tone}`}>{t.avatar}</span>
                      <span>
                        <span className={`tag ${t.tone}`}>{t.tag}</span>
                        <h3>{t.title}</h3>
                        <p>{t.body}</p>
                        <small>
                          {t.author} · {t.time}
                        </small>
                      </span>
                      <span className="reply-count">
                        <MessageSquare size={16} />
                        {t.replies + (replies[t.id]?.length || 0)}
                      </span>
                    </button>
                  ))}
                {!threads.some((t) =>
                  `${t.title} ${t.body}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ) && (
                  <p className="empty-state">
                    No conversations found. Start a new one?
                  </p>
                )}
              </div>
            </Window>
          )}
          <footer className="site-footer">
            <span>
              <PixelMark small /> Built in the open. Better together.
            </span>
            <div>
              <button onClick={() => setModal("guide")}>Read the manual</button>
              <a href={SESSION} target="_blank" rel="noreferrer">
                Request changes <ArrowUpRight size={11} />
              </a>
              <span>© THE INTERNET, 2026</span>
            </div>
          </footer>
        </main>
      </div>
      {start && (
        <div className="start-menu">
          <header>
            <PixelMark small /> swarm.exe
          </header>
          <button onClick={() => navigate("desktop")}>
            <Monitor size={18} /> My swarm
          </button>
          <button onClick={() => navigate("goals")}>
            <FolderOpen size={18} /> Goal queue
          </button>
          <button onClick={() => navigate("forum")}>
            <MessageSquare size={18} /> Town square
          </button>
          <button
            onClick={() => {
              setModal("settings");
              setStart(false);
            }}
          >
            <Settings size={18} /> Desktop settings
          </button>
          <button
            onClick={() => {
              setModal(user ? "account" : "login");
              setStart(false);
            }}
          >
            <Users size={18} />
            {user ? "My account" : "Log in"}
          </button>
        </div>
      )}
      <footer className="taskbar">
        <button
          className={`start-button retro-button ${start ? "pressed" : ""}`}
          onClick={() => setStart(!start)}
          aria-expanded={start}
        >
          <PixelMark small /> Start
        </button>
        <div className="taskbar-divider" />
        <button className="task-tab active" onClick={() => navigate("desktop")}>
          <Monitor size={15} /> swarm.exe
        </button>
        <button
          className="task-tab"
          onClick={() => {
            show("goal");
            navigate("desktop");
          }}
        >
          ▤ mission.txt
        </button>
        {hidden.length > 0 && (
          <button className="task-tab restore" onClick={() => setHidden([])}>
            Restore windows ({hidden.length})
          </button>
        )}
        <div className="system-tray">
          <button
            onClick={() => setModal("settings")}
            aria-label="Desktop settings"
          >
            <Settings size={15} />
          </button>
          <Volume2 size={16} />
          <span className="online-dot" />
          <time>
            {clock.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={`window modal ${modal === "watch" ? "watch-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <header className="window-bar">
              <span id="dialog-title">
                {
                  {
                    login: "welcome_to_the_swarm.exe",
                    account: "my_account.sys",
                    join: "put_your_agent_to_work.exe",
                    watch: "swarm_monitor.exe — demo feed",
                    goal: "goal_details.txt",
                    propose: "a_good_idea.txt",
                    post: "new_conversation.bbs",
                    thread: "town_square.bbs",
                    guide: "read_me_first.txt",
                    settings: "desktop_settings.sys",
                  }[modal]
                }
              </span>
              <button
                className="close-modal"
                onClick={() => setModal(null)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </header>
            <div className="modal-content">
              {modal === "login" && (
                <>
                  <span className="tag green">HUMANS WELCOME</span>
                  <h2>
                    A good username.
                    <br />A better group project.
                  </h2>
                  <p>
                    This is an interactive design preview. Create a local
                    profile to try voting, posting, and proposing goals. No
                    password or provider credentials needed.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = new FormData(e.currentTarget)
                        .get("name")
                        .trim();
                      if (!name) return;
                      setUser({ name });
                      setModal(null);
                      notify(`Welcome aboard, ${name}.`);
                    }}
                  >
                    <label>
                      Your display name
                      <input
                        name="name"
                        placeholder="e.g. pixelpusher"
                        maxLength={24}
                        required
                        autoComplete="nickname"
                      />
                    </label>
                    <button className="retro-button primary" type="submit">
                      Enter the demo workspace <ArrowUpRight size={16} />
                    </button>
                  </form>
                  <small className="muted">
                    Saved only in this browser. Real authentication comes with
                    the platform.
                  </small>
                </>
              )}
              {modal === "account" && (
                <>
                  <h2>Hey, {user?.name}.</h2>
                  <p>
                    Your local workspace has {votes.length} vote
                    {votes.length !== 1 ? "s" : ""}. Your posts and votes stay
                    in this browser, not on a shared server.
                  </p>
                  <button
                    className="retro-button"
                    onClick={() => {
                      setUser(null);
                      setModal(null);
                      notify("Signed out of the local demo.");
                    }}
                  >
                    Log out
                  </button>
                </>
              )}
              {modal === "guide" && (
                <>
                  <span className="tag yellow">README / V.0.1</span>
                  <h2>
                    Your agent.
                    <br />
                    Our shared progress.
                  </h2>
                  <div className="guide-step">
                    <b>01</b>
                    <div>
                      <h3>Find something worth building.</h3>
                      <p>
                        Browse the goal queue, vote for an idea, or bring one of
                        your own.
                      </p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <b>02</b>
                    <div>
                      <h3>Point your agent at a task.</h3>
                      <p>
                        Run your own signed-in Claude Code or Codex on your
                        computer. Pick the scope. Review its work.
                      </p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <b>03</b>
                    <div>
                      <h3>Ship a little good.</h3>
                      <p>
                        Open a pull request. Share what you learned. The swarm
                        CLI and MCP coordinate work in the platform.
                      </p>
                    </div>
                  </div>
                  <div className="callout">
                    Your account stays yours. No credential pooling. No donated
                    API credits. You control what runs and when.
                  </div>
                  <p className="muted">
                    This site is a UI example with sample community data. Demo
                    changes are local; it is not connected to the platform
                    backend yet.
                  </p>
                  <a
                    className="retro-button"
                    href={REPO}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explore the platform source <ExternalLink size={14} />
                  </a>
                </>
              )}
              {modal === "settings" && (
                <>
                  <h2>Make yourself at home.</h2>
                  <p>A fresh coat of desktop wallpaper.</p>
                  <div className="wallpapers">
                    {[
                      ["lavender", "Lavender haze"],
                      ["mint", "Mint condition"],
                      ["peach", "Peach, please"],
                    ].map(([t, label]) => (
                      <button
                        key={t}
                        className={`wallpaper-swatch ${t} ${theme === t ? "chosen" : ""}`}
                        onClick={() => setTheme(t)}
                        aria-pressed={theme === t}
                      >
                        {theme === t && <Check size={22} />}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <small>Settings are saved in this browser.</small>
                </>
              )}
              {modal === "join" && (
                <>
                  <span className="tag green">
                    A LITTLE HELP GOES A LONG WAY
                  </span>
                  <h2>Bring your own agent.</h2>
                  <p>
                    Contribute to <b>{selectedGoal.title}</b> You stay in
                    control, on your own machine.
                  </p>
                  <div className="provider-options">
                    {["Claude Code", "Codex"].map((p) => (
                      <button
                        className={`retro-button ${provider === p ? "primary" : ""}`}
                        key={p}
                        onClick={() => setProvider(p)}
                        aria-pressed={provider === p}
                      >
                        <Terminal size={16} />
                        {p}
                        {provider === p && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                  <ol className="setup-list">
                    <li>
                      Install and sign in to the official {provider} on your
                      computer.
                    </li>
                    <li>
                      Open the repository, pick an unclaimed issue, and review
                      its scope.
                    </li>
                    <li>
                      Launch{" "}
                      <code>
                        {provider === "Claude Code" ? "claude" : "codex"}
                      </code>{" "}
                      locally and give it the task brief below.
                    </li>
                    <li>Review the changes and submit a pull request.</li>
                  </ol>
                  <pre className="task-brief">{brief}</pre>
                  <div className="modal-actions">
                    <button
                      className="retro-button primary"
                      onClick={() => copy(brief)}
                    >
                      <Copy size={15} /> Copy task brief
                    </button>
                    <a
                      className="retro-button"
                      href={REPO}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open repository <ArrowUpRight size={16} />
                    </a>
                  </div>
                  <div className="callout">
                    Preview only — no agent is started or connected by this
                    page. Never share your subscription credentials.
                  </div>
                </>
              )}
              {modal === "watch" && (
                <>
                  <div className="monitor-heading">
                    <div>
                      <span className="tag green">SIMULATED ACTIVITY</span>
                      <h2>A peek inside the swarm.</h2>
                    </div>
                    <Globe size={40} />
                  </div>
                  <p>
                    Sample agent work for the current community goal. Live
                    platform telemetry will replace this preview feed.
                  </p>
                  <div className="live-table">
                    {agentEvents.map((a, i) => (
                      <div key={a.name}>
                        <span className={`agent-pixel ${a.color}`}>⌘</span>
                        <span>
                          <b>{a.name}</b>
                          <small>{a.task}</small>
                        </span>
                        <span className={`tag ${a.color}`}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                  <div className="terminal-log">
                    <span>swarm_monitor.exe / research-library / demo</span>
                    <p>[demo] 128 agents · 42 tasks · 28 completed</p>
                    <p>[build] search-index / metadata validation complete</p>
                    <p>[test] accessibility / keyboard navigation in review</p>
                    <p>
                      [info] Your credentials stay on your computer.
                      <b className="blink"> ▋</b>
                    </p>
                  </div>
                  <a
                    className="retro-button"
                    href={REPO}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github size={16} /> Explore the real repository{" "}
                    <ArrowUpRight size={16} />
                  </a>
                </>
              )}
              {modal === "goal" && (
                <>
                  <span className="tag green">{selectedGoal.category}</span>
                  <h2>{selectedGoal.title}</h2>
                  <p>{selectedGoal.description}</p>
                  {selectedGoal.id === 1 ? (
                    <>
                      <h3>The roadmap</h3>
                      <div className="roadmap">
                        <p>
                          <Check size={16} /> Paper ingestion & metadata
                          normalization <span>DONE</span>
                        </p>
                        <p>
                          <Check size={16} /> Full-text indexing pipeline{" "}
                          <span>DONE</span>
                        </p>
                        <p>
                          <span className="online-dot" /> Accessible search
                          interface <span>BUILDING</span>
                        </p>
                        <p>
                          □ Community review & public launch{" "}
                          <span>UP NEXT</span>
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="callout">
                      This idea is in the community queue. Vote to help decide
                      what the swarm builds next.
                    </div>
                  )}
                  <div className="modal-actions">
                    <button
                      className={`retro-button ${votes.includes(selectedGoal.id) ? "is-voted" : ""}`}
                      onClick={() => vote(selectedGoal.id)}
                    >
                      <ArrowUp size={16} />
                      {selectedGoal.votes +
                        Number(votes.includes(selectedGoal.id))}{" "}
                      votes
                    </button>
                    <button
                      className="retro-button primary"
                      onClick={() => setModal("join")}
                    >
                      Help build this <ArrowUpRight size={16} />
                    </button>
                  </div>
                </>
              )}
              {modal === "propose" && (
                <>
                  <span className="tag yellow">AN IDEA IS A GOOD START</span>
                  <h2>What should we build?</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      const title = d.get("title").trim(),
                        description = d.get("body").trim();
                      if (!title || !description) return;
                      setGoals((g) => [
                        ...g,
                        {
                          id: Date.now(),
                          title,
                          description,
                          category: d.get("category"),
                          votes: 0,
                          tasks: 0,
                          done: 0,
                          agents: 0,
                        },
                      ]);
                      setModal(null);
                      navigate("goals");
                      setSort("Newest");
                      notify("Your idea is in the local demo queue.");
                    }}
                  >
                    <label>
                      Give your goal a name
                      <input
                        name="title"
                        maxLength={90}
                        placeholder="A free tool that helps people…"
                        required
                      />
                    </label>
                    <label>
                      Who does it help, and how?
                      <textarea
                        name="body"
                        rows={4}
                        maxLength={1000}
                        required
                        placeholder="The problem, the people, and what success looks like."
                      />
                    </label>
                    <label>
                      Category
                      <select name="category">
                        <option>COMMUNITY TOOLS</option>
                        <option>OPEN KNOWLEDGE</option>
                        <option>ACCESSIBILITY</option>
                        <option>PUBLIC GOOD</option>
                      </select>
                    </label>
                    <button className="retro-button primary">
                      Add to the goal queue <Plus size={16} />
                    </button>
                  </form>
                  <small className="muted">
                    Local preview only — your goal is saved in this browser.
                  </small>
                </>
              )}
              {modal === "post" && (
                <>
                  <h2>Start something good.</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      const title = d.get("title").trim(),
                        body = d.get("body").trim();
                      if (!title || !body) return;
                      setThreads((t) => [
                        {
                          id: Date.now(),
                          title,
                          body,
                          tag: d.get("tag"),
                          tone: "pink",
                          author: user.name,
                          avatar: user.name[0].toUpperCase(),
                          time: "just now",
                          replies: 0,
                        },
                        ...t,
                      ]);
                      setModal(null);
                      notify("Posted to your local town square.");
                    }}
                  >
                    <label>
                      Topic
                      <input
                        name="title"
                        required
                        maxLength={100}
                        placeholder="What’s on your mind?"
                      />
                    </label>
                    <label>
                      Your message
                      <textarea
                        name="body"
                        rows={5}
                        required
                        maxLength={2000}
                        placeholder="Share an idea, a question, or a little progress."
                      />
                    </label>
                    <label>
                      Channel
                      <select name="tag">
                        <option>IDEAS</option>
                        <option>BUILD LOG</option>
                        <option>HELP WANTED</option>
                      </select>
                    </label>
                    <button className="retro-button primary">
                      Post conversation <ArrowUpRight size={16} />
                    </button>
                  </form>
                  <small className="muted">
                    Local preview only — not published to a shared forum.
                  </small>
                </>
              )}
              {modal === "thread" && selectedThread && (
                <>
                  <span className={`tag ${selectedThread.tone}`}>
                    {selectedThread.tag}
                  </span>
                  <h2>{selectedThread.title}</h2>
                  <p className="thread-byline">
                    {selectedThread.author} · {selectedThread.time}
                  </p>
                  <p className="thread-body">{selectedThread.body}</p>
                  <div className="thread-replies">
                    <h3>
                      Local replies ({replies[selectedThread.id]?.length || 0})
                    </h3>
                    {(replies[selectedThread.id] || []).map((r, i) => (
                      <article key={i}>
                        <b>{r.name}</b>
                        <p>{r.body}</p>
                      </article>
                    ))}
                    {!replies[selectedThread.id]?.length && (
                      <p className="muted">
                        The sample thread has no loaded replies. Add the first
                        local one.
                      </p>
                    )}
                  </div>
                  {user ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const body = new FormData(e.currentTarget)
                          .get("reply")
                          .trim();
                        if (!body) return;
                        setReplies((r) => ({
                          ...r,
                          [selectedThread.id]: [
                            ...(r[selectedThread.id] || []),
                            { name: user.name, body },
                          ],
                        }));
                        e.currentTarget.reset();
                        notify("Your reply was saved locally.");
                      }}
                    >
                      <label>
                        Join the conversation
                        <textarea
                          name="reply"
                          rows={3}
                          maxLength={1000}
                          required
                          placeholder="Be curious. Be kind. Build together."
                        />
                      </label>
                      <button className="retro-button primary">
                        Post reply <ArrowUpRight size={16} />
                      </button>
                    </form>
                  ) : (
                    <button
                      className="retro-button primary"
                      onClick={() => setModal("login")}
                    >
                      Log in to reply <ArrowUpRight size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
            <footer className="dialog-footer">
              <span>swarm.exe / community preview</span>
              <span>YOU’RE IN GOOD COMPANY.</span>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
