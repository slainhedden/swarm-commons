import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Code2,
  Copy,
  ExternalLink,
  GitBranch,
  GitMerge,
  Github,
  Globe2,
  Layers3,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Network,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Target,
  Terminal,
  Users,
  Vote,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./styles.css";
import * as api from "./api";

type Page = "Overview" | "Goal queue" | "Community" | "Activity";
type Goal = {
  id: number;
  title: string;
  description: string;
  tag: string;
  votes: number;
  agents: number;
  status: string;
};
type Thread = {
  id: number;
  title: string;
  body: string;
  author: string;
  category: string;
  replies: string[];
  replyCount?: number;
  time: string;
};
type Modal =
  | "join"
  | "login"
  | "goal"
  | "watch"
  | "mission"
  | "notifications"
  | "help"
  | null;
const repo = "https://github.com/slainhedden/swarm-commons";
const initialGoals: Goal[] = [
  {
    id: 1,
    title: "An open disaster response map",
    description:
      "Real-time, accessible information when communities need it most.",
    tag: "Climate & resilience",
    votes: 1248,
    agents: 128,
    status: "Active mission",
  },
  {
    id: 2,
    title: "Make public research actually public",
    description:
      "A local-first tool that turns open research into a searchable knowledge graph.",
    tag: "Open science",
    votes: 892,
    agents: 0,
    status: "In the queue",
  },
  {
    id: 3,
    title: "A screen reader for every website",
    description:
      "An open accessibility toolkit that makes the web work for everyone.",
    tag: "Accessibility",
    votes: 764,
    agents: 0,
    status: "In the queue",
  },
  {
    id: 4,
    title: "Track the health of our local rivers",
    description:
      "Turn scattered public water quality data into something communities can use.",
    tag: "Environment",
    votes: 613,
    agents: 0,
    status: "In the queue",
  },
];
const initialThreads: Thread[] = [
  {
    id: 1,
    title: "What should an offline-first crisis map look like?",
    body: "Connectivity is usually the first thing to go. I’m exploring a tile cache and a lightweight sync protocol. What should we prioritize for people on the ground?",
    author: "maya.builds",
    category: "Mission discussion",
    replies: [
      "Start with printable maps and low-bandwidth updates.",
      "Happy to help test screen reader support.",
    ],
    time: "12 min ago",
  },
  {
    id: 2,
    title: "First contribution? Your agent is welcome here.",
    body: "Pick a small task, read the acceptance criteria, and let your local agent help. You stay in control of the work and review the changes before opening a PR.",
    author: "alex.dev",
    category: "Getting started",
    replies: ["Just joined with Codex. Excited to contribute!"],
    time: "28 min ago",
  },
  {
    id: 3,
    title: "Weekly transmission: 42 pull requests, one shared goal",
    body: "This week the demo swarm shipped accessible map controls, a data ingestion adapter, and a clearer onboarding flow. Tell us what you want to build next.",
    author: "swarm.team",
    category: "Dispatches",
    replies: [],
    time: "1 hour ago",
  },
];
const events = [
  {
    icon: GitMerge,
    text: "Map accessibility improvements merged",
    detail: "maya.builds · pull request #142",
    time: "just now",
    type: "merge",
  },
  {
    icon: CheckCircle2,
    text: "Geospatial data adapter completed",
    detail: "codex-082 · task #086",
    time: "2 min ago",
    type: "task",
  },
  {
    icon: Users,
    text: "A new contributor joined the mission",
    detail: "jules.dev · Claude Code",
    time: "4 min ago",
    type: "join",
  },
  {
    icon: GitBranch,
    text: "Offline tile cache started",
    detail: "claude-017 · task #091",
    time: "6 min ago",
    type: "task",
  },
  {
    icon: CheckCircle2,
    text: "Mobile map controls passed review",
    detail: "nora.codes · task #084",
    time: "8 min ago",
    type: "task",
  },
];

function useStored<T>(
  key: string,
  initial: T,
  persist = true,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    if (persist) localStorage.setItem(key, JSON.stringify(value));
  }, [key, value, persist]);
  return [value, setValue];
}
function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "mark small" : "mark"}
      viewBox="0 0 38 42"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 2 35 11.5v19L19 40 3 30.5v-19L19 2Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m3 11.5 16 9.5 16-9.5M19 21v19M11 6.75v19l16 9.5M27 6.75v9.5L11 25.75"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}
function IconButton({
  icon: Icon,
  label,
  onClick,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={18} />
    </button>
  );
}
function Sparkline({ variant = 0 }: { variant?: number }) {
  const paths = [
    "0,30 12,29 20,21 29,26 40,13 51,18 60,10 69,16 77,5 88,10 100,0",
    "0,32 12,26 22,28 32,15 43,19 54,18 66,10 77,14 88,5 100,3",
    "0,26 10,28 22,20 32,25 45,14 56,18 67,9 78,14 88,4 100,1",
  ];
  return (
    <svg className="sparkline" viewBox="0 0 100 40" aria-hidden="true">
      <polyline
        points={paths[variant % 3]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d={`M${paths[variant % 3].split(" ").join(" L")} L100,40 L0,40Z`}
        fill="currentColor"
        opacity=".07"
      />
    </svg>
  );
}

// An original orthographic illustration: no map service or tracking required.
const continents = [
  [
    [-168, 68],
    [-140, 72],
    [-122, 57],
    [-126, 45],
    [-113, 29],
    [-100, 20],
    [-83, 9],
    [-77, 10],
    [-86, 22],
    [-80, 29],
    [-66, 45],
    [-52, 48],
    [-56, 60],
    [-81, 64],
    [-99, 74],
    [-130, 72],
  ],
  [
    [-81, 12],
    [-67, 10],
    [-50, 0],
    [-35, -8],
    [-41, -23],
    [-53, -35],
    [-67, -55],
    [-75, -43],
    [-72, -22],
    [-81, -3],
  ],
  [
    [-55, 60],
    [-43, 60],
    [-20, 78],
    [-45, 83],
    [-60, 74],
  ],
  [
    [-18, 35],
    [0, 37],
    [15, 32],
    [34, 31],
    [44, 12],
    [51, 10],
    [42, -10],
    [31, -29],
    [19, -35],
    [11, -20],
    [8, -1],
    [-10, 5],
    [-17, 18],
  ],
  [
    [-10, 36],
    [-10, 58],
    [7, 58],
    [15, 72],
    [33, 70],
    [39, 56],
    [57, 54],
    [70, 62],
    [95, 76],
    [140, 72],
    [180, 62],
    [156, 49],
    [142, 37],
    [124, 22],
    [105, 5],
    [90, 7],
    [78, 21],
    [69, 23],
    [55, 29],
    [48, 12],
    [35, 31],
    [24, 40],
    [10, 43],
  ],
  [
    [113, -11],
    [132, -12],
    [145, -16],
    [154, -27],
    [145, -39],
    [131, -33],
    [115, -35],
  ],
];
function inside(point: number[], polygon: number[][]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function Globe({
  layer,
  onNode,
}: {
  layer: string;
  onNode: (name: string) => void;
}) {
  const project = (lon: number, lat: number) => {
    const lo = ((lon + 25) * Math.PI) / 180,
      la = (lat * Math.PI) / 180,
      tilt = (16 * Math.PI) / 180;
    return [
      310 + 153 * Math.cos(la) * Math.sin(lo),
      184 -
        153 *
          (Math.cos(tilt) * Math.sin(la) -
            Math.sin(tilt) * Math.cos(la) * Math.cos(lo)),
      Math.sin(tilt) * Math.sin(la) +
        Math.cos(tilt) * Math.cos(la) * Math.cos(lo),
    ];
  };
  const dots = [];
  for (let lat = -56; lat < 80; lat += 3)
    for (let lon = -180; lon < 180; lon += 3.5) {
      const p = project(lon, lat);
      if (p[2] > 0 && continents.some((poly) => inside([lon, lat], poly)))
        dots.push(
          <circle
            key={`${lat}-${lon}`}
            cx={p[0]}
            cy={p[1]}
            r={1.05}
            opacity={0.24 + p[2] * 0.48}
          />,
        );
    }
  const nodes = [
    { name: "San Francisco", lon: -122, lat: 38, x: 108, y: 110, count: 24 },
    { name: "São Paulo", lon: -46, lat: -24, x: 114, y: 298, count: 16 },
    { name: "London", lon: 0, lat: 51, x: 381, y: 61, count: 31 },
    { name: "Berlin", lon: 13, lat: 52, x: 453, y: 122, count: 19 },
    { name: "Nairobi", lon: 37, lat: -1, x: 460, y: 273, count: 12 },
  ];
  return (
    <svg
      className={`globe ${layer === "Tasks" ? "task-layer" : ""}`}
      viewBox="0 0 620 380"
      role="img"
      aria-label="Illustrated demo network of contributors around the world"
    >
      <defs>
        <radialGradient id="globeFill">
          <stop offset="0" stopColor="var(--globe-core)" />
          <stop offset="1" stopColor="var(--bg)" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse
        className="orbit"
        cx="310"
        cy="184"
        rx="249"
        ry="116"
        transform="rotate(-21 310 184)"
      />
      <ellipse
        className="orbit dashed"
        cx="310"
        cy="184"
        rx="210"
        ry="170"
        transform="rotate(26 310 184)"
      />
      <circle
        cx="310"
        cy="184"
        r="155"
        fill="url(#globeFill)"
        stroke="var(--globe-line)"
      />
      {[48, 98, 140].map((r) => (
        <ellipse
          key={r}
          cx="310"
          cy="184"
          rx={r}
          ry="153"
          className="grid-line"
        />
      ))}
      {[90, 145, 200, 255].map((y, i) => (
        <ellipse
          key={y}
          cx="310"
          cy={y}
          rx={[120, 149, 152, 132][i]}
          ry="22"
          className="grid-line"
        />
      ))}
      <g fill="var(--accent)">{dots}</g>
      <g className="connections">
        {nodes.slice(1).map((node, i) => {
          const a = project(nodes[0].lon, nodes[0].lat),
            b = project(node.lon, node.lat);
          return (
            <path
              key={node.name}
              d={`M${a[0]},${a[1]} Q${280 + i * 30},${-40 + i * 35} ${b[0]},${b[1]}`}
            />
          );
        })}
      </g>
      {nodes.map((node, i) => {
        const p = project(node.lon, node.lat);
        return (
          <g
            key={node.name}
            className="map-node"
            tabIndex={0}
            role="button"
            aria-label={`Inspect ${node.name} demo node`}
            onClick={() => onNode(node.name)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNode(node.name);
              }
            }}
          >
            <path
              d={`M${p[0]},${p[1]} L${node.x > 310 ? node.x - 12 : node.x + 85},${node.y + 8}`}
              className="leader"
            />
            <circle className="node-halo" cx={p[0]} cy={p[1]} r="10" />
            <circle cx={p[0]} cy={p[1]} r="3" className="node-dot" />
            <circle
              cx={p[0]}
              cy={p[1]}
              r="4"
              className="pulse"
              style={{ animationDelay: `${i * 0.5}s` }}
            />
            <text x={node.x} y={node.y} className="node-label">
              {node.name.toUpperCase()}
            </text>
            <text x={node.x} y={node.y + 15} className="node-count">
              {layer === "Tasks"
                ? Math.round(node.count * 1.8) + " tasks"
                : node.count + " agents"}
            </text>
          </g>
        );
      })}
      <text x="24" y="355" className="map-coordinate">
        37°46′ N / 122°25′ W
      </text>
      <text x="487" y="355" className="map-coordinate">
        NETWORK / 001
      </text>
    </svg>
  );
}

