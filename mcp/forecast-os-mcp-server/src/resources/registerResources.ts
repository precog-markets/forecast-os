import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listForecastOSResources,
  readForecastOSResource,
} from "../services/skillRepository.js";

export function registerForecastOSResources(server: McpServer): void {
  for (const resource of listForecastOSResources()) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.name,
        description: `Read-only ForecastOS resource: ${resource.uri}`,
        mimeType: resource.mimeType,
      },
      async () => {
        const content = await readForecastOSResource(resource.uri);
        return {
          contents: [
            {
              uri: content.uri,
              mimeType: content.mimeType,
              text: content.text,
            },
          ],
        };
      },
    );
  }
}
