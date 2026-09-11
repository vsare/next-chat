"use server";

import {
  DEFAULT_MCP_CONFIG,
  McpConfigData,
  McpRequestMessage,
  ServerConfig,
  ServerStatusResponse,
} from "./types";

const MCP_DISABLED_MESSAGE =
  "Server-side MCP command execution is disabled for security reasons.";

function rejectMcpExecution(): never {
  throw new Error(MCP_DISABLED_MESSAGE);
}

export async function getClientsStatus(): Promise<
  Record<string, ServerStatusResponse>
> {
  return {};
}

export async function getClientTools(_clientId: string) {
  return null;
}

export async function getAvailableClientsCount() {
  return 0;
}

export async function getAllTools() {
  return [];
}

export async function initializeMcpSystem(): Promise<McpConfigData> {
  return DEFAULT_MCP_CONFIG;
}

export async function addMcpServer(
  _clientId: string,
  _config: ServerConfig,
): Promise<McpConfigData> {
  return rejectMcpExecution();
}

export async function pauseMcpServer(
  _clientId: string,
): Promise<McpConfigData> {
  return rejectMcpExecution();
}

export async function resumeMcpServer(_clientId: string): Promise<void> {
  return rejectMcpExecution();
}

export async function removeMcpServer(
  _clientId: string,
): Promise<McpConfigData> {
  return rejectMcpExecution();
}

export async function restartAllClients(): Promise<McpConfigData> {
  return rejectMcpExecution();
}

export async function executeMcpAction(
  _clientId: string,
  _request: McpRequestMessage,
) {
  return rejectMcpExecution();
}

export async function getMcpConfigFromFile(): Promise<McpConfigData> {
  return DEFAULT_MCP_CONFIG;
}

export async function isMcpEnabled() {
  return false;
}
