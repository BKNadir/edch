# Code signing policy

Free code signing for the Windows builds of EDCH is provided by [SignPath.io](https://about.signpath.io), with a certificate by the [SignPath Foundation](https://signpath.org).

> Status: the application to the SignPath Foundation is in progress. Until it is approved, the Windows files of the releases are not signed.

## What is signed

Only the files built from this repository's own source code by its automated build on GitHub Actions ([`.github/workflows/build.yml`](.github/workflows/build.yml)): the Windows installers (`.exe`, `.msi`) and the portable `.exe` of each release. Nothing built elsewhere and no third-party program is ever signed.

Every signing request is approved by hand before the release is published.

## Team roles

| Role | Members |
| --- | --- |
| Committers and reviewers | [BKNadir](https://github.com/BKNadir) |
| Approvers | [BKNadir](https://github.com/BKNadir) |

EDCH is largely written with the help of an AI assistant (Claude, by Anthropic). Every change is checked, tested and approved by the maintainer before it is published. Changes proposed by other people (pull requests) are reviewed before being merged. The build scripts and CI configuration are part of the source code and are reviewed the same way.

All team members use multi-factor authentication on GitHub and SignPath.

## Privacy policy

EDCH reads the Elite Dangerous journal on your PC. It has no telemetry, no analytics and no account. Here is every system it talks to, and how to turn it off:

| Service | What is sent | When | How to turn it off |
| --- | --- | --- | --- |
| [Spansh](https://spansh.co.uk) | Your searches (system, material, commodity, route…) and your current system as their starting point | Only when you use a page that searches | Don't use the search pages |
| [EDSM](https://www.edsm.net) | The name of your current system, to show what is known about it | When the Exploration page is open | Don't open the Exploration page |
| [EDDN](https://github.com/EDCD/EDDN) | Market, outfitting, shipyard, jump and scan data, without personal details (as EDDN requires) | While you play | On by default (like EDMC); Sync page |
| EDSM and [Inara](https://inara.cz) journal sync | Your game events | Only if you enter your own API key | Sync page (remove the key) |
| [ntfy.sh](https://ntfy.sh) | Your shared wing missions, end-to-end encrypted with your wing code | Only if you turn wing sharing on | Missions page |
| [GitHub](https://github.com/BKNadir/edch) | A check for a new version, and the download of an update you accept | At start-up and every few hours | Settings → General |

The remote access server (phone, tablet, second screen) is off by default, stays on your local network and only lets in devices that scanned its QR code.

The application logs stay on your PC. Before anything is written to them, API keys, codes, your Windows user name, IP addresses and typed text are removed.

Your settings, keys and wishlist are stored only on your PC, in `%LOCALAPPDATA%\EDCompanionHelper`.

This policy is also shown by the Windows installer.
