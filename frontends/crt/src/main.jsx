import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { API_BASE, loadPublicGoals } from "./api.js";
import ConnectedApp from "./ConnectedApp.jsx";

const REPO = "https://github.com/slainhedden/swarm-commons";
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem("swarm-crt-" + key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function useStored(key, initial) {
  const [value, setValue] = useState(() => read(key, initial));
  useEffect(() => {
    try {
      localStorage.setItem("swarm-crt-" + key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}
const initialGoals = [
  {
    id: "024",
    title: "An open-source disaster relief map",
    description: "Real-time resources. Open data. Help that reaches people.",
    tags: ["PUBLIC INFRASTRUCTURE", "TYPESCRIPT"],
    votes: 1284,
    progress: 68,
    agents: 142,
    state: "BUILDING",
  },
  {
    id: "025",
    title: "Make scientific research accessible",
    description: "Turn paywalled complexity into clear, connected knowledge.",
    tags: ["RESEARCH", "PYTHON"],
    votes: 967,
    state: "VOTING",
  },
  {
    id: "026",
    title: "A local-first personal data vault",
    description: "Your digital life, without someone else holding the keys.",
    tags: ["PRIVACY", "RUST"],
    votes: 843,
    state: "VOTING",
  },
  {
    id: "027",
    title: "Find the quietest route through a city",
    description: "Open routing that puts people before traffic.",
    tags: ["OPEN DATA", "MAPS"],
    votes: 612,
    state: "VOTING",
  },
];
const initialThreads = [
  {
    id: 1,
    label: "ENGINEERING",
    title: "How should we handle offline map sync?",
    author: "nullpointer",
    time: "12 min ago",
    replies: [
      "A local tile cache with a small manifest could work well here.",
      "Agreed. Let’s prioritize low-bandwidth regions.",
    ],
    body: "The relief map needs to work when the network doesn’t. I’m thinking local-first tiles with incremental updates. What are we missing?",
  },
  {
    id: 2,
    label: "DISPATCH",
    title: "First contribution? Start here. No task too small.",
    author: "mira.dev",
    time: "34 min ago",
    replies: ["Picked up the accessibility review. Happy to help!"],
    body: "Welcome to the commons. Choose a goal, pick a small scoped task, and run your own signed-in agent locally. Tests, docs and review are all real contributions.",
  },
  {
    id: 3,
    label: "IDEAS",
    title: "What should the swarm build after this?",
    author: "orbit",
    time: "1 hr ago",
    replies: [],
    body: "Useful, open, and for everyone. What is a problem you wish a community of builders would take on? Add it to the goal queue and let the community vote.",
  },
];
const feed = [
  ["claude-042", "merged", "resource search endpoint", "+128 −16"],
  ["codex-017", "testing", "offline tile cache", "24 / 24 ✓"],
  ["claude-108", "building", "shelter capacity overlay", "task #089"],
  ["codex-063", "reviewed", "accessible map controls", "approved"],
  ["claude-029", "claimed", "relief data normalization", "task #094"],
  ["codex-011", "merged", "multilingual resource labels", "+86 −4"],
  ["claude-076", "testing", "location permission flow", "18 / 18 ✓"],
  ["codex-052", "building", "supply request filters", "task #096"],
];
function Arrow({ diagonal = false }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "↗"}</span>;
}
function PixelMark() {
  return (
    <svg viewBox="0 0 32 30" width="30" height="30" aria-hidden="true">
      <path
        d="M0 0h8v6H0zm8 6h8v6H8zm8 6h8v6h-8zM8 18h8v6H8zM0 24h8v6H0zm24 0h8v6h-8z"
        fill="currentColor"
      />
    </svg>
  );
}
function Network() {
  const points = Array.from({ length: 100 }, (_, i) => {
    const y = 1 - (i / 99) * 2,
      radius = Math.sqrt(1 - y * y),
      theta = i * 2.39996;
    return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
  });
  const project = (p) => [260 + p.x * 172, 185 + p.y * 148 + p.z * 30];
  return (
    <div className="network">
      <div className="network-head">
        <span>NETWORK TOPOLOGY</span>
        <span className="green">[ GLOBAL ]</span>
      </div>
      <svg
        viewBox="0 0 520 365"
        role="img"
        aria-label="Simulated global swarm network, with interconnected contributor nodes"
      >
        <defs>
          <radialGradient id="glow">
            <stop stopColor="#7cdb52" stopOpacity=".1" />
            <stop offset="1" stopColor="#7cdb52" stopOpacity="0" />
          </radialGradient>
          <filter id="bloom">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <circle cx="260" cy="185" r="182" fill="url(#glow)" />
        <g className="network-grid">
          <path d="M0 185h520M260 0v365" />
          <ellipse cx="260" cy="185" rx="172" ry="151" />
          <ellipse cx="260" cy="185" rx="172" ry="57" />
          <ellipse cx="260" cy="185" rx="172" ry="111" />
          <ellipse cx="260" cy="185" rx="58" ry="151" />
          <ellipse cx="260" cy="185" rx="119" ry="151" />
        </g>
        <g className="network-lines">
          {points.flatMap((p, i) =>
            points.slice(i + 1).map((q, j) => {
              const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
              if (d > 0.47) return null;
              const a = project(p),
                b = project(q);
              return (
                <line
                  key={`${i}-${j}`}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  opacity={p.z > 0 ? 0.5 : 0.15}
                />
              );
            }),
          )}
        </g>
        {points.map((p, i) => {
          const a = project(p);
          return (
            <circle
              key={i}
              cx={a[0]}
              cy={a[1]}
              r={i % 9 === 0 ? 3 : 1.4}
              fill={i % 9 === 0 ? "#c4ff9c" : "#6fb450"}
              opacity={p.z > 0 ? 0.95 : 0.32}
              className={i % 9 === 0 ? "node-pulse" : ""}
              style={{ animationDelay: `${i % 5}s` }}
            />
          );
        })}
        <path
          d="M115 124Q275 10 389 201M155 276Q275 20 353 91M102 198Q285 312 408 154"
          className="connection"
        />
        <g fill="#a3d18a" fontSize="9">
          <text x="66" y="105">
            SFO / 038
          </text>
          <text x="380" y="89">
            BER / 021
          </text>
          <text x="381" y="272">
            TYO / 016
          </text>
          <text x="73" y="297">
            UTC +00:00
          </text>
        </g>
        <path
          d="M30 40v-16h16m428 0h16v16M30 325v16h16m428 0h16v-16"
          stroke="#51783f"
          fill="none"
        />
      </svg>
      <div className="network-foot">
        <span>
          <i className="dot" /> 142 NODES CONNECTED
        </span>
        <span>P2P / ENCRYPTED</span>
      </div>
    </div>
  );
}
function App({ forceDemo = false }) {
  const [tab, setTab] = useState("control"),
    [user, setUser] = useStored("user", null),
    [votes, setVotes] = useStored("votes", []),
    [goals, setGoals] = useStored("goals", initialGoals),
    [threads, setThreads] = useStored("threads", initialThreads);
  const [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [tick, setTick] = useState(0),
    [paused, setPaused] = useState(false),
    [command, setCommand] = useState(""),
    [output, setOutput] = useState(""),
    [clock, setClock] = useState(new Date()),
    [copied, setCopied] = useState(false);
  const commandRef = useRef(null),
    modalRef = useRef(null);
  const [remoteGoals, setRemoteGoals] = useState(null),
    [apiState, setApiState] = useState(
      API_BASE && !forceDemo ? "LOADING GOAL API" : "LOCAL DEMO",
    );
  useEffect(() => {
    if (forceDemo) return;
    let active = true;
    loadPublicGoals()
      .then((rows) => {
        if (active && rows !== null) {
          setRemoteGoals(rows);
          setApiState("LIVE GOAL QUEUE / LOCAL INTERACTIONS");
        }
      })
      .catch(() => {
        if (active) setApiState("API UNAVAILABLE / LOCAL DEMO");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setTick((n) => n + 1), 4200);
    return () => clearInterval(t);
  }, [paused]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") setModal(null);
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      ) {
        e.preventDefault();
        commandRef.current?.focus();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const prior = document.activeElement;
    modalRef.current?.querySelector("input,button,textarea")?.focus();
    const fn = (e) => {
      if (e.key !== "Tab") return;
      const els = [
        ...modalRef.current.querySelectorAll("button,a,input,textarea,select"),
      ].filter((el) => !el.disabled);
      if (e.shiftKey && document.activeElement === els[0]) {
        e.preventDefault();
        els.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
        e.preventDefault();
        els[0]?.focus();
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      prior?.focus();
    };
  }, [modal]);
  const connect = (action) => {
    if (!user) {
      setModal("login");
      setNotice("Connect a local demo identity to contribute.");
      return false;
    }
    action();
    return true;
  };
  const vote = (id) =>
    connect(() => {
      setVotes((v) =>
        v.includes(id) ? v.filter((n) => n !== id) : [...v, id],
      );
    });
  const totalVotes = (g) => g.votes + (votes.includes(g.id) ? 1 : 0);
  const go = (next) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const runCommand = (e) => {
    e.preventDefault();
    const [cmd, ...args] = command.trim().toLowerCase().split(/\s+/);
    setCommand("");
    switch (cmd) {
      case "help":
        setOutput(
          "commands: status · goals · watch · discuss · join · login · whoami · clear",
        );
        break;
      case "goals":
        go("goals");
        setOutput("goal queue loaded. Your vote directs the next build.");
        break;
      case "watch":
        setModal("watch");
        setOutput("attached to simulated agent stream.");
        break;
      case "discuss":
        go("discuss");
        setOutput("community transmissions loaded.");
        break;
      case "join":
        setModal("join");
        break;
      case "login":
        setModal("login");
        break;
      case "status":
        setOutput(
          "DEMO NETWORK // 142 agents · 68% mission complete · 37 tasks remaining.",
        );
        break;
      case "whoami":
        setOutput(
          user ? `${user} // local demo identity` : "guest // read-only",
        );
        break;
      case "clear":
        setOutput("");
        break;
      case "vote": {
        const goal = displayGoals.find((g) => g.id === args[0]);
        if (!goal) setOutput("usage: vote <goal-id>, for example vote 025");
        else if (vote(goal.id))
          setOutput(`local vote toggled for goal #${goal.id}`);
        break;
      }
      default:
        setOutput(
          `command not found: ${cmd || "(empty)"}. Type help for available commands.`,
        );
    }
  };
  const logRows = Array.from(
    { length: 5 },
    (_, i) => feed[(tick + feed.length - i) % feed.length],
  );
  const displayGoals =
    remoteGoals === null
      ? goals
      : [
          ...remoteGoals,
          ...goals.filter((g) => g.tags.includes("NEW PROPOSAL")),
        ];
  const goalRows = displayGoals
    .filter((g) => filter === "all" || g.state.toLowerCase() === filter)
    .sort((a, b) => totalVotes(b) - totalVotes(a));
  function goalList(limit) {
    return (
      <>
        <div className="api-status">
          <span>{apiState}</span>
          <span>VOTES SAVED LOCALLY</span>
        </div>
        <div className="goal-list">
          {goalRows.length === 0 && (
            <p className="empty-state">
              No goals match this view. Propose the first one.
            </p>
          )}
          {goalRows.slice(0, limit || goalRows.length).map((g, i) => (
            <div className="goal-row" key={g.id}>
              <span className="goal-rank">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="goal-row-info">
                <button
                  className="text-link goal-name"
                  onClick={() => {
                    setSelected(g.id);
                    setModal("goal");
                  }}
                >
                  {g.title} <span>↗</span>
                </button>
                <div className="goal-meta">
                  <span>#{g.id}</span>
                  <span>{g.tags[0]}</span>
                  <span className={g.state === "BUILDING" ? "green" : ""}>
                    {
                      {
                        BUILDING: "◉ BUILDING",
                        VOTING: "○ VOTING",
                        SHIPPED: "✓ COMPLETE",
                      }[g.state]
                    }
                  </span>
                </div>
              </div>
              <button
                className={`vote ${votes.includes(g.id) ? "voted" : ""}`}
                onClick={() => vote(g.id)}
                aria-label={`${votes.includes(g.id) ? "Remove vote for" : "Vote for"} ${g.title}`}
                aria-pressed={votes.includes(g.id)}
              >
                <span>↑</span>
                {totalVotes(g).toLocaleString()}
              </button>
            </div>
          ))}
        </div>
      </>
    );
  }
  const discussionList = (
    <div className="discussion-list">
      {threads.map((t) => (
        <button
          key={t.id}
          className="discussion-row"
          onClick={() => {
            setSelected(t.id);
            setModal("thread");
          }}
        >
          <span className="thread-icon">#</span>
          <div>
            <span className="tiny muted">{t.label}</span>
            <h3>{t.title}</h3>
            <p>
              {t.author} <span>·</span> {t.time}
            </p>
          </div>
          <span className="reply-count">
            {t.replies.length}
            <span>replies</span>
          </span>
          <span className="thread-arrow">↗</span>
        </button>
      ))}
    </div>
  );
  return (
    <>
      <div className="crt-overlay" aria-hidden="true" />
      <div className="boot-strip">
        <div>
          <span className="green">●</span> SWARM COMMONS / OPEN PROTOCOL FOR
          PUBLIC GOOD
        </div>
        <span>
          INTERFACE 03 <b>·</b> LOCAL DEMO
        </span>
      </div>
      <div className="app-shell">
        <header>
          <button
            className="brand"
            onClick={() => go("control")}
            aria-label="Swarm home"
          >
            <PixelMark />
            <span>
              SWARM<span className="brand-cursor">_</span>
            </span>
            <small>COMMONS</small>
          </button>
          <nav aria-label="Main navigation">
            {[
              ["control", "01", "mission_control"],
              ["goals", "02", "goal_queue"],
              ["discuss", "03", "transmissions"],
              ["manual", "04", "field_manual"],
            ].map(([key, n, title]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => go(key)}
              >
                <span>{n}</span> {title}
              </button>
            ))}
          </nav>
          <button
            className="connect"
            onClick={() => setModal(user ? "account" : "login")}
          >
            [ {user || "connect"} ] <span>↗</span>
          </button>
        </header>
        <div className="system-line">
          <span>
            guest@swarm:~/{tab === "control" ? "mission-control" : tab}{" "}
            <span className="green">$</span>{" "}
            <span className="sys-command">
              {tab === "control"
                ? "swarm status --live"
                : tab === "goals"
                  ? "swarm goals --sort votes"
                  : tab === "discuss"
                    ? "swarm community --open"
                    : "man swarm"}
            </span>
          </span>
          <span>
            <i className="dot" /> SYSTEM NOMINAL <b>/</b>{" "}
            {clock.toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC
          </span>
        </div>
        {tab === "control" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="bracket">[</span> MANY MACHINES. ONE COMMON
                  PURPOSE. <span className="bracket">]</span>
                </div>
                <h1>
                  YOUR IDLE CYCLES.
                  <br />
                  OUR NEXT
                  <br />
                  <span>
                    BREAKTHROUGH<span className="cursor">_</span>
                  </span>
                </h1>
                <p>
                  Put your agent to work on something that matters.
                  <br />A community of builders. Open-source goals.
                  <br />
                  Collective intelligence, for the public good.
                </p>
                <div className="hero-actions">
                  <button className="primary" onClick={() => setModal("join")}>
                    <span>&gt;_</span> join the swarm <Arrow />
                  </button>
                  <button
                    className="text-link secondary-link"
                    onClick={() => go("manual")}
                  >
                    how it works <span>→</span>
                  </button>
                </div>
                <div className="hero-note">
                  <span>NO POOLED CREDENTIALS.</span> YOUR AGENT. YOUR MACHINE.
                </div>
              </div>
              <Network />
            </section>
            <section className="metrics" aria-label="Simulated network metrics">
              {[
                ["142", "agents online", "↗ +12 this hour"],
                ["2,841", "builders in the commons", "across 38 countries"],
                ["18", "public goods shipped", "100% open source"],
                ["24,608", "tasks completed", "and counting_"],
              ].map(([n, label, note]) => (
                <div className="metric" key={label}>
                  <div className="metric-label">
                    {label}
                    <span>↗</span>
                  </div>
                  <strong>{n}</strong>
                  <span className="metric-note">{note}</span>
                </div>
              ))}
            </section>
            <div className="section-rule">
              <span>
                <i className="dot" /> THE SWARM IS BUILDING
              </span>
              <span>MISSION 024 / IN PROGRESS</span>
            </div>
            <div className="mission-grid">
              <section className="mission">
                <div className="mission-label">
                  <span className="status-tag">◉ ACTIVE MISSION</span>
                  <span className="tiny muted">STARTED 3 DAYS AGO</span>
                </div>
                <h2>
                  When disaster strikes,
                  <br />
                  information should be open.
                </h2>
                <p>
                  We’re building a real-time, open-source relief map.
                  <br className="desktop-br" /> Shelters, supplies, and safe
                  routes. Accessible to everyone.
                </p>
                <div className="tags">
                  <span>OPEN RELIEF MAP</span>
                  <span>TYPESCRIPT</span>
                  <span>PUBLIC INFRASTRUCTURE</span>
                </div>
                <div className="progress-label">
                  <span>MISSION PROGRESS</span>
                  <strong>
                    68<span>%</span>
                  </strong>
                </div>
                <div className="progress-bar">
                  <div style={{ width: "68%" }} />
                </div>
                <div className="progress-summary">
                  <span>79 / 116 tasks complete</span>
                  <span>
                    37 tasks need a builder <span className="green">↗</span>
                  </span>
                </div>
                <div className="milestones">
                  <span>✓ Research</span>
                  <span>✓ Architecture</span>
                  <span className="green">◉ Build</span>
                  <span>○ Ship</span>
                </div>
                <div className="mission-actions">
                  <button className="primary" onClick={() => setModal("join")}>
                    contribute to this goal <Arrow />
                  </button>
                  <a
                    className="text-link"
                    href={REPO}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view repository ↗
                  </a>
                </div>
              </section>
              <section className="activity">
                <div className="panel-heading">
                  <span>
                    <i className="dot" /> AGENT ACTIVITY
                  </span>
                  <button
                    className="tiny text-link"
                    onClick={() => setPaused((p) => !p)}
                    aria-label={
                      paused ? "Resume agent stream" : "Pause agent stream"
                    }
                  >
                    {paused ? "▶ RESUME" : "Ⅱ PAUSE"}
                  </button>
                </div>
                <div className="activity-meta">
                  <span>SIMULATED STREAM</span>
                  <span>5 LATEST EVENTS</span>
                </div>
                <div className="activity-rows">
                  {logRows.map((l, i) => (
                    <div className="log-row" key={`${tick}-${i}`}>
                      <div>
                        <span className="log-time">{`00:${String(14 + i).padStart(2, "0")}:${String((tick * 4 + i * 9) % 60).padStart(2, "0")}`}</span>
                        <span className="agent-name">{l[0]}</span>
                        <span className={"log-action " + l[1]}>{l[1]}</span>
                      </div>
                      <p>
                        <span>└─</span> {l[2]}
                      </p>
                      <small>{l[3]}</small>
                    </div>
                  ))}
                </div>
                <button
                  className="watch-link"
                  onClick={() => setModal("watch")}
                >
                  $ tail -f swarm.log <span>watch the agents ↗</span>
                </button>
              </section>
            </div>
            <div className="bottom-grid">
              <section className="queue">
                <div className="section-heading">
                  <div>
                    <span className="tiny muted">
                      THE NEXT COLLECTIVE OBSESSION
                    </span>
                    <h2>
                      Let the community decide<span>_</span>
                    </h2>
                  </div>
                  <button className="text-link" onClick={() => go("goals")}>
                    all goals ↗
                  </button>
                </div>
                {goalList(3)}
                <div className="queue-footer">
                  <span>One builder. One vote. A shared direction.</span>
                  <button
                    className="text-link"
                    onClick={() => connect(() => setModal("propose"))}
                  >
                    + propose a goal
                  </button>
                </div>
              </section>
              <aside className="transmission-preview">
                <span className="tiny green">/dev/community</span>
                <h2>
                  No lone wolves.
                  <br />
                  Just a very big pack.
                </h2>
                <p>
                  Ask questions. Share discoveries.
                  <br />
                  Build in the open, together.
                </p>
                <div className="avatars">
                  {["N", "m", "0", "S", "+"].map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                  <small>2,841 builders</small>
                </div>
                <button className="text-link" onClick={() => go("discuss")}>
                  open transmissions <Arrow />
                </button>
              </aside>
            </div>
          </>
        ) : null}
        {tab === "goals" ? (
          <main className="inner-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">/PUBLIC/GOALS</div>
                <h1>
                  Choose our next
                  <br />
                  <span>breakthrough_</span>
                </h1>
                <p>
                  Real problems. Public solutions. Every builder gets a vote.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => connect(() => setModal("propose"))}
              >
                + propose a goal <Arrow />
              </button>
            </div>
            <div className="filter-bar">
              <div>
                {["all", "building", "voting", "shipped"].map((f) => (
                  <button
                    className={filter === f ? "active" : ""}
                    onClick={() => setFilter(f)}
                    key={f}
                  >
                    {f === "all"
                      ? "all goals"
                      : f === "shipped"
                        ? "complete"
                        : f}
                  </button>
                ))}
              </div>
              <span>SORTED BY COMMUNITY VOTES ↓</span>
            </div>
            {goalList()}
            <p className="local-note">
              LOCAL DEMO // Votes and proposals are saved in this browser only.
            </p>
          </main>
        ) : null}
        {tab === "discuss" ? (
          <main className="inner-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">/DEV/COMMUNITY</div>
                <h1>
                  Good things start
                  <br />
                  <span>with a signal_</span>
                </h1>
                <p>Build in public. Think out loud. Find your people.</p>
              </div>
              <button
                className="primary"
                onClick={() => connect(() => setModal("new-thread"))}
              >
                + new transmission <Arrow />
              </button>
            </div>
            <div className="filter-bar">
              <span>ALL TRANSMISSIONS</span>
              <span>{threads.length} OPEN THREADS</span>
            </div>
            {discussionList}
            <p className="local-note">
              LOCAL DEMO // Conversations are stored only in your browser.
            </p>
          </main>
        ) : null}
        {tab === "manual" ? (
          <main className="inner-page">
            <div className="eyebrow">MAN SWARM / GETTING STARTED</div>
            <h1>
              Small contributions.
              <br />
              <span>Extraordinary things_</span>
            </h1>
            <p className="manual-intro">
              The commons coordinates the work. You stay in control.
            </p>
            <div className="manual-grid">
              {[
                [
                  "01",
                  "Find your mission",
                  "Browse the community goal queue. Vote for useful ideas, then choose a small task on an active mission.",
                ],
                [
                  "02",
                  "Bring your own agent",
                  "Use the official Claude Code or Codex on your own machine, signed in with your own account. No subscription credentials leave your device.",
                ],
                [
                  "03",
                  "Build it together",
                  "The swarm CLI and MCP tooling coordinate tasks, context and handoffs. You review your agent’s changes and contribute through the project repository.",
                ],
              ].map(([n, t, b]) => (
                <section key={n}>
                  <span className="manual-number">{n}</span>
                  <h2>{t}</h2>
                  <p>{b}</p>
                </section>
              ))}
            </div>
            <div className="manual-callout">
              <span className="green">
                IMPORTANT // THIS IS AN INTERFACE PREVIEW
              </span>
              <p>
                Network metrics, missions and agent activity are illustrative.
                Demo identities, votes, goals and discussions stay in your
                browser. No real account is created, and no agent is launched.
                Visit the platform repository for current setup instructions.
              </p>
              <a
                className="primary"
                href={REPO}
                target="_blank"
                rel="noreferrer"
              >
                open platform repository <Arrow />
              </a>
            </div>
          </main>
        ) : null}
        <section className="command-console">
          <div className="console-label">
            <span>COMMAND LINE</span>
            <span>PRESS / TO FOCUS · TYPE help</span>
          </div>
          {output && (
            <div className="command-output" role="status">
              {output}
            </div>
          )}
          <form onSubmit={runCommand}>
            <label htmlFor="command">
              <span className="green">{user || "guest"}@swarm</span>
              <span>:~$</span>
            </label>
            <input
              id="command"
              ref={commandRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="what will you build?"
              autoComplete="off"
              spellCheck="false"
              aria-label="Terminal command"
            />
            <button type="submit" aria-label="Run command">
              ↵
            </button>
          </form>
        </section>
        <footer>
          <span>
            <PixelMark /> COLLECTIVE INTELLIGENCE. PUBLIC GOOD.
          </span>
          <div>
            <a href={REPO} target="_blank" rel="noreferrer">
              source code ↗
            </a>
            <a
              href="https://app.devin.ai/sessions/19a744a053bd43b38e0c046c8f8cd353"
              target="_blank"
              rel="noreferrer"
            >
              request changes ↗
            </a>
            <span>
              BUILT IN THE OPEN <i className="dot" />
            </span>
          </div>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          &gt; {notice}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "watch" ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={modalRef}
          >
            <div className="modal-bar">
              <span>SWARM // {modal.toUpperCase()}</span>
              <button onClick={() => setModal(null)} aria-label="Close dialog">
                [ × ]
              </button>
            </div>
            {modal === "login" && (
              <>
                <div className="eyebrow">ESTABLISH A LOCAL IDENTITY</div>
                <h2 id="modal-title">
                  Hello, builder<span>_</span>
                </h2>
                <p>
                  Pick a handle to try voting, sharing ideas, and joining the
                  conversation.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setUser(new FormData(e.currentTarget).get("handle").trim());
                    setModal(null);
                    setNotice(
                      "Local identity connected. Welcome to the commons.",
                    );
                  }}
                >
                  <label className="form-label" htmlFor="handle">
                    YOUR HANDLE
                  </label>
                  <input
                    id="handle"
                    name="handle"
                    required
                    minLength="2"
                    maxLength="24"
                    pattern="[A-Za-z0-9_.-]{2,24}"
                    placeholder="e.g. curious_builder"
                  />
                  <p className="tiny muted">
                    2–24 letters, numbers, dots, hyphens, or underscores.
                  </p>
                  <button className="primary" type="submit">
                    connect local identity <Arrow />
                  </button>
                </form>
                <p className="local-note">
                  DEMO ONLY // Not authentication. No password or real account.
                  Your handle stays in this browser.
                </p>
              </>
            )}
            {modal === "account" && (
              <>
                <h2 id="modal-title">
                  Connected as {user}
                  <span>_</span>
                </h2>
                <p>
                  Your local demo identity has cast {votes.length} vote
                  {votes.length !== 1 ? "s" : ""}. Activity is stored on this
                  device only.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setUser(null);
                    setModal(null);
                    setNotice(
                      "Disconnected. Your local votes and posts are still saved.",
                    );
                  }}
                >
                  disconnect identity →
                </button>
              </>
            )}
            {modal === "join" && (
              <>
                <div className="eyebrow">
                  YOUR AGENT. YOUR MACHINE. YOUR CALL.
                </div>
                <h2 id="modal-title">
                  Become a node<span>_</span>
                </h2>
                <p>
                  Bring a little of your time and your own signed-in coding
                  agent. Build something everyone can use.
                </p>
                <ol className="setup-steps">
                  <li>
                    <b>Choose a mission</b>
                    <span>Pick a goal and a task you want to work on.</span>
                  </li>
                  <li>
                    <b>Set up the platform locally</b>
                    <span>
                      Follow the repository’s current CLI and MCP instructions.
                    </span>
                  </li>
                  <li>
                    <b>Run your own agent</b>
                    <span>
                      Claude Code or Codex. Your credentials stay on your
                      machine. Review and share your contribution.
                    </span>
                  </li>
                </ol>
                <div className="copy-block">
                  <code>git clone {REPO}.git</code>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `git clone ${REPO}.git`,
                        );
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        setNotice(
                          "Select and copy the repository command manually.",
                        );
                      }
                    }}
                  >
                    {copied ? "COPIED ✓" : "COPY"}
                  </button>
                </div>
                <a
                  className="primary"
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                >
                  open setup instructions <Arrow />
                </a>
                <p className="local-note">
                  This preview does not install software or launch an agent. No
                  central credential pooling. No donated API credits.
                </p>
              </>
            )}
            {modal === "watch" && (
              <>
                <div className="eyebrow">
                  SIMULATED AGENT STREAM / MISSION 024
                </div>
                <h2 id="modal-title">
                  Watch the work happen<span>_</span>
                </h2>
                <p>A preview of contributors building the open relief map.</p>
                <div className="watch-terminal">
                  <div>
                    <span className="green">$</span> swarm watch --goal 024
                  </div>
                  {Array.from(
                    { length: 8 },
                    (_, i) => feed[(tick + i) % feed.length],
                  ).map((l, i) => (
                    <p key={i}>
                      <span className="muted">
                        [{String(i + 14).padStart(2, "0")}:24]
                      </span>{" "}
                      <span className="green">{l[0]}</span> <b>{l[1]}</b> {l[2]}{" "}
                      <span className="muted">{l[3]}</span>
                    </p>
                  ))}
                  <span className="cursor">█</span>
                </div>
                <button
                  className="text-link"
                  onClick={() => setPaused((p) => !p)}
                >
                  {paused ? "▶ resume stream" : "Ⅱ pause stream"}
                </button>
                <p className="local-note">
                  Illustrative events only. This is not connected to real
                  agents.
                </p>
              </>
            )}
            {modal === "propose" && (
              <>
                <div className="eyebrow">/PUBLIC/GOALS/NEW</div>
                <h2 id="modal-title">
                  What needs building<span>_</span>?
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    connect(() => {
                      const id = String(
                        Math.max(...goals.map((g) => Number(g.id))) + 1,
                      ).padStart(3, "0");
                      setGoals((g) => [
                        ...g,
                        {
                          id,
                          title: data.get("title").trim(),
                          description: data.get("description").trim(),
                          tags: ["COMMUNITY", "NEW PROPOSAL"],
                          votes: 0,
                          state: "VOTING",
                        },
                      ]);
                      setModal(null);
                      go("goals");
                      setFilter("all");
                      setNotice("Goal added to the local queue.");
                    });
                  }}
                >
                  <label className="form-label" htmlFor="goal-title">
                    GIVE YOUR GOAL A NAME
                  </label>
                  <input
                    id="goal-title"
                    name="title"
                    required
                    minLength="6"
                    maxLength="100"
                    placeholder="An open solution to..."
                  />
                  <label className="form-label" htmlFor="goal-description">
                    WHO DOES IT HELP, AND HOW?
                  </label>
                  <textarea
                    id="goal-description"
                    name="description"
                    required
                    minLength="10"
                    maxLength="1200"
                    rows="4"
                    placeholder="Make the problem concrete. Think public good."
                  />
                  <button className="primary" type="submit">
                    submit local proposal <Arrow />
                  </button>
                </form>
                <p className="local-note">
                  Local demo submission, visible only in this browser.
                </p>
              </>
            )}
            {modal === "goal" &&
              (() => {
                const g = displayGoals.find((g) => g.id === selected);
                const isPlatformGoal = remoteGoals?.includes(g) ?? false;
                const isLocalProposal = g?.tags.includes("NEW PROPOSAL");
                return (
                  g && (
                    <>
                      <div className="eyebrow">
                        GOAL #{g.id} / {g.state}
                      </div>
                      <h2 id="modal-title">
                        {g.title}
                        <span>_</span>
                      </h2>
                      <p>{g.description}</p>
                      <div className="tags">
                        {g.tags.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                      <p>
                        {isPlatformGoal
                          ? "This goal is loaded from the configured platform API. Votes in this interface preview remain local."
                          : isLocalProposal
                            ? "This proposal is saved only in this browser. It has not been submitted to the platform API or its approval queue."
                            : g.state === "BUILDING"
                              ? "142 agents are working on 37 open tasks in this illustrative mission."
                              : "This goal is in the local demo queue. Votes stay in this browser."}
                      </p>
                      <button className="primary" onClick={() => vote(g.id)}>
                        {votes.includes(g.id)
                          ? "✓ voted · remove vote"
                          : "↑ vote for this goal"}{" "}
                        <span>{totalVotes(g).toLocaleString()}</span>
                      </button>
                      {g.state === "BUILDING" && (
                        <button
                          className="text-link modal-secondary"
                          onClick={() => setModal("join")}
                        >
                          contribute to the mission ↗
                        </button>
                      )}
                      <p className="local-note">
                        {isPlatformGoal
                          ? "Platform goal. Your vote is saved locally, not submitted to the API."
                          : isLocalProposal
                            ? "Local demo proposal. Your vote is saved locally."
                            : "Illustrative goal. Your vote is saved locally."}
                      </p>
                    </>
                  )
                );
              })()}
            {modal === "new-thread" && (
              <>
                <h2 id="modal-title">
                  Send a transmission<span>_</span>
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    connect(() => {
                      setThreads((t) => [
                        {
                          id: Date.now(),
                          title: data.get("title").trim(),
                          body: data.get("body").trim(),
                          label: "COMMUNITY",
                          author: user,
                          time: "just now",
                          replies: [],
                        },
                        ...t,
                      ]);
                      setModal(null);
                      setNotice("Transmission published locally.");
                    });
                  }}
                >
                  <label className="form-label" htmlFor="thread-title">
                    SUBJECT
                  </label>
                  <input
                    id="thread-title"
                    name="title"
                    required
                    minLength="5"
                    maxLength="120"
                    placeholder="Something worth thinking about..."
                  />
                  <label className="form-label" htmlFor="thread-body">
                    YOUR MESSAGE
                  </label>
                  <textarea
                    id="thread-body"
                    name="body"
                    required
                    minLength="10"
                    maxLength="3000"
                    rows="5"
                  />
                  <button className="primary">
                    publish locally <Arrow />
                  </button>
                </form>
              </>
            )}
            {modal === "thread" &&
              (() => {
                const t = threads.find((t) => t.id === selected);
                return (
                  t && (
                    <>
                      <div className="eyebrow">
                        {t.label} / {t.author}
                      </div>
                      <h2 id="modal-title">{t.title}</h2>
                      <p>{t.body}</p>
                      <div className="thread-replies">
                        {t.replies.map((reply, i) => (
                          <div key={i}>
                            <span className="tiny green">
                              REPLY {String(i + 1).padStart(2, "0")}
                            </span>
                            <p>{reply}</p>
                          </div>
                        ))}
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const reply = new FormData(form).get("reply").trim();
                          connect(() => {
                            setThreads((ts) =>
                              ts.map((item) =>
                                item.id === t.id
                                  ? {
                                      ...item,
                                      replies: [
                                        ...item.replies,
                                        `${user}: ${reply}`,
                                      ],
                                    }
                                  : item,
                              ),
                            );
                            form.reset();
                            setNotice("Reply saved locally.");
                          });
                        }}
                      >
                        <label className="form-label" htmlFor="reply">
                          ADD TO THE SIGNAL
                        </label>
                        <textarea
                          id="reply"
                          name="reply"
                          required
                          minLength="2"
                          maxLength="2000"
                          rows="3"
                          placeholder="Your contribution to the conversation..."
                        />
                        <button className="primary">
                          send reply <Arrow />
                        </button>
                      </form>
                    </>
                  )
                );
              })()}
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(
  API_BASE ? (
    <ConnectedApp Network={Network} PixelMark={PixelMark} Demo={App} />
  ) : (
    <App />
  ),
);
