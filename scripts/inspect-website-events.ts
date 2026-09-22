import { fetchEventSource } from "../server/eventCatalog";
import { scanWebsiteEvents } from "../src/lib/eventSync";
import { mergeWebsiteEvents } from "../src/core/eventCatalog";
import { validateCatalog } from "../src/core/domain";
import { writeFile } from "node:fs/promises";
const events = await scanWebsiteEvents(
  (q) => fetchEventSource(new URLSearchParams(q)),
  (message) => console.log(message),
);
const result = mergeWebsiteEvents(undefined, events);
validateCatalog(result.catalog);
await writeFile(
  "artifacts/website-event-scan.json",
  JSON.stringify({ events, ...result }, null, 2),
);
console.log(
  JSON.stringify({
    events: events.length,
    offers: events.reduce((n, e) => n + e.offers.length, 0),
    posters: new Set(events.flatMap((e) => e.posterUrls)).size,
    summary: result.summary,
  }),
);
