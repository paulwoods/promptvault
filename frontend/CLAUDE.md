# UI Changes

When implementing UI or styling changes, verify the result by running the
frontend dev server or build. Check for lint errors after CSS/HTML changes.
Prefer hardcoded values over CSS `var()` inside data-URI `url()` — CSS variables
inside `url()` don't work reliably across browsers.
