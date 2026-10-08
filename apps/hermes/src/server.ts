import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPrintshopMcpServer } from './tools.ts';

const server = createPrintshopMcpServer();
await server.connect(new StdioServerTransport());
