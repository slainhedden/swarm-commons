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
  item.textContent = "@" + event.actor + " · " + event.summary;
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
    const response = await fetch("/api/v1/stats");
    if (response.ok) document.querySelector("#running").textContent = (await response.json()).agents_running;
  } catch {}
}, 5000);
