import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const endpoint = new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp");
const client = new Client({ name: "parkassist-smoke-test", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(endpoint);

try {
  await client.connect(transport);
  const listed = await client.listTools();
  console.log(`Tools: ${listed.tools.map((tool) => tool.name).join(", ")}`);

  const response = await client.callTool({
    name: "get-stale-camera-feeds",
    arguments: { thresholdMinutes: 15, limit: 3, page: 1, includeOutOfService: true },
  });
  const data = response.structuredContent as {
    totalMatches?: number;
    bays?: Array<{ imageUrl?: string; feedState?: string }>;
  } | undefined;
  if (response.isError || !data) {
    const message = response.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join(" ");
    console.error(`Tool call error: ${message || "missing structured content"}`);
  }
  console.log(`Stale/missing feeds: ${data?.totalMatches ?? "unknown"}`);
  console.log(`Returned previews: ${data?.bays?.length ?? 0}`);

  const previewUrl = data?.bays?.find((bay) => bay.imageUrl)?.imageUrl;
  if (previewUrl) {
    const imageResponse = await fetch(previewUrl);
    console.log(`Preview response: ${imageResponse.status} ${imageResponse.headers.get("content-type") ?? "unknown"}`);
    if (!imageResponse.ok) process.exitCode = 1;
  } else {
    console.error("No signed camera preview URL was returned.");
    process.exitCode = 1;
  }
} finally {
  await client.close();
}
