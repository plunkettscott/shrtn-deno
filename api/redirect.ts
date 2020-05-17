import { createNowFn, Records } from "../deps.ts";

const CACHE_DURATION_MS = 10000;

const apiKey = Deno.env.get("AIRTABLE_API_KEY");
const baseId = Deno.env.get("AIRTABLE_BASE_ID");
const tableName = "Links";
const viewName = "Grid view";

let links: Records<Link>;
let lastUpdated: number;

export const handler = createNowFn(async (req, res) => {
  const { uid, nocache } = req.query;

  const currentTime = new Date().valueOf();
  const timestamp = new Date().toISOString();

  const ip = req.headers["x-forwarded-for"];
  const protocol = req.headers["x-forwarded-proto"];
  const host = req.headers["host"];
  const encodedUid = encodeURIComponent(`${uid}`);
  const source = `${protocol}://${host}/${encodedUid}`;

  const isForceReload = nocache !== undefined;
  const isLinksEmpty = !links;
  const isCacheExpired = currentTime - lastUpdated > CACHE_DURATION_MS;

  if (isForceReload || isLinksEmpty || isCacheExpired) {
    const endpoint = `https://api.airtable.com/v0/${baseId}/${tableName}/?maxRecords=9999&view=${viewName}`;
    const data = await fetch(endpoint, {
      headers: { ["Authorization"]: `Bearer ${apiKey}` },
    }).then((res) => res.json());

    links = data.records;
    lastUpdated = currentTime;
  }

  for (const { fields } of links) {
    const { enabled = false, resolvedUid, url } = fields;

    if (enabled && resolvedUid === uid) {
      console.log(`[${timestamp}] ${ip} -> ${source} -> ${url}`);
      return res.writeHead(308, { ["Location"]: url });
    }
  }

  console.error(`[${timestamp}] ${ip} -> ${source} -> n/a`);
  return res.writeHead(404, { error: "link not found", source, timestamp });
});

interface Link {
  name: string;
  uid: string;
  resolvedUid: string;
  url: string;
  redirectUrl: string;
  useGeneratedUid: boolean;
  enabled: boolean;
}
