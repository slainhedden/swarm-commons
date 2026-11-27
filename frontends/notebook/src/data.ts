export type Goal = {
  id: string;
  title: string;
  description: string;
  category: string;
  votes: number;
  status: string;
  progress: number;
  agents: number;
  total?: number;
  done?: number;
  repoUrl?: string;
  live?: boolean;
  viewerVoted?: boolean;
};
export type Note = {
  id: string;
  name: string;
  initials: string;
  color: string;
  type: string;
  title: string;
  body: string;
  replies: number;
  time: string;
  category: string;
};
export type Agent = {
  name: string;
  initials: string;
  color: string;
  task: string;
  tool: string;
  state: string;
  branch: string;
  taskId?: number;
  prUrl?: string;
};
export const demoGoals: Goal[] = [
  {
    id: "food-map",
    title: "A little map. A lot less hunger.",
    description:
      "An open, always-free map of food pantries, community fridges, and free meals. So finding a helping hand is one less thing to worry about.",
    category: "Community",
    votes: 1248,
    status: "Building",
    progress: 68,
    agents: 128,
  },
  {
    id: "plain-language",
    title: "Government forms, in human.",
    description:
      "Turn confusing public forms into clear, accessible step-by-step guides. No legal jargon required.",
    category: "Accessibility",
    votes: 892,
    status: "Up next",
    progress: 0,
    agents: 0,
  },
  {
    id: "repair-library",
    title: "The fix-it library",
    description:
      "A free, searchable home for repair manuals. Keep good things out of the landfill.",
    category: "Climate",
    votes: 761,
    status: "Up next",
    progress: 0,
    agents: 0,
  },
  {
    id: "open-trails",
    title: "Trails for every body",
    description:
      "Open accessibility data for parks and trails. A little more outdoors, for everyone.",
    category: "Accessibility",
    votes: 624,
    status: "Up next",
    progress: 0,
    agents: 0,
  },
  {
    id: "civic-data",
    title: "Small-town data, opened up",
    description:
      "Make local public datasets easy to discover, download, and use.",
    category: "Open data",
    votes: 483,
    status: "Shipped",
    progress: 100,
    agents: 0,
  },
];
export const notes: Note[] = [
  {
    id: "one",
    name: "Maya",
    initials: "MK",
    color: "pink",
    type: "Build log",
    title: "The first 2,000 pantries are on the map!",
    body: "The import pipeline is finally in. We now have 2,000 sample locations across 14 states, deduplicated and ready for review. Next up: opening hours and wheelchair accessibility. If you love tidy data, there is a little task with your name on it.",
    replies: 18,
    time: "12 min ago",
    category: "food-map",
  },
  {
    id: "two",
    name: "Theo",
    initials: "TR",
    color: "purple",
    type: "Question",
    title: "How do we keep the data fresh?",
    body: "A pantry that has closed is worse than no listing. Could we add a “last verified” field and make it easy for local volunteers to check a location? I would love to hear from anyone who works with a community fridge.",
    replies: 9,
    time: "38 min ago",
    category: "food-map",
  },
  {
    id: "three",
    name: "Jules",
    initials: "JL",
    color: "green",
    type: "Idea",
    title: "A tiny task is still a contribution.",
    body: "You do not need to leave an agent running all day. One test, one documented edge case, one accessible button: it all adds up. I wrote up a few beginner-friendly tasks to help new people find a place to start.",
    replies: 24,
    time: "1 hour ago",
    category: "community",
  },
];
export const agents: Agent[] = [
  {
    name: "Maya’s Claude",
    initials: "MK",
    color: "pink",
    task: "Adding pantry opening hours",
    tool: "Claude Code",
    state: "Building",
    branch: "task/opening-hours",
  },
  {
    name: "Theo’s Codex",
    initials: "TR",
    color: "purple",
    task: "Testing location search",
    tool: "Codex",
    state: "Testing",
    branch: "task/location-search",
  },
  {
    name: "Jules’s Claude",
    initials: "JL",
    color: "green",
    task: "Making the map keyboard-friendly",
    tool: "Claude Code",
    state: "Building",
    branch: "task/keyboard-nav",
  },
  {
    name: "Ari’s Codex",
    initials: "AC",
    color: "yellow",
    task: "Reviewing duplicate locations",
    tool: "Codex",
    state: "Reviewing",
    branch: "task/dedupe",
  },
];
export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`swarm-notebook:${key}`);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(`swarm-notebook:${key}`, JSON.stringify(value));
  } catch {
    /* Private browsing can disable storage. */
  }
}
