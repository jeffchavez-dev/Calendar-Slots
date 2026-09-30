# Freeslot

**Drag on Google Calendar to mark when you're free, then copy a ready-to-send availability message.**

Freeslot is a small Chrome extension. Mark open times directly on your calendar grid, pick the recipient's timezone, and copy a message like this:

```
Jumping in to help find a time for you to connect. Below are a few openings on our end, please let me know if you need more options.

• Thu Oct 8: 2:00–3:45pm ET
• Mon Oct 12: 3:00–5:00pm ET
• Mon Oct 19: 9:30–11:00am, 1:30–4:00pm ET

Let me know what works best and I'll send across a calendar invite.
Best,
```

It can also turn events you've already scheduled into a quick agenda:

```
• 8:30–9:00am — EIBC and Resilience Energy on interconnection
• 9:00–9:45am — Annie // Jay // Ameet
• 10:00–10:30am — Stand Together // Resilience
• 11:00am–1:30pm — Resilience at Lunar Energy
```

Nothing is written to your calendar. No account, no server, no tracking.

---

## Features

- **Drag to mark free time** in Day or Week view. Drag across several days to repeat the same slot on each.
- **Edit slots after you make them**: drag the middle to move a slot (to another time or day), or drag its top or bottom edge to change the start or end.
- **Timezone presets**: switch the message between **ET, MT, PT** in one click, or pick any other zone under **More**. Times and dates are converted for you, including daylight saving.
- **Bulleted message** with an opening and a closing line you can edit.
- **Agenda mode**: click events on your calendar, or drag across them, to get a `time — title` list of your schedule.
- **Copy** pastes as a real bulleted list in Gmail, Google Docs and Slack, and as plain `•` bullets anywhere else.
- **Email** opens a Gmail draft with the message already filled in.
- **Formats**: short, medium or long dates, and `2:00pm`, compact `2pm`, or 24-hour times.

## Install

Freeslot isn't on the Chrome Web Store. You load it from a folder, which takes about a minute.

1. **Get the code.** On this GitHub page, click the green **Code** button, choose **Download ZIP**, and unzip it.
   You can also clone it with git:
   ```bash
   git clone https://github.com/jeffchavez-dev/Calendar-Slots.git
   ```
2. **Move the folder somewhere permanent**, for example `Documents/Calendar-Slots`. Chrome runs the extension from this folder, so don't delete it.
3. Open **`chrome://extensions`** in Chrome.
4. Turn on **Developer mode** (the switch in the top-right corner).
5. Click **Load unpacked** and select the `Calendar-Slots` folder, the one that contains `manifest.json`. (A downloaded ZIP unzips as `Calendar-Slots-main`, which works too.)
   Don't click **Pack extension**. That creates a file for publishing and doesn't install anything.
