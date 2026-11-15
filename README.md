# EDCH – GitHub Pages

This branch is published by GitHub Pages at https://bknadir.github.io/edch/. It only holds:

- `auth/index.html`: the return page of the Frontier login (the `redirect_uri` registered in
  Frontier's Developer Zone). It hands the one-time code to EDCH through an `edch://` link and
  shows it for a copy-paste if the link doesn't open. It stores nothing, loads nothing from
  elsewhere and sends nothing anywhere.
- `index.html`: sends visitors to the project.

The app itself lives on the other branches.
