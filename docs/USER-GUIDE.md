# Global TSACO Control — User Guide

Last updated: 2026-09-25 · applies to v0.3.0

Global TSACO Control is the web panel for TSACO changeover switching. It
shows the current Main and Backup source for every channel and lets you
change them, either one channel at a time or in bulk.

Its main advantage over the standard Engineer UI is that it can show
**several appliances at once** in a single list, instead of one browser tab
per appliance.

> **This controls live transmission.** Every switch takes effect on real
> hardware immediately. There is no undo, no confirmation dialogue, and no
> staging step. Read [Before you switch anything](#before-you-switch-anything)
> first.

---

## Contents

1. [Opening the app](#1-opening-the-app)
2. [Adding an appliance](#2-adding-an-appliance)
3. [The dashboard](#3-the-dashboard) · [Regions](#3a-regions) · [Groups and pages](#3b-groups-and-pages)
4. [Reading the channel list](#4-reading-the-channel-list)
5. [Selecting channels](#5-selecting-channels)
6. [The lock](#6-the-lock)
7. [Auto and Manual](#7-auto-and-manual)
8. [Switching a source](#8-switching-a-source)
9. [TSACOS OUT OF SYNC](#9-tsacos-out-of-sync)
10. [Working with several appliances](#10-working-with-several-appliances)
11. [Customising the channel list and groups](#11-customising-the-channel-list-and-groups)
12. [The command log](#12-the-command-log)
13. [Before you switch anything](#before-you-switch-anything)
14. [Troubleshooting](#troubleshooting)

---

## 1. Opening the app

Go to the address your team uses — currently:

```
http://172.23.191.54:5173/
```

There is no login screen for the app itself. Credentials are entered per
appliance when you add one.

The first time you open it on a given machine and browser, you land on
**Manage Servers** with an empty list. After that it remembers your
appliances and goes straight to the dashboard.

**Your appliance list is stored in your own browser.** It does not follow you
to another PC or another browser, and it is lost if someone clears the
browser's site data. Two people using the app see whatever each of them has
configured, independently.

---

## 2. Adding an appliance

On the **Manage Servers** page, fill in the *Add server* form:

| Field | What to enter |
|---|---|
| **Label** | Optional friendly name, e.g. `UAT London`. Defaults to the host if blank. This is what appears in the channel list's Server column, so short names work best. |
| **Host / IP** | The appliance address, e.g. `172.23.191.27`. You can include a scheme if needed: `https://10.165.24.17`. |
| **Port** | Optional. Leave blank to use the default for the scheme (80 for http, 443 for https). |
| **Username** | Your appliance login. |
| **Password** | Your appliance password. |

Click **Add & Connect**. The app connects immediately and switches you to the
dashboard.

Watch the **Status** column on the Manage Servers page to confirm it worked:

| Status | Meaning |
|---|---|
| `Connecting…` | In progress. Should resolve within a few seconds. |
| `Connected — 42 channels` | Working. The channel count confirms it loaded properly. |
| `Login failed` | Reached the appliance, but the username or password was rejected. |
| `Connection error: …` | Could not reach it at all. See [Troubleshooting](#troubleshooting). |
| `Disconnected` | Not currently connected. |

To remove an appliance, click **Remove** on its row. That disconnects it and
drops its channels from the list. It does not change anything on the
appliance itself.

The top bar has three pages: **Dashboard**, **Manage Servers** and
**Logs**. You can return here any time with **Manage Servers**.

---

## 3. The dashboard

```
┌────────────────────────────────────────┬──────────────────────────────┐
│ Search…                                │ [ CCC ● ][ LMC ][ Other ][⚙] │ region
│ ┌────────────────────────────────────┐ │ [ All Channels ][ Showbiz ]  │ groups
│ │Server│Channel   │Main│Backup│Mode  │ │ [ Page 1 ][ Page 2 ]         │ pages
│ │UAT-01│601 MTV UK│ A  │  A   │Auto  │ │ ┌────────────┬─────────────┐ │
│ │UAT-01│602 MTV IE│ A  │  B   │Auto ⚠│ │ │uat-01a Main│ .28  Backup │ │ servers
│ │UAT-01│603 Music │ B  │  B   │Manual│ │ │● Connected │● Disconnect.│ │
│ │ ...                                │ │ └────────────┴─────────────┘ │
│ │                                    │ │ [Gang Select][Locked][Sel…]  │
│ │                                    │ │ [   Auto    ][   Manual   ]  │
│ │                                    │ │ Main ACO   [A][B][C][D]      │
│ └────────────────────────────────────┘ │ Backup ACO [A][B][C][D]      │
└────────────────────────────────────────┴──────────────────────────────┘
```

**Left:** the search box and the channel list.
**Right, top to bottom:** region tabs and the settings gear, group tabs, page
tabs (only when there is more than one page), the status of every server in
the region, then the controls — which act on whatever is selected on the left.

---

## 3a. Regions

The top row selects the site: **CCC** or **LMC**. A small green dot marks
your **local** region — the one this install lives in, worked out from the
IP addresses of the appliances configured on the Manage Servers page
(`10.165.x` is CCC, `10.144.x` is LMC). The app opens on that region.

Only that region's channels and servers are shown at a time.

Selecting the other region asks you to confirm first. That is deliberate: a
remote region's channels are on a different site's transmission chain, and
anything you switch there goes to air at that site. Confirm only if you
meant it.

An **Other** tab appears if any configured appliance falls outside both IP
ranges (a lab or UAT box, for example). Without it those appliances would be
invisible on both region tabs.

---

## 3b. Groups and pages

The second row filters the channel list by **group** — plus **All Channels**,
which is always present. Groups are yours to define; see
[§11](#11-customising-the-channel-list-and-groups).

**Pressing the group you are already on** switches the sort order between
channel number and channel name. The small text under the group name tells
you which is active. Sorting by name uses the channel's title, ignoring the
leading number — so `628 - CC Africa` sorts under C, not 6.

The third row appears only when the **currently selected group** holds more
than 30 channels, splitting them into pages of 30. Pick a group of 12 and
there are no page tabs at all.

---

## 4. Reading the channel list

| Column | Meaning |
|---|---|
| **Server** | Which appliance this channel belongs to. |
| **Channel Name** | As configured on the appliance, e.g. `601 - MTV UK`. |
| **Main** | The source the Main ACO is currently on (A, B, C or D). |
| **Backup** | The source the Backup ACO is currently on. |
| **Mode** | `Auto`, `Manual`, or `Partial`. |
| **Status** | Blank normally; red **TSACOS OUT OF SYNC** if Main and Backup disagree. |

The list updates by itself as the hardware changes — including changes made
by someone else, or automatic changeovers. You never need to refresh.

Use the **Search** box to filter by channel name. It filters as you type and
searches across all appliances at once.

---

## 5. Selecting channels

The controls on the right only act on **selected** channels. A selected row
is outlined in blue.

**One channel:** click its row. This replaces any previous selection.

**Several channels:** click **Gang Select** to turn it on, then click each
row you want. Clicking a selected row again removes it. Turning Gang Select
back off clears the selection.

**Everything on screen:** click **Select All in View**. This selects the
channels currently listed — that is, after the region, group, search and page
filters have been applied. It does *not* reach channels on another page,
another group, or another region.

When several channels are selected and they are not all in the same state,
**no button highlights**. That is intentional: rather than showing you one
channel's state and implying it applies to all of them, it shows nothing.
Pressing a button still applies it to the whole selection.

---

## 6. The lock

The controls start **locked**, and re-lock automatically after **one minute**
without a click or keypress.

While locked, the Auto, Manual and A–D buttons are greyed out and do nothing.

Click the green **Locked** button to unlock. It changes to
**Unlocked — 60s** and counts down, so you can always see how long you have
before it re-locks. Any click or keypress resets it to 60. Click the button
again to lock immediately.

The lock only guards against stray clicks in this browser. It does not
restrict anyone else, and it does not lock the appliance.

> If buttons seem to "randomly stop working", check the lock first. The
> countdown makes this obvious now — but a re-lock while you were reading the
> screen is still the most common explanation.

---

## 7. Auto and Manual

With channels selected and the controls unlocked:

- **Auto** — the appliance manages changeover itself, switching on fault
  conditions. This is the normal operating state.
- **Manual** — automatic changeover is off; the source stays where you put it.

The button matching the current mode is highlighted blue.

**Partial** can appear in the Mode column. A channel has several internal
logic blocks, and Partial means some are in Auto and some in Manual. It is a
real hardware state, not a display error. Pressing Auto or Manual sets all of
them.

---

## 8. Switching a source

1. Select the channel or channels.
2. Unlock the controls.
3. Click a letter under **Main ACO** or **Backup ACO**.

The buttons show two different things:

- **Solid blue** — the source the hardware is on now.
- **Dashed amber outline** — a switch has been requested but the hardware has
  not confirmed it yet.

A switch normally goes amber briefly, then solid. If you switch several
channels at once, they will confirm one at a time rather than together —
that is normal, and the amber state is what you are watching move through the
list.

**If nothing happens at all** — no amber, no change — check the lock first.
If it is definitely unlocked, see [Troubleshooting](#troubleshooting); on
some channels a leg will refuse a source it has no valid input for.

---

## 9. TSACOS OUT OF SYNC

This red flag appears when a channel's Main and Backup ACOs are on different
sources.

It is a **fault indicator**. Main and Backup are meant to track together, so
a mismatch means something needs attention — a failed switch, a source
problem, or an automatic changeover that only moved one leg.

To clear it, put both legs back on the same source. In practice, switching
one leg to match the other often brings both into line, because on this
hardware the two legs tend to move together.

If one direction refuses to move, try the other: setting the *other* leg to
the *first* leg's source has worked where the reverse did not.

---

## 10. Working with several appliances

Every appliance in the current region appears in one list, sorted by
appliance and then by your chosen sort order.

The row of status boxes above the controls shows **both legs of every
appliance pair** — the one you added (Main or Backup) and its partner. You
only ever add one of a pair; the appliance tells the app about the other.
Every server you add therefore produces two boxes.

The partner's status is reported by the appliance itself, so it reads
**Unknown** and greys out whenever the app has lost contact with the
appliance — that means "we can't see it from here", not "it's down". A red
box means genuinely down. Partner names are remembered between sessions, so
a failed appliance still shows its pair by name rather than going anonymous.

A server that has never successfully connected shows its partner as an
italic *Paired appliance — Unknown* placeholder, because nothing has told the
app who the partner is yet.

You can select channels across appliances in one gang selection and switch
them together — the app sends the right instruction to each appliance
automatically. There is no need to switch views or repeat yourself.

Two things to keep in mind:

- **Channel numbers can repeat** across appliances. Always check the Server
  column before switching.
- **Each appliance is independent.** One failing or dropping out does not
  affect the others; its channels simply stop updating.

---

## 11. Customising the channel list and groups

The **⚙** button on the region row opens **Channel list & groups**.

**Creating a group:** type a name and click **Add**. It appears immediately
as a tab in the group row. Names must be unique; you'll be told if one is
already taken.

**Filling a group:** select it in the Groups list on the left, then tick
channels on the right. The count beside each group name shows how many
channels it holds. To do a lot at once, use the channel filter box and then
**Add all listed** — for example, filter on `Nick` and add the lot in one
click. The button flips to **Remove all listed** when everything shown is
already in the group.

**Renaming a group:** click **✎**, type the new name, and press Enter or the
tick. Escape cancels.

**Reordering groups:** the **↑** and **↓** buttons move a group, which
changes the order of the tabs on the dashboard.

**Removing a group:** click the **✕** beside it. This only removes the
grouping — no channels or appliance settings are affected.

**Hiding channels:** untick **Visible** to drop a channel from the list
everywhere. Useful for ceased or unused services. Untick nothing and you see
everything.

Channel names come from the appliances and cannot be edited here.

> These settings are stored **in your browser only**. They do not follow you
> to another PC, are not shared with colleagues, and are lost if browser site
> data is cleared. Everyone who wants the same groups has to create them.

---

## 12. The command log

The **Logs** button in the top bar opens a record of every command sent from
this browser, plus connection and authentication events.

| Column | Shows |
|---|---|
| **Time** | When the command was sent, in your local time |
| **Initiator** | The appliance username used, your workstation label if set, and this browser's ID |
| **Destination** | The appliance address, and its system name underneath |
| **Command** | What was asked for in plain terms, with the protocol event underneath. Click a row to see the exact arguments sent. |
| **Response** | What the appliance did about it |

Response values:

| Value | Meaning |
|---|---|
| **Applied** | The appliance confirmed the change, with how long it took — e.g. `main=B — confirmed after 1154 ms` |
| **Sent — awaiting confirmation** | Command sent; nothing back yet |
| **Not confirmed** | 15 seconds passed with no confirming state change. The command may not have taken effect — check the channel. |
| **Acknowledged** | The appliance sent an explicit acknowledgement |
| **OK** / **Error** | Connection and login events |

"Not confirmed" is the one to watch. It is how a silently-ignored switch
shows up — the same failure that otherwise looks like a dead button.

**Export CSV** or **Export JSON** downloads the log for an incident report.
**Clear** empties it and cannot be undone.

### What this log is and is not

It is a record of what **this browser** did. There is no central log server,
so:

- Commands sent by a colleague on another PC are **not** here.
- Changes made by someone using the vendor Engineer UI are **not** here.
- Automatic changeovers performed by the hardware itself are **not** here.
- Clearing browser site data erases it.
- The most recent 500 entries are kept; older ones drop off.

**On the Initiator column:** a browser cannot read its own machine's IP
address — there is no way for a web page to obtain it. So instead of an IP,
the log records who you logged in as plus a per-browser ID. If you want a
machine identifier in there, set **This workstation** under **⚙** (an IP, a
desk name, whatever suits) and it will be stamped on everything logged from
then on.

---

## Before you switch anything

- **Check the region tab.** Confirm you are on the site you think you are —
  the green dot marks your local region.
- **Check the Server column.** Two appliances can both have a channel `601`.
- **Check what is selected.** Selected rows are outlined blue. After
  **Select All in View**, that is every row currently listed.
- **Prefer Auto.** Leaving a channel in Manual means it will not
  automatically protect itself on a source fault.
- **Expect no undo.** Switches apply immediately to live transmission.
- **Test on UAT first.** Verify any unfamiliar operation on a UAT appliance
  before doing it on production.

---

## Troubleshooting

| Symptom | What to do |
|---|---|
| Buttons greyed out | Either nothing is selected, or the controls are locked. Select a channel and click **Locked**. |
| Buttons do nothing when clicked | Check the lock — it re-locks after a minute. If unlocked, see the next two rows. |
| A source button does nothing on one specific channel | Some legs refuse a source with no valid input. Try the equivalent button on the other leg. If it persists, check the source feed itself. |
| Switch went amber and stayed amber | The appliance accepted the request but the hardware has not confirmed. Check the source is present and healthy. |
| Every channel shows `Unknown` | The app is not reading that appliance's state correctly — report it, quoting the appliance address. This indicates a software version it does not recognise. |
| Channel list is empty | Check the region tab first — you may be on a region with no reachable appliances. Then check **Manage Servers**. |
| A channel you expect is missing | Check the group tab (try **All Channels**), the search box, the page tabs, and whether it was hidden in **⚙ → Visible**. If it is missing from all of those, the appliance is no longer reporting it. |
| Groups vanished | They are stored per-browser. A different PC, a different browser, or cleared site data all mean starting again. |
| `Connecting…` never finishes | Your PC cannot reach the appliance. Confirm you are on the right network, and try opening the appliance's own web page in a tab. |
| `Connection error: websocket error` | Same as above — usually no network path, a wrong port, or an HTTPS certificate your browser has not accepted. Open the appliance's address directly in a tab and accept any certificate warning, then try again. |
| `Login failed` | Wrong username or password. Remove the entry and re-add it. |
| Appliance list disappeared | The browser's site data was cleared, or you are on a different PC or browser. Re-add the appliances. |
| Something looks stale or wrong | Reload the page (Ctrl+Shift+R). The app reconnects and reloads all state. |

If a problem persists, useful details to report: the appliance address, the
channel number, what you clicked, what the Status column said, and anything
in the browser console (F12).

---

## Related documents

- [INSTALLATION.md](INSTALLATION.md) — deploying and upgrading the app.
- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — changing the code.
- [ARCHITECTURE.md](ARCHITECTURE.md) — how it works internally.
