import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from "https://deno.land/x/lambda@1.0.0/mod.ts";
import { soxa } from "https://deno.land/x/soxa@v1.0/mod.ts";
import { Records } from "https://unpkg.com/@types/airtable@0.5.7/index.d.ts";

const CACHE_DURATION_MS = 10000;

const apiKey = Deno.env.get("AIRTABLE_API_KEY");
const baseId = Deno.env.get("AIRTABLE_BASE_ID");
const tableName = "Links";
const viewName = "Grid view";

let links: Records<Link>;
let lastUpdated: number;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<Partial<APIGatewayProxyResult>> => {
  const request = JSON.parse(event.body!);

  const path = new URL(request.path, "https://deno.land");
  const uid = path.searchParams.get("uid");
  const nocache = path.searchParams.get("nocache") !== null;

  const currentTime = new Date().valueOf();
  const timestamp = new Date().toISOString();

  const ip = request.headers["x-forwarded-for"];
  const protocol = request.headers["x-forwarded-proto"];
  const host = request.headers["host"];
  const encodedUid = encodeURIComponent(`${uid}`);
  const source = `${protocol}://${host}/${encodedUid}`;

  const isForceReload = nocache !== undefined;
  const isLinksEmpty = !links;
  const isCacheExpired = currentTime - lastUpdated > CACHE_DURATION_MS;

  if (isForceReload || isLinksEmpty || isCacheExpired) {
    const endpoint = `https://api.airtable.com/v0/${baseId}/${tableName}`;
    const { data } = await soxa.get(endpoint, {
      headers: { ["Authorization"]: `Bearer ${apiKey}` },
      params: { ["view"]: viewName, ["maxRecords"]: 9999 },
    });

    links = data.records;
    lastUpdated = currentTime;
  }

  for (const { fields } of links) {
    const { enabled = false, resolvedUid, url } = fields;

    if (enabled && resolvedUid === uid) {
      console.log(`[${timestamp}] ${ip} -> ${source} -> ${url}`);
      return {
        statusCode: 308,
        headers: { ["Location"]: url },
      };
    }
  }

  console.error(`[${timestamp}] ${ip} -> ${source} -> n/a`);
  return {
    statusCode: 404,
    body: JSON.stringify({ error: "link not found", source, timestamp }),
  };
};

interface Link {
  name: string;
  uid: string;
  resolvedUid: string;
  url: string;
  redirectUrl: string;
  useGeneratedUid: boolean;
  enabled: boolean;
}
