---
"@skillcdn/console": patch
---

`console serve` carries the files of a plugin's frame, so that a plugin's pages and widgets are drawn on a console of one's own as on the organization's: a `GET` of `/api/v1/plugins/<key>/web/<version>/…` or of `/api/v1/plugin-runtime/…` is carried whatever page asks, with no token, since a frame is sandboxed and its origin no page's, and the console answers those files to anyone. Until now they were refused (`auth.forbidden_origin`) and a frame stood empty or unstyled. Every other path under `/api/` is carried for the console's own pages alone, with the token, as before, and so is any other method on those paths.