6. Optional: click the puzzle-piece icon in Chrome's toolbar and pin **Freeslot**.
7. Open or reload **[Google Calendar](https://calendar.google.com)** and switch to **Day** or **Week** view.

## How to use

1. Click **Offer times** (bottom-right of Calendar), click the Freeslot toolbar icon, or press **Alt+Shift+O**.
2. **Drag** on the calendar to mark a free slot. A single click marks 30 minutes.
3. Adjust as needed:

   | To… | Do this |
   |---|---|
   | Repeat a slot on several days | Drag sideways across the days |
   | Move a slot | Drag its middle |
   | Change the start or end | Drag its top or bottom edge |
   | Remove a slot | Hover it and click **×** |
   | Cancel a drag | Press **Esc** before letting go |

4. Choose the recipient's timezone: **ET**, **MT**, **PT**, or **More**.
5. Click **Copy** (⌘C / Ctrl+C) or **Email** (⌘⇧E / Ctrl+Shift+E).
6. Click **Done** or press **Esc** to stop selecting. Your slots stay until you click **Clear all**.

### Agenda: turn events into a list

1. Open the panel and switch to the **Agenda** tab.
2. **Click an event** to add it to the list, and click it again to remove it. Selected events get an amber outline.
3. Or **drag across the calendar** to add every event in that time range, across several days if you like.
4. Click **Copy**. Each line reads `8:30–9:00am — Event title`. When the list covers more than one day, each day gets a heading.

The **Availability** and **Agenda** tabs keep separate lists. **Clear all** only clears the tab you're on.

While Freeslot is open, clicking the calendar marks free time (Availability) or picks events (Agenda) instead of creating or opening events. Click **Done** to use Calendar normally.

## Settings

Click the **gear icon** in the panel.

| Setting | What it does |
|---|---|
| Opening message | The paragraph before the availability list. Leave it blank to skip it. |
| Closing message | The text after the availability list, such as a sign-off. Leave it blank to skip it. |
| Date format | `10/8`, `Thu Oct 8` (default), or `Thursday, Oct 8` |
| Time format | `2:00–3:45pm`, compact `2–3:45pm`, or 24-hour `14:00–15:45` |
| Include timezone in text | Adds `ET`, `PT` and so on to the end of each line |

Settings are saved in Chrome and kept between sessions.

## How timezones work

Freeslot reads your calendar's **primary time zone** from Google Calendar (**Settings → Time zone**), so a block you draw at 1:30pm on the grid means 1:30pm in that zone, whatever your computer's clock is set to. The timezone buttons then convert those times for the person you're sending to.

To see a second zone while you pick times, turn on **Settings → Time zone → Display secondary time zone** in Google Calendar. Freeslot always uses the **primary** zone, which is the column right next to the grid.

## Updating

- **Downloaded ZIP:** download the new version, replace the files in your extension folder, then go on to the next step.
- **Cloned with git:** run `git pull` in the folder.

Then open `chrome://extensions`, click the **↻ reload** arrow on the Freeslot card, and reload Google Calendar.

If you had slots marked before updating, click **Clear all** and mark them again.

## Troubleshooting

| Problem | Fix |
|---|---|
| Freeslot doesn't appear in `chrome://extensions` | Use **Load unpacked** (not **Pack extension**) and select the folder that contains `manifest.json`. |
| "Blocked by your administrator" or nothing happens | Your Chrome profile is managed by an organization that doesn't allow unpacked extensions. Use a personal Chrome profile, or ask your IT admin. |
| No **Offer times** button | Reload the Calendar tab. The button only appears on `calendar.google.com`. |
| "Switch to Day or Week view" | Month, Year and Schedule views don't have a time grid. |
| Dragging creates Calendar events or feels jumpy | Turn off other Calendar extensions that also handle clicks on the grid, then reload. |
| Agenda shows the wrong title, or times like `10:00–10:15am` for a task | Tasks and some event types don't include a clock time, so Freeslot estimates it from the grid. Edit the copied text if needed. |
| Times are off by several hours | Click **Clear all** and mark the slots again. Slots from older versions were saved with a different timezone assumption. |

## Privacy and permissions

| Permission | Why |
|---|---|
| `calendar.google.com` | To draw slots on the Calendar page and show the panel |
| `storage` | To remember your slots and settings, in your browser only |
| `scripting` | To start Freeslot on a Calendar tab that was already open when you installed it |

Freeslot only reads the time and title of events you pick in **Agenda** mode, and only on your screen. It never changes your calendar or sends data anywhere. **Email** opens a Gmail draft in a new tab, and nothing is sent until you press Send.

## Limitations

- Works in Day and Week views, not Month, Year or Schedule.
- Relies on Google Calendar's page structure. If Google redesigns Calendar, Freeslot may need an update.
- English date and time formatting only.
- Agenda mode reads event times from Google Calendar's labels, and those labels are in English. Tasks and other events without a clock time in their label are timed by their position on the grid, rounded to 15 minutes.

## Project structure

```
Calendar-Slots/
├── manifest.json    Chrome extension manifest (Manifest V3)
├── background.js    Toolbar button and keyboard shortcut
├── content.js       Calendar overlay, drag handling, panel and message formatting
└── icons/           Extension icons (16, 32, 48, 128 px)
```

There's no build step. Edit the files, click ↻ on the Freeslot card at `chrome://extensions`, and reload Calendar.

## License

[MIT](LICENSE)
