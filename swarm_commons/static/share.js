const share = document.querySelector("#share-link");
const copyLink = document.querySelector("#copy-link");
copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(share.value);
    copyLink.textContent = "Link copied";
  } catch {
    share.select();
    copyLink.textContent = "Copy the selected link";
  }
});
