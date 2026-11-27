const activity = document.querySelector("#activity");
const connection = document.querySelector("#connection");
const params = new URLSearchParams({after: activity.dataset.cursor});
if (activity.dataset.goal) params.set("goal_id", activity.dataset.goal);
const stream = new EventSource("/api/v1/events/stream?" + params);
stream.onopen = () => { connection.textContent = "LIVE UPDATES CONNECTED"; };
stream.onerror = () => { connection.textContent = "RECONNECTING TO LIVE UPDATES"; };
stream.onmessage = ({data}) => {
  const event = JSON.parse(data);
  const item = document.createElement("li");
  const badge = document.createElement("span");
  badge.className = "badge event-" + event.kind;
  badge.textContent = event.kind;
  const time = document.createElement("time");
  time.className = "meta";
  time.dateTime = new Date(event.created_at * 1000).toISOString();
  time.textContent = time.dateTime;
  item.append(badge, " ", time);
  if (event.run_id) {
    const run = document.createElement("span");
    run.className = "meta";
    run.title = event.run_id;
    run.textContent = "Run " + event.run_id.slice(0, 8);
    item.append(" ", run);
  }
  item.append(" @" + event.actor + " · " + event.summary);
  if (event.task_id) {
    const link = document.createElement("a");
    link.href = "/goals/" + event.goal_id + "#task-" + event.task_id;
    link.textContent = " Task #" + event.task_id;
    item.append(link);
  }
  activity.prepend(item);
  if (activity.children.length > 100) activity.lastElementChild.remove();
};
setInterval(async () => {
  try {
    const query = activity.dataset.goal ? "?goal_id=" + encodeURIComponent(activity.dataset.goal) : "";
    const response = await fetch("/api/v1/stats" + query);
    if (response.ok) document.querySelector("#running").textContent = (await response.json()).agents_running;
  } catch {}
}, 5000);