function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [modal, setModal] = useState<Modal>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const scope = api.API_BASE ? `:${api.API_BASE}` : "";
  const [remote, setRemote] = useState<api.Snapshot | null>(null);
  const [threadPage, setThreadPage] = useState(1);
  const threadPageRef = useRef(1);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [user, setUser] = useStored(`swarm.mc.user${scope}`, "");
  // Live snapshots must not overwrite browser-local fallback contributions.
  const [goals, setGoals] = useStored<Goal[]>(
    `swarm.mc.goals${scope}`,
    initialGoals,
    !remote,
  );
  const [voteLedger, setVoteLedger] = useStored<Record<string, number[]>>(
    `swarm.mc.vote-ledger${scope}`,
    {},
  );
  function setVotes(update: React.SetStateAction<number[]>) {
    setVoteLedger((ledger) => ({
      ...ledger,
      [user]:
        typeof update === "function" ? update(ledger[user] || []) : update,
    }));
  }
  const [threads, setThreads] = useStored<Thread[]>(
    `swarm.mc.threads${scope}`,
    initialThreads,
    !remote,
  );
  const [connection, setConnection] = useState(
    api.API_BASE ? "connecting" : "demo",
  );
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const live = Boolean(remote);
  const votes = !user
    ? []
    : live && remote?.goals.every((g) => typeof g.viewer_voted === "boolean")
      ? remote.goals.filter((g) => g.viewer_voted).map((g) => g.id)
      : voteLedger[user] || [];
  const [selectedThread, setSelectedThread] = useState<number | null>(null);
  const selectedThreadRef = useRef<number | null>(null);
  const [replyPage, setReplyPage] = useState(1);
  const replyPageRef = useRef(1);
  const [replyDetail, setReplyDetail] = useState<api.ApiThread | null>(null);
  const [repliesLoading, setRepliesLoading] = useState(false);
  function selectThread(id: number | null) {
    selectedThreadRef.current = id;
    replyPageRef.current = 1;
    setReplyPage(1);
    setReplyDetail(null);
    setRepliesLoading(false);
    setSelectedThread(id);
  }
  function changeReplyPage(page: number) {
    replyPageRef.current = page;
    setReplyPage(page);
  }
  const [category, setCategory] = useState("All transmissions");
  const [layer, setLayer] = useState("Agents");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [joinStep, setJoinStep] = useState(1);
  const [agent, setAgent] = useState("Claude Code");
  const [watchRunning, setWatchRunning] = useState(true);
  const [streamActivity, setStreamActivity] = useState<api.ApiActivity[]>([]);
  const [tick, setTick] = useState(0);
  const [activeFilter, setActiveFilter] = useState("All activity");
  const [sort, setSort] = useState("Most voted");
  const [clock, setClock] = useState(new Date());
  const [node, setNode] = useState("");
  const [isComposer, setIsComposer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (watchRunning) setStreamActivity(remote?.activity || []);
  }, [remote?.activity, watchRunning]);
  function timeAgo(seconds: number) {
    const minutes = Math.max(0, Math.floor((Date.now() / 1000 - seconds) / 60));
    return minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : `${Math.floor(minutes / 60)} hours ago`;
  }
  function applySnapshot(data: api.Snapshot) {
    setRemote(data);
    setConnection("live");
    setGoals(
      data.goals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        tag: "Public good",
        votes: g.votes,
        agents: g.progress.claimed,
        status: g.id === data.featured?.id ? "Active mission" : "In the queue",
      })),
    );
    setThreads(
      data.threads.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.body,
        author: t.author,
        category: t.goal_id ? "Mission discussion" : "Getting started",
        replies: [],
        replyCount: t.comment_count,
        time: timeAgo(t.created_at),
      })),
    );
  }
  function changeThreadPage(nextPage: number) {
    threadPageRef.current = nextPage;
    setThreadPage(nextPage);
    selectThread(null);
  }
  async function refresh() {
    const currentPage = threadPageRef.current;
    const data = await api.snapshot(currentPage);
    // An SSE refresh from the previous page must not replace the selected page.
    if (currentPage === threadPageRef.current) applySnapshot(data);
  }
  useEffect(() => {
    function expired() {
      setUser("");
      setToast("Your platform session expired. Sign in again to contribute.");
    }
    window.addEventListener(api.SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(api.SESSION_EXPIRED_EVENT, expired);
  }, []);
  useEffect(() => {
    if (!api.API_BASE) return;
    let disposed = false;
    setThreadsLoading(true);
    api
      .snapshot(threadPage)
      .then((data) => {
        if (!disposed) applySnapshot(data);
      })
      .catch((e) => {
        if (!disposed) {
          if (remote) {
            setToast(e.message);
            changeThreadPage(remote.threadPage);
          } else {
            setConnection("fallback");
            setUser("");
          }
        }
      })
      .finally(() => {
        if (!disposed) setThreadsLoading(false);
      });
    if (api.hasToken())
      api
        .request<{ handle: string }>("/me")
        .then((me) => {
          if (!disposed) setUser(me.handle);
        })
        .catch(() => {
          // request() clears only the session that actually received a 401.
          // A network failure must not revoke a valid or newer sign-in.
          if (!disposed && !api.hasToken()) setUser("");
        });
    else setUser("");
    return () => {
      disposed = true;
    };
  }, [threadPage]);
  useEffect(() => {
    if (!live) return;
    const stream = new EventSource(`${api.API_BASE}/events/stream`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    stream.onmessage = () => {
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          refresh().catch(() => setConnection("reconnecting"));
        }, 500);
    };
    stream.onerror = () => setConnection("reconnecting");
    stream.onopen = () => setConnection("live");
    return () => {
      stream.close();
      if (timer) clearTimeout(timer);
    };
  }, [live]);
  useEffect(() => {
    if (!live || selectedThread === null) return;
    let disposed = false;
    setRepliesLoading(true);
    api
      .thread(selectedThread, replyPage)
      .then((t) => {
        if (
          !disposed &&
          selectedThreadRef.current === t.id &&
          replyPageRef.current === replyPage
        )
          setReplyDetail(t);
      })
      .catch((e) => {
        if (
          !disposed &&
          selectedThreadRef.current === selectedThread &&
          replyPageRef.current === replyPage
        ) {
          setToast(e.message);
          changeReplyPage(
            replyDetail?.id === selectedThread
              ? replyDetail.comments_page || 1
              : 1,
          );
        }
      })
      .finally(() => {
        if (!disposed) setRepliesLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [selectedThread, live, remote?.threads, replyPage]);
  useEffect(() => {
    setFormError("");
  }, [modal, isComposer, authMode]);
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (modal !== "watch" || !watchRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, [modal, watchRunning]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setModal(null);
        setSearchOpen(false);
        setNode("");
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => {
    if (!modal && !node && !isComposer && !selectedThread) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>("button,input,select,textarea")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        ),
      ];
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsComposer(false);
        selectThread(null);
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", trap);
      document.removeEventListener("keydown", close);
      previous?.focus();
    };
  }, [modal, node, isComposer, selectedThread]);
  function navigate(target: Page) {
    setPage(target);
    setMobileNav(false);
    setSearch("");
    setSearchOpen(false);
    window.scrollTo(0, 0);
  }
  function join() {
    setJoinStep(1);
    setModal("join");
  }
  async function vote(id: number) {
    if (busy) return;
    if (!user) {
      setModal("login");
      return;
    }
    if (live) {
      const voted = votes.includes(id);
      setBusy(true);
      try {
        const updated = await api.toggleGoalVote(id, voted);
        setRemote(
          (current) =>
            current && {
              ...current,
              goals: current.goals.map((goal) =>
                goal.id === id ? updated : goal,
              ),
            },
        );
        setGoals((current) =>
          current.map((goal) =>
            goal.id === id ? { ...goal, votes: updated.votes } : goal,
          ),
        );
        setVotes((v) => (voted ? v.filter((i) => i !== id) : [...v, id]));
        refresh().catch(() => setConnection("reconnecting"));
        setToast(
          voted
            ? "Your vote was removed."
            : "Your vote is counted by the collective.",
        );
      } catch (e) {
        setToast((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    const voted = votes.includes(id);
    setVotes((v) => (voted ? v.filter((i) => i !== id) : [...v, id]));
    setGoals((gs) =>
      gs.map((g) =>
        g.id === id ? { ...g, votes: g.votes + (voted ? -1 : 1) } : g,
      ),
    );
    setToast(
      voted
        ? "Vote removed."
        : "Your vote is in. Help shape what we build next.",
    );
  }
  async function releaseClaim(id: number) {
    if (!live || busy) return;
    setBusy(true);
    try {
      await api.request(`/tasks/${id}/release`, { method: "POST" });
      setToast(
        "Claim released. This task is available to the collective again.",
      );
      refresh().catch(() => setConnection("reconnecting"));
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function requireUser(action: () => void) {
    if (user) action();
    else setModal("login");
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard.");
    } catch {
      setToast("Clipboard unavailable. Select and copy the command below.");
    }
  }
  async function signOut() {
    if (live) {
      try {
        await api.request("/auth/logout", { method: "POST" });
      } catch (e) {
        if (!(e instanceof api.ApiError && e.status === 401)) {
          setToast(
            `Could not revoke the platform session: ${(e as Error).message}`,
          );
          return;
        }
      }
      api.setToken("");
    }
    setUser("");
    if (live) refresh().catch(() => setConnection("reconnecting"));
    setToast(
      live
        ? "Signed out of the platform."
        : "Signed out of your local demo profile.",
    );
  }
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name")).trim();
    if (!name) return;
    setBusy(true);
    setFormError("");
    try {
      if (live) {
        const account = await api.request<{ handle: string; token: string }>(
          `/auth/${authMode}`,
          {
            method: "POST",
            body: JSON.stringify({
              username: name,
              password: String(data.get("password")),
            }),
          },
        );
        api.setToken(account.token);
        setUser(account.handle);
        await refresh();
      } else setUser(name.slice(0, 30));
      close();
      setToast(
        live
          ? "Welcome to the collective."
          : "Welcome to the collective. Your demo profile is ready.",
      );
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function propose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setFormError("");
    const title = String(d.get("title")).trim(),
      description = String(d.get("description")).trim();
    if (!title || !description) {
      setBusy(false);
      setFormError("Please add a title and description.");
      return;
    }
    try {
      if (live) {
        await api.request("/goals", {
          method: "POST",
          body: JSON.stringify({
            title,
            description,
            repo_url: String(d.get("repo_url") || ""),
          }),
        });
        await refresh();
      } else {
        const id = Date.now();
        setGoals((g) => [
          ...g,
          {
            id,
            title,
            description,
            tag: String(d.get("tag")),
            votes: 1,
            agents: 0,
            status: "In the queue",
          },
        ]);
        setVotes((v) => [...v, id]);
      }
      close();
      setToast(
        live
          ? "Goal submitted for moderation. It appears publicly after approval."
          : "Your goal is in the local demo queue.",
      );
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function postDiscussion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setFormError("");
    const title = String(d.get("title")).trim(),
      body = String(d.get("body")).trim();
    if (!title || !body) {
      setBusy(false);
      setFormError("Please add a title and message.");
      return;
    }
    try {
      if (live) {
        await api.request("/threads", {
          method: "POST",
          body: JSON.stringify({
            title,
            body,
            ...(d.get("category") === "Mission discussion" && activeGoal
              ? { goal_id: activeGoal.id }
              : {}),
          }),
        });
        if (threadPageRef.current === 1) await refresh();
        else changeThreadPage(1);
      } else
        setThreads((ts) => [
          {
            id: Date.now(),
            title,
            body,
            author: user,
            category: String(d.get("category")),
            replies: [],
            time: "just now",
          },
          ...ts,
        ]);
      setCategory("All transmissions");
      close();
      setToast(
        live
          ? "Discussion posted to the collective."
          : "Discussion posted to this browser’s demo community.",
      );
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      body = String(new FormData(form).get("reply")).trim();
    if (!body || !thread) return;
    setBusy(true);
    setFormError("");
    let posted = false;
    try {
      if (live) {
        const comment = await api.request<{ id: number }>(
          `/threads/${thread.id}/comments`,
          {
            method: "POST",
            body: JSON.stringify({ body }),
          },
        );
        posted = true;
        form.reset();
        const detail = await api.threadWithReply(thread.id, comment.id);
        if (selectedThreadRef.current === thread.id) {
          changeReplyPage(detail.comments_page || 1);
          setReplyDetail(detail);
        }
        await refresh();
      } else {
        setThreads((ts) =>
          ts.map((t) =>
            t.id === thread.id
              ? { ...t, replies: [...t.replies, `${user}: ${body}`] }
              : t,
          ),
        );
      }
      form.reset();
    } catch (e) {
      setFormError(
        posted
          ? `Reply posted. Could not refresh the discussion: ${(e as Error).message}`
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const activeGoal =
    goals.find((g) => g.status === "Active mission") || goals[0];
  const progress = live
    ? remote?.featured?.progress
    : { percent_done: 68, done: 128, total: 186 };
  const missionTitle = activeGoal?.title || "A new mission starts with you";
  const missionRepo = remote?.featured?.repo_url || repo;
  const missionDescription = live
    ? activeGoal?.description ||
      "Propose a useful public project to start the collective’s next mission."
    : "Helping communities find the right information when every second counts.";
  const running = live ? remote?.stats.agents_running || 0 : 128;
  const missionRunning = live ? remote?.missionStats?.agents_running || 0 : 128;
  const flightPlan = live
    ? (remote?.tasks || [])
        .filter((task) => task.goal_id === activeGoal?.id)
        .map((task) => ({
          id: task.id,
          title: task.title,
          state:
            task.status === "done"
              ? "complete"
              : task.status === "submitted"
                ? "submitted"
                : task.status === "claimed"
                  ? "active"
                  : "next",
          claimant: task.claimant,
          prUrl: task.pr_url,
        }))
    : [
        {
          id: 1,
          title: "Data ingestion & verification",
          state: "complete",
          claimant: null,
          prUrl: null,
        },
        {
          id: 2,
          title: "Accessible map interface",
          state: "complete",
          claimant: null,
          prUrl: null,
        },
        {
          id: 3,
          title: "Offline-first field tools",
          state: "active",
          claimant: null,
          prUrl: null,
        },
        {
          id: 4,
          title: "Community pilot & handoff",
          state: "next",
          claimant: null,
          prUrl: null,
        },
      ];
  const members = live ? remote?.stats.contributors || 0 : 2409;
  const activityEvents = live
    ? (remote?.activity || []).map((e) => ({
        id: `platform-${e.id}`,
        icon:
          e.kind === "done"
            ? CheckCircle2
            : e.kind === "registered"
              ? Users
              : Activity,
        text: e.summary,
        detail: `${e.actor}${e.task_id ? ` · task #${e.task_id}` : ""}`,
        time: timeAgo(e.created_at),
        type:
          e.kind === "done"
            ? "merge"
            : e.kind === "registered"
              ? "join"
              : "task",
      }))
    : events.map((event, index) => ({ ...event, id: `demo-${index}` }));
  const orderedGoals = [...goals].sort((a, b) =>
    sort === "Newest first" ? b.id - a.id : b.votes - a.votes,
  );
  const thread = threads.find((t) => t.id === selectedThread);
  const currentReplyDetail =
    replyDetail?.id === selectedThread ? replyDetail : null;
  const threadReplies = live
    ? currentReplyDetail?.comments?.map(
        (comment) => `${comment.author}: ${comment.body}`,
      ) || []
    : thread?.replies || [];
  const threadReplyCount = live
    ? (currentReplyDetail?.comment_count ?? thread?.replyCount ?? 0)
    : threadReplies.length;
  const close = () => {
    setModal(null);
    setNode("");
    setIsComposer(false);
    selectThread(null);
  };
  const showDialog = modal || node || isComposer || thread;
  const navItems: { name: Page; icon: LucideIcon; count?: string }[] = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Goal queue", icon: Target, count: String(goals.length) },
    { name: "Community", icon: MessageSquare, count: String(threads.length) },
    { name: "Activity", icon: Activity },
  ];
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <Mark />
          <span>
            swarm<span className="brand-period">.</span>
            <small>COMMONS</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-logo">
            <Globe2 size={17} />
          </span>
          <span>
            Public workspace<small>Built by everyone.</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">THE COLLECTIVE</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? "active" : ""}`}
              onClick={() => navigate(item.name)}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
              {page === item.name && <span className="active-indicator" />}
            </button>
          ))}
        </nav>
        <div className="nav-label resources-label">RESOURCES</div>
        <a className="nav-item" href={repo} target="_blank" rel="noreferrer">
          <Github size={18} />
          <span>Source code</span>
          <ArrowUpRight size={13} />
        </a>
        <button className="nav-item" onClick={() => setModal("help")}>
          <Code2 size={18} />
          <span>Developer docs</span>
          <ArrowUpRight size={13} />
        </button>
        <button className="nav-item" onClick={() => setModal("help")}>
          <CircleHelp size={18} />
          <span>How it works</span>
        </button>
        <div className="sidebar-bottom">
          <div className="contribute-card">
            <div className="mini-orbit">
              <Zap size={17} />
            </div>
            <h4>
              Your spare capacity.
              <br />
              Our next breakthrough.
            </h4>
            <p>Point your agent at something that matters.</p>
            <button onClick={join}>
              Join the swarm <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-status">
            <span className="status-dot" />{" "}
            {live
              ? connection === "live"
                ? "Platform connected"
                : "Reconnecting to platform"
              : "Demo systems operational"}{" "}
            <span className="version">v.01</span>
          </div>
          <button
            className="profile"
            onClick={() => (user ? signOut() : setModal("login"))}
          >
            <span className="avatar">
              {user ? user.slice(0, 2).toUpperCase() : <Users size={16} />}
            </span>
            <span>
              {user || "You belong here"}
              <small>
                {user
                  ? `${live ? "Contributor" : "Demo profile"} · Sign out`
                  : "Sign in to contribute"}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <IconButton
              icon={Menu}
              label="Open navigation"
              onClick={() => setMobileNav(true)}
              className="mobile-menu"
            />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page === "Overview" ? "Mission control" : page}</strong>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={15} />
              <input
                ref={searchRef}
                value={search}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the swarm..."
                aria-label="Search the swarm"
              />
              <kbd>⌘ K</kbd>
              {searchOpen && (
                <div className="search-results">
                  <div className="eyebrow">SEARCH THE COLLECTIVE</div>
                  {(search
                    ? goals.filter((g) =>
                        g.title.toLowerCase().includes(search.toLowerCase()),
                      )
                    : goals.slice(0, 2)
                  ).map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        navigate("Goal queue");
                        if (g.id === activeGoal?.id) setModal("mission");
                      }}
                    >
                      <Target size={16} />
                      <span>{g.title}</span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                  {search &&
                    !goals.some((g) =>
                      g.title.toLowerCase().includes(search.toLowerCase()),
                    ) && <p>No goals found. Try “map” or “research”.</p>}
                  <button
                    onClick={() => {
                      navigate("Community");
                    }}
                  >
                    <MessageSquare size={16} />
                    <span>Explore community discussions</span>
                    <ArrowRight size={14} />
                  </button>
                  <button
                    className="search-dismiss"
                    onClick={() => setSearchOpen(false)}
                  >
                    Close search
                  </button>
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <IconButton
              icon={Bell}
              label="Notifications"
              onClick={() => setModal("notifications")}
              className="notification-button"
            />
            {!user && (
              <button className="login-top" onClick={() => setModal("login")}>
                Sign in <ArrowUpRight size={14} />
              </button>
            )}
            {user && (
              <button
                className="avatar top-avatar"
                onClick={() => setModal("login")}
              >
                {user.slice(0, 2).toUpperCase()}
              </button>
            )}
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="status-dot" /> THE FUTURE IS A COLLECTIVE
                EFFORT
              </div>
              <h1>
                {page === "Overview"
                  ? "Mission control"
                  : page === "Goal queue"
                    ? "What should we build next?"
                    : page === "Community"
                      ? "The human side of the swarm."
                      : "Every little step. Forward."}
                <span className="heading-period">.</span>
              </h1>
              <p>
                {page === "Overview"
                  ? "A thousand agents. One shared direction."
                  : page === "Goal queue"
                    ? "Good ideas become public goods. You decide which ones."
                    : page === "Community"
                      ? "Share an idea, ask a question, find your people."
                      : "A transparent record of work, one contribution at a time."}
              </p>
            </div>
            <div className="heading-actions">
              <div className="utc-clock">
                <span>UNIVERSAL TIME</span>
                {clock.toLocaleTimeString("en-GB", { timeZone: "UTC" })}
                <small> UTC</small>
              </div>
              <button className="button primary" onClick={join}>
                <Plus size={16} /> Join the swarm <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
          <div className="demo-banner">
            <Radio size={13} />
            <span>
              {live
                ? "CONNECTED WORKSPACE"
                : connection === "connecting"
                  ? "CONNECTING"
                  : "EXPLORER MODE"}
            </span>
            <p>
              {live
                ? "Goals, community, and activity are live. The globe is an illustrative visualization, not location tracking."
                : connection === "fallback"
                  ? "Platform unavailable · Demo fallback. Telemetry is simulated; contributions stay in this browser."
                  : "Interactive concept · Network telemetry is simulated. Your demo contributions stay in this browser."}
            </p>
            <span className="demo-tag">
              {live ? "PLATFORM V2" : "PREVIEW 01"}
            </span>
          </div>

          {page === "Overview" && (
            <>
              <section className="stats-grid" aria-label="Network telemetry">
                {[
                  {
                    label: live ? "Active agents" : "Agents on mission",
                    value: live ? String(running) : "128",
                    change: live ? "Recent heartbeats" : "+18 this week",
                    icon: Network,
                    sub: live
                      ? "contributor-controlled runs"
                      : "across 24 countries",
                  },
                  {
                    label: live ? "Tasks marked done" : "Tasks completed",
                    value: live
                      ? String(
                          remote?.tasks.filter((t) => t.status === "done")
                            .length || 0,
                        )
                      : "1,842",
                    change: live
                      ? "Reported by contributors"
                      : "+126 this week",
                    icon: CheckCircle2,
                    sub: "small steps. real impact.",
                  },
                  {
                    label: "Community members",
                    value: live ? members.toLocaleString() : "2,409",
                    change: live ? "Registered contributors" : "+214 this week",
                    icon: Users,
                    sub: "and counting",
                  },
                  {
                    label: "Public goals shipped",
                    value: live
                      ? String(
                          remote?.goals.filter(
                            (g) =>
                              g.progress.total > 0 &&
                              g.progress.percent_done === 100,
                          ).length || 0,
                        )
                      : "16",
                    change: live ? "Completed public goals" : "+3 this month",
                    icon: Target,
                    sub: "open source. always.",
                  },
                ].map((s, i) => (
                  <article className="stat-card" key={s.label}>
                    <div className="stat-label">
                      <span>{s.label}</span>
                      <s.icon size={16} />
                    </div>
                    <div className="stat-body">
                      <div className="stat-value">
                        {s.value}
                        <span className="stat-sub">{s.sub}</span>
                      </div>
                      {!live && <Sparkline variant={i} />}
                    </div>
                    <div className="stat-change">
                      <ArrowUpRight size={13} />
                      {s.change}
                      <span>{live ? "live data" : "demo data"}</span>
                    </div>
                  </article>
                ))}
              </section>
              <div className="dashboard-grid">
                <div className="dashboard-left">
                  <section className="panel network-panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <Globe2 size={17} />
                        <h2>The swarm, in motion</h2>
                        <span className="live-badge">
                          <span className="status-dot" />
                          DEMO LIVE
                        </span>
                      </div>
                      <div className="segmented" aria-label="Map layer">
                        {["Agents", "Tasks"].map((l) => (
                          <button
                            className={layer === l ? "selected" : ""}
                            onClick={() => setLayer(l)}
                            key={l}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="network-view">
                      <div className="network-caption">
                        <span className="eyebrow">DISTRIBUTED BY DESIGN</span>
                        <p>
                          Every point is a person
                          <br />
                          building something better.
                        </p>
                      </div>
                      <div className="map-crosshair top-left">+</div>
                      <div className="map-crosshair bottom-right">+</div>
                      <Globe layer={layer} onNode={setNode} />
                      <div className="network-legend">
                        <span>
                          <i />{" "}
                          {layer === "Agents" ? "Agent online" : "Active task"}
                        </span>
                        <span>
                          <i />{" "}
                          {layer === "Agents" ? "Collaborating" : "In review"}
                        </span>
                      </div>
                      <div className="network-summary">
                        <span className="status-dot" />
                        Illustrative network <span>·</span> 24 demo countries{" "}
                        <span>·</span> 1 shared goal
                      </div>
                    </div>
                    <div className="network-footer">
                      <span>
                        <ShieldCheck size={14} /> Your agent. Your account. Our
                        collective impact.
                      </span>
                      <button
                        onClick={() => {
                          setModal("watch");
                          setTick(0);
                        }}
                      >
                        Watch the network <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="panel queue-preview">
                    <div className="panel-header">
                      <div className="panel-title">
                        <Target size={17} />
                        <h2>On the horizon</h2>
                        <span className="muted-label">COMMUNITY-VOTED</span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("Goal queue")}
                      >
                        View queue <ArrowRight size={14} />
                      </button>
                    </div>
                    {orderedGoals
                      .filter((g) => g.id !== activeGoal?.id)
                      .slice(0, 2)
                      .map((g, i) => (
                        <div className="queue-row" key={g.id}>
                          <span className="queue-rank">0{i + 2}</span>
                          <div>
                            <button
                              className="queue-title"
                              onClick={() => navigate("Goal queue")}
                            >
                              {g.title}
                            </button>
                            <span className="queue-tag">{g.tag}</span>
                          </div>
                          <button
                            className={`vote-button ${votes.includes(g.id) ? "voted" : ""}`}
                            aria-label={`${votes.includes(g.id) ? "Remove vote for" : "Vote for"} ${g.title}`}
                            aria-pressed={votes.includes(g.id)}
                            disabled={busy}
                            onClick={() => vote(g.id)}
                          >
                            <ChevronUp size={14} />
                            {g.votes}
                          </button>
                        </div>
                      ))}
                  </section>
                </div>
                <div className="dashboard-right">
                  <section className="panel mission-panel">
                    <div className="mission-kicker">
                      <span>
                        <span className="status-dot" /> ACTIVE MISSION
                      </span>
                      <span>
                        {live
                          ? `#${activeGoal?.id || "—"} / ${goals.length}`
                          : "001 / 016"}
                      </span>
                    </div>
                    <div className="mission-icon">
                      <Layers3 size={26} />
                      <span className="mission-orbit" />
                    </div>
                    <div className="eyebrow">
                      {live ? "PUBLIC GOOD" : "CLIMATE & RESILIENCE"}
                    </div>
                    <h2>
                      {missionTitle}
                      {!live && "."}
                    </h2>
                    <p>{missionDescription}</p>
                    <div className="mission-people">
                      <div className="avatar-stack">
                        {live ? (
                          <span>
                            <Users size={11} />
                          </span>
                        ) : (
                          <>
                            <span>MK</span>
                            <span>JL</span>
                            <span>AN</span>
                            <span>+125</span>
                          </>
                        )}
                      </div>
                      <span>{missionRunning} agents building</span>
                    </div>
                    <div className="progress-meta">
                      <span>
                        {live ? "Reported completion" : "Mission progress"}
                      </span>
                      <strong>
                        {progress?.percent_done || 0}
                        <span>%</span>
                      </strong>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{ width: `${progress?.percent_done || 0}%` }}
                      />
                    </div>
                    <div className="milestone-caption">
                      <CheckCircle2 size={12} /> {progress?.done || 0} of{" "}
                      {progress?.total || 0}{" "}
                      {live ? "tasks marked done" : "milestones completed"}
                    </div>
                    <button
                      className="button primary mission-button"
                      onClick={() => setModal("mission")}
                    >
                      Explore the mission <ArrowRight size={16} />
                    </button>
                    <div className="mission-links">
                      <button
                        onClick={() => {
                          setTick(0);
                          setModal("watch");
                        }}
                      >
                        <Radio size={13} /> Watch agents
                      </button>
                      <span />
                      <a href={missionRepo} target="_blank" rel="noreferrer">
                        <Github size={13} /> Repository{" "}
                        <ArrowUpRight size={11} />
                      </a>
                    </div>
                  </section>
                  <section className="panel activity-panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <Activity size={16} />
                        <h2>Latest signals</h2>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="View all activity"
                        onClick={() => navigate("Activity")}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="activity-list">
                      {activityEvents.slice(0, 3).map((event, i) => (
                        <div className="activity-item" key={event.id}>
                          <div className={`activity-icon ${event.type}`}>
                            <event.icon size={14} />
                          </div>
                          <div>
                            <button
                              onClick={() => {
                                setModal("watch");
                                setTick(i);
                              }}
                            >
                              {event.text}
                            </button>
                            <small>{event.detail}</small>
                            <time>{event.time}</time>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      className="activity-all"
                      onClick={() => navigate("Activity")}
                    >
                      All activity <ArrowRight size={13} />
                    </button>
                  </section>
                </div>
              </div>
              <section className="community-strip">
                <div className="community-strip-icon">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <span className="eyebrow">
                    THE CONVERSATION IS PART OF THE WORK
                  </span>
                  <h3>Big things start with “what if?”</h3>
                  <p>
                    Meet the people behind the agents. Share what’s on your
                    mind.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => navigate("Community")}
                >
                  Enter the community <ArrowUpRight size={15} />
                </button>
              </section>
            </>
          )}

          {page === "Goal queue" && (
            <section className="full-page">
              <div className="section-toolbar">
                <div className="tabs">
                  <button className="selected">
                    All goals <span>{goals.length}</span>
                  </button>
                </div>
                <div className="toolbar-actions">
                  <label className="sort-select">
                    Sort by{" "}
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option>Most voted</option>
                      <option>Newest first</option>
                    </select>
                  </label>
                  <button
                    className="button primary"
                    onClick={() => requireUser(() => setModal("goal"))}
                  >
                    <Plus size={15} /> Propose a goal
                  </button>
                </div>
              </div>
              <div className="goal-grid">
                {orderedGoals.map((g, i) => (
                  <article
                    className={`panel goal-card ${g.id === activeGoal?.id ? "active-goal" : ""}`}
                    key={g.id}
                  >
                    <div className="goal-card-top">
                      <span className="eyebrow">
                        {g.id === activeGoal?.id ? (
                          <>
                            <span className="status-dot" /> ACTIVE MISSION
                          </>
                        ) : (
                          `IN THE QUEUE / ${String(i + 1).padStart(2, "0")}`
                        )}
                      </span>
                      <Target size={20} />
                    </div>
                    <span className="topic-pill">{g.tag}</span>
                    <h2>{g.title}</h2>
                    <p>{g.description}</p>
                    <div className="goal-card-bottom">
                      <button
                        className={`vote-button ${votes.includes(g.id) ? "voted" : ""}`}
                        onClick={() => vote(g.id)}
                        aria-label={`${votes.includes(g.id) ? "Remove vote for" : "Vote for"} ${g.title}`}
                        aria-pressed={votes.includes(g.id)}
                        disabled={busy}
                      >
                        <ChevronUp size={16} />
                        {g.votes}
                        <span>votes</span>
                      </button>
                      {g.id === activeGoal?.id ? (
                        <button
                          className="text-button"
                          onClick={() => setModal("mission")}
                        >
                          Explore mission <ArrowRight size={15} />
                        </button>
                      ) : (
                        <span className="goal-status">Community proposal</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="queue-explainer">
                <Vote size={20} />
                <div>
                  <h3>One person. One voice. Shared direction.</h3>
                  <p>
                    Vote on useful public projects. The community sets the
                    priority; contributors choose the tasks they run.
                  </p>
                </div>
              </div>
            </section>
          )}

          {page === "Community" && (
            <section className="full-page">
              <div className="section-toolbar">
                <div className="tabs">
                  {[
                    "All transmissions",
                    "Mission discussion",
                    "Getting started",
                    ...(!live ? ["Dispatches"] : []),
                  ].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <button
                  className="button primary"
                  onClick={() => requireUser(() => setIsComposer(true))}
                >
                  <Plus size={15} /> New discussion
                </button>
              </div>
              <div className="community-layout">
                <div
                  className="panel discussion-list"
                  aria-busy={threadsLoading}
                >
                  {threads
                    .filter(
                      (t) =>
                        category === "All transmissions" ||
                        t.category === category,
                    )
                    .map((t, i) => (
                      <button
                        className="discussion-row"
                        key={t.id}
                        onClick={() => selectThread(t.id)}
                      >
                        <span className={`avatar thread-avatar color-${i % 3}`}>
                          {t.author.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <span className="topic-pill">{t.category}</span>
                          <h3>{t.title}</h3>
                          <p>{t.body}</p>
                          <small>
                            {t.author} <span>·</span> {t.time}
                          </small>
                        </div>
                        <span className="reply-count">
                          <MessageSquare size={15} />
                          {t.replyCount ?? t.replies.length}
                        </span>
                      </button>
                    ))}
                  {!threads.some(
                    (t) =>
                      category === "All transmissions" ||
                      t.category === category,
                  ) && (
                    <div className="empty-state">
                      {live
                        ? "No discussions in this category on this page."
                        : "No transmissions yet. Start the conversation."}
                    </div>
                  )}
                  {live && remote && (
                    <nav
                      className="discussion-pagination"
                      aria-label="Discussion pages"
                    >
                      <button
                        className="button secondary"
                        disabled={
                          threadsLoading || busy || remote.threadPage === 1
                        }
                        onClick={() => changeThreadPage(remote.threadPage - 1)}
                      >
                        Newer discussions
                      </button>
                      <span aria-live="polite">Page {remote.threadPage}</span>
                      <button
                        className="button secondary"
                        disabled={
                          threadsLoading || busy || !remote.hasOlderThreads
                        }
                        onClick={() => changeThreadPage(remote.threadPage + 1)}
                      >
                        Older discussions
                      </button>
                    </nav>
                  )}
                </div>
                <aside className="panel community-about">
                  <Mark />
                  <h2>
                    Built in the open.
                    <br />
                    Better together.
                  </h2>
                  <p>
                    This is a place for curious people and useful ideas. Be
                    kind, be specific, and build things worth sharing.
                  </p>
                  <div>
                    <Users size={17} />
                    <strong>{members.toLocaleString()}</strong>
                    <span>{live ? "contributors" : "demo members"}</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setModal("help")}
                  >
                    How the swarm works <ArrowUpRight size={15} />
                  </button>
                </aside>
              </div>
            </section>
          )}

          {page === "Activity" && (
            <section className="full-page">
              <div className="section-toolbar">
                <div className="tabs">
                  {[
                    "All activity",
                    live ? "Completed work" : "Merged work",
                    "Tasks",
                    "Contributors",
                  ].map((f) => (
                    <button
                      className={activeFilter === f ? "selected" : ""}
                      key={f}
                      onClick={() => setActiveFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button
                  className="button secondary"
                  onClick={() => setModal("watch")}
                >
                  <Radio size={15} /> Open agent stream
                </button>
              </div>
              <div className="panel timeline">
                <div className="timeline-date">
                  TODAY{" "}
                  <span>
                    {live ? "PLATFORM ACTIVITY" : "SIMULATED ACTIVITY"}
                  </span>
                </div>
                {activityEvents
                  .filter(
                    (e) =>
                      activeFilter === "All activity" ||
                      (activeFilter === "Merged work" ||
                      activeFilter === "Completed work"
                        ? e.type === "merge"
                        : activeFilter === "Tasks"
                          ? e.type === "task"
                          : e.type === "join"),
                  )
                  .map((e) => (
                    <div className="timeline-row" key={e.id}>
                      <div className={`activity-icon ${e.type}`}>
                        <e.icon size={19} />
                      </div>
                      <div>
                        <h3>{e.text}</h3>
                        <p>{e.detail}</p>
                      </div>
                      <time>{e.time}</time>
                      <button
                        className="text-button"
                        onClick={() => setModal("watch")}
                      >
                        Inspect <ArrowUpRight size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          )}

          <footer>
            <span>
              <Mark small /> Intelligence is better together.
            </span>
            <div>
              <span>OPEN SOURCE. HUMAN DIRECTED.</span>
              <a
                href="https://app.devin.ai/sessions/ff8ad484220349bca6aba2e8c3857ede"
                target="_blank"
                rel="noreferrer"
              >
                Request changes <ArrowUpRight size={12} />
              </a>
            </div>
          </footer>
        </main>
      </div>

      {showDialog && (
        <div className="modal-backdrop" onClick={close}>
          <section
            className={`modal ${modal === "watch" ? "wide-modal terminal-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={close}
            >
              <X size={20} />
            </button>
            {modal === "login" && (
              <>
                <div className="modal-symbol">
                  <Mark />
                </div>
                <div className="eyebrow">A PLACE IN THE COLLECTIVE</div>
                <h2 id="dialog-title">Good to have you here.</h2>
                <p>
                  {live
                    ? "Sign in to the Swarm Commons platform. Your coding-provider credentials are never requested."
                    : "Choose a display name to explore contributing. This is a local demo profile, not an authenticated account."}
                </p>
                <form onSubmit={authenticate}>
                  <label>
                    {live ? "Username" : "Display name"}
                    <input
                      name="name"
                      placeholder="e.g. samuel-builds"
                      required
                      minLength={live ? 2 : 1}
                      maxLength={live ? 39 : 30}
                      pattern={live ? "[a-z0-9_\\-]+" : undefined}
                      defaultValue={user}
                      autoComplete="username"
                    />
                  </label>
                  {live && (
                    <label>
                      Password
                      <input
                        name="password"
                        type="password"
                        required
                        minLength={12}
                        maxLength={128}
                        autoComplete={
                          authMode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        placeholder="At least 12 characters"
                      />
                    </label>
                  )}
                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <button
                    className="button primary"
                    type="submit"
                    disabled={busy}
                  >
                    {busy
                      ? "Connecting…"
                      : live
                        ? authMode === "register"
                          ? "Create account"
                          : "Sign in"
                        : user
                          ? "Update demo profile"
                          : "Enter demo workspace"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </form>
                {live && (
                  <button
                    className="text-button auth-switch"
                    onClick={() =>
                      setAuthMode((m) => (m === "login" ? "register" : "login"))
                    }
                  >
                    {authMode === "login"
                      ? "New here? Create an account"
                      : "Already a member? Sign in"}
                  </button>
                )}
                <div className="inline-note">
                  <ShieldCheck size={16} />
                  {live
                    ? "Only your Swarm Commons account password is sent to the platform. Never enter a coding-provider password or token."
                    : "No passwords, provider tokens, or credentials are collected. Production sign-in belongs to the shared platform."}
                </div>
              </>
            )}
            {modal === "join" && (
              <>
                <div className="modal-symbol">
                  <Zap size={28} />
                </div>
                <div className="eyebrow">CONTRIBUTE YOUR CURIOSITY</div>
                <h2 id="dialog-title">Your agent. A bigger purpose.</h2>
                <p>
                  Run your own signed-in coding agent locally. Pick a task,
                  review its work, and contribute it back to the commons.
                </p>
                <div className="join-steps">
                  {["Choose your agent", "Get connected", "Pick your task"].map(
                    (s, i) => (
                      <span
                        className={joinStep >= i + 1 ? "current" : ""}
                        key={s}
                      >
                        <i>{joinStep > i + 1 ? <Check size={12} /> : i + 1}</i>
                        {s}
                      </span>
                    ),
                  )}
                </div>
                {joinStep === 1 && (
                  <>
                    <label className="field-label">
                      What do you build with?
                    </label>
                    <div className="agent-options">
                      {["Claude Code", "Codex"].map((a) => (
                        <button
                          className={agent === a ? "selected" : ""}
                          onClick={() => setAgent(a)}
                          key={a}
                        >
                          <Terminal size={24} />
                          <strong>{a}</strong>
                          <small>Your own local account</small>
                          {agent === a && <CheckCircle2 size={17} />}
                        </button>
                      ))}
                    </div>
                    <div className="inline-note">
                      <ShieldCheck size={16} /> You choose the goal and control
                      every run. No central credential pooling. No donated API
                      credits.
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setJoinStep(2)}
                    >
                      Continue with {agent} <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {joinStep === 2 && (
                  <>
                    <div className="setup-block">
                      <span className="eyebrow">LOCAL SETUP</span>
                      <h3>Install from the official repository.</h3>
                      <p>
                        The CLI is being built with the platform. Follow its
                        current README for installation and run commands; this
                        preview never starts an agent.
                      </p>
                      <a
                        className="button secondary"
                        href={repo}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Github size={16} /> Open setup instructions{" "}
                        <ExternalLink size={14} />
                      </a>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setJoinStep(3)}
                    >
                      Explore available tasks <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {joinStep === 3 && (
                  <>
                    <div className="task-choice">
                      <span className="topic-pill">
                        GOOD FIRST CONTRIBUTION
                      </span>
                      <h3>Make map controls keyboard accessible</h3>
                      <p>Mission 001 · Accessibility · Example task</p>
                      <ul>
                        <li>Focus every map action with the keyboard.</li>
                        <li>Add clear labels for assistive technology.</li>
                        <li>Open a PR with a short screen reader check.</li>
                      </ul>
                    </div>
                    <a
                      className="button primary"
                      href={repo}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Find tasks in the repository <ArrowUpRight size={15} />
                    </a>
                    <button
                      className="text-button back-step"
                      onClick={() => setJoinStep(1)}
                    >
                      Choose a different agent
                    </button>
                  </>
                )}
              </>
            )}
            {modal === "mission" && (
              <>
                <div className="eyebrow">
                  <span className="status-dot" />{" "}
                  {live
                    ? `MISSION ${activeGoal?.id || "—"} · LIVE`
                    : "MISSION 001 · DEMO"}
                </div>
                <h2 id="dialog-title">
                  {missionTitle}
                  {!live && "."}
                </h2>
                <p>
                  {live
                    ? missionDescription
                    : "Build an accessible, open-source map that brings verified shelters, emergency resources, and road closures into one place."}
                </p>
                <div className="mission-detail-stats">
                  <div>
                    <strong>{missionRunning}</strong>
                    <span>agents building</span>
                  </div>
                  <div>
                    <strong>{progress?.percent_done || 0}%</strong>
                    <span>{live ? "marked done" : "complete"}</span>
                  </div>
                  <div>
                    <strong>
                      {(progress?.total || 0) - (progress?.done || 0)}
                    </strong>
                    <span>milestones left</span>
                  </div>
                </div>
                <h3 className="modal-subheading">The flight plan</h3>
                {live && (
                  <p className="form-note">
                    Results and reviews are contributor attestations, not
                    verified upstream tests or merged work.
                  </p>
                )}
                <div className="flight-plan">
                  {flightPlan.map((task) => (
                    <div key={task.id}>
                      <span className={`plan-dot ${task.state}`}>
                        {task.state === "complete" ? (
                          <Check size={12} />
                        ) : (
                          <span />
                        )}
                      </span>
                      <span className="plan-task-title">
                        {task.title}
                        {task.prUrl && (
                          <a href={task.prUrl} target="_blank" rel="noreferrer">
                            View submission <ExternalLink size={10} />
                          </a>
                        )}
                      </span>
                      <small>
                        {task.state === "complete"
                          ? live
                            ? "Done (attested)"
                            : "Complete"
                          : task.state === "submitted"
                            ? "Awaiting review"
                            : task.state === "active"
                              ? "In progress"
                              : "Up next"}
                      </small>
                      {live &&
                        task.state === "active" &&
                        user &&
                        task.claimant === user && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => releaseClaim(task.id)}
                          >
                            Release claim
                          </button>
                        )}
                    </div>
                  ))}
                </div>
                <div className="modal-button-row">
                  <button className="button primary" onClick={join}>
                    <Plus size={15} /> Contribute to this mission
                  </button>
                  <a
                    className="button secondary"
                    href={missionRepo}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github size={15} /> Source <ArrowUpRight size={14} />
                  </a>
                </div>
              </>
            )}
            {modal === "watch" && (
              <>
                <div className="eyebrow">
                  <Radio size={13} />{" "}
                  {live ? "PUBLIC MISSION ACTIVITY" : "SIMULATED AGENT STREAM"}
                </div>
                <h2 id="dialog-title">A window into the work.</h2>
                <p>
                  {live
                    ? "Public, contributor-published summaries. Raw local agent output is never collected or streamed."
                    : "Illustrative logs from the disaster response mission. No real agents are connected to this concept."}
                </p>
                <div className="terminal-toolbar">
                  <span>
                    <span className="status-dot" />{" "}
                    {live ? "swarm-platform" : "claude-017"}{" "}
                    <small>
                      /{" "}
                      {live
                        ? `mission-${activeGoal?.id || "all"}`
                        : "offline-tile-cache"}
                    </small>
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setWatchRunning((p) => !p)}
                  >
                    {watchRunning ? <Pause size={13} /> : <Play size={13} />}{" "}
                    {watchRunning ? "Pause" : "Resume"}
                  </button>
                </div>
                <div className="terminal-output" aria-live="polite">
                  {(live
                    ? streamActivity
                        .filter(
                          (e) => e.goal_id === activeGoal?.id || !e.goal_id,
                        )
                        .slice(0, 12)
                        .reverse()
                        .map((e) => `[${e.kind}] ${e.actor}: ${e.summary}`) ||
                      []
                    : [
                        "[connect] Joined mission 001: open-response-map",
                        "[claim] Task #091 — Offline-first tile cache",
                        "[plan] Inspecting map renderer and tile source interfaces",
                        "[read] src/map/TileProvider.ts · 186 lines",
                        "[build] Adding persistent tile storage adapter",
                        "[test] Cache read-through: passed (12 assertions)",
                        "[test] Offline fallback: passed (8 assertions)",
                        "[review] Checking storage quota and stale tile eviction",
                        "[ready] Changes prepared for contributor review",
                      ].slice(0, Math.min(9, 4 + (tick % 6)))
                  ).map((l, i) => (
                    <div key={l}>
                      <span className="line-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={l.startsWith("[test]") ? "log-success" : ""}
                      >
                        {l}
                      </span>
                    </div>
                  ))}
                  <div>
                    <span className="line-number">&gt;</span>
                    <span className={watchRunning ? "terminal-cursor" : ""}>
                      {watchRunning ? " " : "Stream paused"}
                    </span>
                  </div>
                </div>
                <div className="stream-footer">
                  <span>
                    <ShieldCheck size={14} /> Contributor reviews before
                    publishing.
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      copy(
                        live
                          ? `Swarm mission ${activeGoal?.id || "all"} · ${missionRepo}`
                          : "Demo mission 001 · agent claude-017 · task #091",
                      )
                    }
                  >
                    Copy reference <Copy size={13} />
                  </button>
                </div>
              </>
            )}
            {modal === "goal" && (
              <>
                <div className="eyebrow">THE NEXT SHARED DIRECTION</div>
                <h2 id="dialog-title">What is worth building?</h2>
                <p>
                  Suggest a useful public project. Be specific about who it
                  helps and what success looks like.
                </p>
                <form onSubmit={propose}>
                  <label>
                    Goal title
                    <input
                      name="title"
                      required
                      maxLength={100}
                      placeholder="An open tool that helps..."
                      pattern=".*\S.*"
                    />
                  </label>
                  <label>
                    Who does it help, and how?
                    <textarea
                      name="description"
                      required
                      maxLength={500}
                      rows={4}
                      placeholder="The problem, the people, and a clear outcome."
                    />
                  </label>
                  {live && (
                    <label>
                      Public repository URL
                      <input
                        name="repo_url"
                        type="url"
                        required
                        placeholder="https://github.com/owner/project"
                      />
                    </label>
                  )}
                  {!live && (
                    <label>
                      Focus area
                      <select name="tag">
                        <option>Public good</option>
                        <option>Open science</option>
                        <option>Accessibility</option>
                        <option>Environment</option>
                        <option>Education</option>
                      </select>
                    </label>
                  )}
                  {live && (
                    <p className="form-note">
                      New goals require community moderation before they appear
                      in the public queue.
                    </p>
                  )}
                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <button
                    className="button primary"
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? "Posting…" : "Propose to the collective"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </form>
              </>
            )}
            {modal === "notifications" && (
              <>
                <div className="eyebrow">YOUR TRANSMISSIONS</div>
                <h2 id="dialog-title">You’re all caught up.</h2>
                <div className="notification-empty">
                  <Bell size={36} />
                  <p>
                    {live
                      ? "Personal notifications are not connected yet. Explore the shared activity feed for current updates."
                      : "When your goals gain support or a mission reaches a milestone, updates will appear here."}
                  </p>
                  <span className="topic-pill">
                    {live
                      ? "Activity notifications coming soon"
                      : "Demo workspace"}
                  </span>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    close();
                    navigate("Activity");
                  }}
                >
                  Explore network activity <ArrowRight size={15} />
                </button>
              </>
            )}
            {modal === "help" && (
              <>
                <div className="eyebrow">HUMAN DIRECTED. AGENT POWERED.</div>
                <h2 id="dialog-title">Many minds. Useful things.</h2>
                <p>
                  Swarm Commons brings people and their coding agents together
                  to build public, open-source projects.
                </p>
                <div className="help-steps">
                  {[
                    [
                      Vote,
                      "Choose a shared goal",
                      "The community proposes and votes on useful things to build.",
                    ],
                    [
                      Terminal,
                      "Bring your own agent",
                      "Run the official Claude Code or Codex locally, signed in to your own account.",
                    ],
                    [
                      GitBranch,
                      "Build a small piece",
                      "Choose a task. Swarm tooling and MCP coordinate claims, progress, and handoffs.",
                    ],
                    [
                      ShieldCheck,
                      "Review and share",
                      "You review your agent’s changes and submit a pull request. Your credentials never leave your machine.",
                    ],
                  ].map(([Icon, title, body]) => {
                    const I = Icon as LucideIcon;
                    return (
                      <div key={String(title)}>
                        <I size={22} />
                        <div>
                          <h3>{String(title)}</h3>
                          <p>{String(body)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <a
                  className="button primary"
                  href={repo}
                  target="_blank"
                  rel="noreferrer"
                >
                  Platform & developer documentation <ArrowUpRight size={15} />
                </a>
              </>
            )}
            {node && (
              <>
                <div className="eyebrow">
                  <span className="status-dot" /> NETWORK NODE · SIMULATED
                </div>
                <h2 id="dialog-title">Hello from {node}.</h2>
                <p>
                  A distributed network needs no central machine. Each
                  contributor works locally and shares progress with the
                  collective.
                </p>
                <div className="node-stats">
                  <div>
                    <span>Node status</span>
                    <strong>Collaborating</strong>
                  </div>
                  <div>
                    <span>Current mission</span>
                    <strong>{missionTitle}</strong>
                  </div>
                  <div>
                    <span>Connection</span>
                    <strong>Local agent + Swarm MCP</strong>
                  </div>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setNode("");
                    setModal("watch");
                  }}
                >
                  {live
                    ? "Inspect public activity"
                    : "Inspect demo agent stream"}{" "}
                  <ArrowRight size={15} />
                </button>
              </>
            )}
            {isComposer && (
              <>
                <div className="eyebrow">SEND A TRANSMISSION</div>
                <h2 id="dialog-title">Start a conversation.</h2>
                <form onSubmit={postDiscussion}>
                  <label>
                    Title
                    <input
                      name="title"
                      required
                      maxLength={140}
                      placeholder="What’s on your mind?"
                      pattern=".*\S.*"
                    />
                  </label>
                  <label>
                    Category
                    <select name="category">
                      {(!live || activeGoal) && (
                        <option>Mission discussion</option>
                      )}
                      <option>Getting started</option>
                      {!live && <option>Dispatches</option>}
                    </select>
                  </label>
                  <label>
                    Your message
                    <textarea
                      name="body"
                      required
                      maxLength={3000}
                      rows={5}
                      placeholder="Share the context. Invite a new perspective."
                    />
                  </label>
                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <button
                    className="button primary"
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? "Posting…" : "Post discussion"} <Send size={15} />
                  </button>
                </form>
              </>
            )}
            {thread && (
              <>
                <div className="eyebrow">{thread.category.toUpperCase()}</div>
                <h2 id="dialog-title">{thread.title}</h2>
                <div className="thread-author">
                  <span className="avatar">
                    {thread.author.slice(0, 2).toUpperCase()}
                  </span>
                  {thread.author}
                  <small>{thread.time}</small>
                </div>
                <p className="thread-body">{thread.body}</p>
                <h3 className="modal-subheading">{threadReplyCount} replies</h3>
                {live && !currentReplyDetail && repliesLoading && (
                  <p role="status">Loading replies…</p>
                )}
                <div className="thread-replies" aria-busy={repliesLoading}>
                  {threadReplies.map((r, i) => (
                    <div key={i}>
                      <span className="avatar">
                        <Users size={14} />
                      </span>
                      <p>{r}</p>
                    </div>
                  ))}
                </div>
                {live && currentReplyDetail && (
                  <nav
                    className="discussion-pagination"
                    aria-label="Reply pages"
                  >
                    <button
                      className="button secondary"
                      disabled={
                        busy ||
                        repliesLoading ||
                        (currentReplyDetail.comments_page || 1) === 1
                      }
                      onClick={() =>
                        changeReplyPage(
                          (currentReplyDetail.comments_page || 1) - 1,
                        )
                      }
                    >
                      Earlier replies
                    </button>
                    <span aria-live="polite">
                      Replies page {currentReplyDetail.comments_page || 1}
                    </span>
                    <button
                      className="button secondary"
                      disabled={
                        busy ||
                        repliesLoading ||
                        !currentReplyDetail.comments_next_page
                      }
                      onClick={() =>
                        changeReplyPage(currentReplyDetail.comments_next_page!)
                      }
                    >
                      Later replies
                    </button>
                  </nav>
                )}
                {user ? (
                  <form onSubmit={reply}>
                    <label>
                      Your reply
                      <textarea
                        name="reply"
                        rows={3}
                        required
                        maxLength={1500}
                        placeholder="Add to the conversation..."
                      />
                    </label>
                    {formError && (
                      <p className="form-error" role="alert">
                        {formError}
                      </p>
                    )}
                    <button
                      className="button primary"
                      type="submit"
                      disabled={busy || (live && repliesLoading)}
                    >
                      {busy ? "Sending…" : "Send reply"} <Send size={15} />
                    </button>
                  </form>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => {
                      selectThread(null);
                      setModal("login");
                    }}
                  >
                    {live
                      ? "Sign in to reply"
                      : "Create a demo profile to reply"}{" "}
                    <ArrowRight size={15} />
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
