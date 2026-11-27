import re

import httpx


REPO_SLUG = r"[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+"
GITHUB_REPO = "https://github.com/"


def valid_repo_slug(slug):
    return isinstance(slug, str) and re.fullmatch(REPO_SLUG, slug) and slug.rsplit("/", 1)[1] not in {".", ".."}


def public_repo_slug(slug):
    if not valid_repo_slug(slug):
        return None
    try:
        url = httpx.URL(f"https://api.github.com/repos/{slug}")
        for _ in range(4):
            response = httpx.get(str(url), trust_env=False, timeout=5)
            if response.status_code == 200:
                metadata = response.json()
                if isinstance(metadata, dict) and metadata.get("private") is False:
                    name = metadata.get("full_name")
                    if valid_repo_slug(name):
                        return name
                break
            if not response.has_redirect_location:
                break
            url = url.join(response.headers["location"])
            if (url.scheme, url.host, url.port) != ("https", "api.github.com", None) or url.userinfo:
                break
    except (httpx.HTTPError, httpx.InvalidURL, ValueError):
        pass
    return None
