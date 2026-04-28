import { LoggingLevel, LoggingLevelSchema } from '@modelcontextprotocol/sdk/types.js';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { z } from 'zod';
import tools from './tools/index.js';

dotenv.config({ debug: false, quiet: true });

function parseToolNameList(value: string | string[] | undefined | null): string[] {
  if (value == null) return [];
  if (Array.isArray(value))
    return value.map((t: string) => t.trim()).filter((t: string) => t.length > 0);
  return value
    .trim()
    .split(/\s+/)
    .filter((t: string) => t.length > 0);
}

// Config schema for Smithery.ai
export const configSchema = z
  .object({
    braveApiKey: z
      .string()
      .describe('Your API key')
      .default(process.env.BRAVE_API_KEY ?? ''),
    enabledTools: z
      .array(z.string())
      .describe('Enforces a tool whitelist (cannot be used with disabledTools)')
      .optional(),
    disabledTools: z
      .array(z.string())
      .describe('Enforces a tool blacklist (cannot be used with enabledTools)')
      .optional(),
    loggingLevel: z
      .enum([
        'debug',
        'error',
        'info',
        'notice',
        'warning',
        'critical',
        'alert',
        'emergency',
      ] as const)
      .default('info')
      .describe('Desired logging level')
      .optional(),
    stateless: z
      .boolean()
      .default(false)
      .describe('Whether the server should be stateless')
      .optional(),
    skyflowDeidentify: z
      .boolean()
      .default(false)
      .describe('Enable Skyflow de-identification of search queries')
      .optional(),
    skyflowApiKey: z
      .string()
      .default(process.env.SKYFLOW_API_KEY ?? '')
      .describe('Skyflow API key (bearer token)')
      .optional(),
    skyflowVaultId: z
      .string()
      .default(process.env.SKYFLOW_VAULT_ID ?? '')
      .describe('Skyflow vault ID for Detect API')
      .optional(),
    skyflowClusterId: z
      .string()
      .default(process.env.SKYFLOW_CLUSTER_ID ?? '')
      .describe('Skyflow cluster ID (subdomain of vault.skyflowapis.com)')
      .optional(),
    skyflowEntityTypes: z
      .array(z.string())
      .default(['name', 'email_address', 'phone_number', 'ssn', 'credit_card'])
      .describe('Entity types Skyflow Detect should redact')
      .optional(),
    skyflowFailOpen: z
      .boolean()
      .default(false)
      .describe('On Skyflow failure, log and forward original query instead of aborting')
      .optional(),
  })
  .refine(
    (config) => {
      const enabledTools = parseToolNameList(config.enabledTools);
      const disabledTools = parseToolNameList(config.disabledTools);
      return enabledTools.length === 0 || disabledTools.length === 0;
    },
    {
      message: 'enabledTools and disabledTools cannot be used together',
      path: ['enabledTools', 'disabledTools'],
    }
  );

export type SmitheryConfig = z.infer<typeof configSchema>;

type Configuration = {
  transport: 'stdio' | 'http';
  port: number;
  host: string;
  braveApiKey: string;
  loggingLevel: LoggingLevel;
  enabledTools: string[];
  disabledTools: string[];
  stateless: boolean;
  skyflowDeidentify: boolean;
  skyflowApiKey: string;
  skyflowVaultId: string;
  skyflowClusterId: string;
  skyflowEntityTypes: string[];
  skyflowFailOpen: boolean;
};

const DEFAULT_SKYFLOW_ENTITY_TYPES = [
  'name',
  'email_address',
  'phone_number',
  'ssn',
  'credit_card',
];

function parseEntityTypeList(value: string | string[] | undefined | null): string[] {
  if (value == null) return [];
  if (Array.isArray(value))
    return value.map((t: string) => t.trim()).filter((t: string) => t.length > 0);
  return value
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

const state: Configuration & { ready: boolean } = {
  transport: 'stdio',
  port: 8080,
  host: '0.0.0.0',
  braveApiKey: process.env.BRAVE_API_KEY ?? '',
  loggingLevel: 'info',
  ready: false,
  enabledTools: [],
  disabledTools: [],
  stateless: false,
  skyflowDeidentify: false,
  skyflowApiKey: process.env.SKYFLOW_API_KEY ?? '',
  skyflowVaultId: process.env.SKYFLOW_VAULT_ID ?? '',
  skyflowClusterId: process.env.SKYFLOW_CLUSTER_ID ?? '',
  skyflowEntityTypes: [...DEFAULT_SKYFLOW_ENTITY_TYPES],
  skyflowFailOpen: false,
};

export function isToolPermittedByUser(toolName: string): boolean {
  return state.enabledTools.length > 0
    ? state.enabledTools.includes(toolName)
    : state.disabledTools.includes(toolName) === false;
}

export function getOptions(): Configuration | false {
  const program = new Command()
    .option('--brave-api-key <string>', 'Brave API key', process.env.BRAVE_API_KEY ?? '')
    .option('--logging-level <string>', 'Logging level', process.env.BRAVE_MCP_LOG_LEVEL ?? 'info')
    .option(
      '--transport <stdio|http>',
      'transport type',
      process.env.BRAVE_MCP_TRANSPORT ?? 'stdio'
    )
    .option(
      '--enabled-tools <names...>',
      'tools to enable',
      process.env.BRAVE_MCP_ENABLED_TOOLS?.trim().split(' ') ?? []
    )
    .option(
      '--disabled-tools <names...>',
      'tools to disable',
      process.env.BRAVE_MCP_DISABLED_TOOLS?.trim().split(' ') ?? []
    )
    .option(
      '--port <number>',
      'desired port for HTTP transport',
      process.env.BRAVE_MCP_PORT ?? '8080'
    )
    .option(
      '--host <string>',
      'desired host for HTTP transport',
      process.env.BRAVE_MCP_HOST ?? '0.0.0.0'
    )
    .option(
      '--stateless <boolean>',
      'whether the server should be stateless',
      process.env.BRAVE_MCP_STATELESS === 'true' ? true : false
    )
    .option(
      '--skyflow-deidentify <boolean>',
      'enable Skyflow de-identification of search queries',
      process.env.SKYFLOW_DEIDENTIFY === 'true' ? true : false
    )
    .option(
      '--skyflow-api-key <string>',
      'Skyflow API key (bearer token)',
      process.env.SKYFLOW_API_KEY ?? ''
    )
    .option(
      '--skyflow-vault-id <string>',
      'Skyflow vault ID for Detect API',
      process.env.SKYFLOW_VAULT_ID ?? ''
    )
    .option(
      '--skyflow-cluster-id <string>',
      'Skyflow cluster ID (subdomain of vault.skyflowapis.com)',
      process.env.SKYFLOW_CLUSTER_ID ?? ''
    )
    .option(
      '--skyflow-entity-types <list>',
      'comma- or space-separated list of entity types to redact',
      process.env.SKYFLOW_ENTITY_TYPES ?? ''
    )
    .option(
      '--skyflow-fail-open <boolean>',
      'on Skyflow failure, forward original query instead of aborting',
      process.env.SKYFLOW_FAIL_OPEN === 'true' ? true : false
    )
    .allowUnknownOption()
    .parse(process.argv);

  const options = program.opts();
  const toolNames = Object.values(tools).map((tool) => tool.name);

  // Validate tool inclusion configuration
  const enabledTools = parseToolNameList(options.enabledTools);
  const disabledTools = parseToolNameList(options.disabledTools);

  if (enabledTools.length > 0 && disabledTools.length > 0) {
    console.error('Error: --enabled-tools and --disabled-tools cannot be used together');
    return false;
  }

  const invalidToolNames = [...enabledTools, ...disabledTools].filter(
    (t: string) => !toolNames.includes(t)
  );
  if (invalidToolNames.length > 0) {
    console.error(`Invalid tool name(s) used: ${invalidToolNames.join(', ')}`);
    console.error(`Valid tool names are: ${toolNames.join(', ')}`);
    return false;
  }

  // Validate all other options
  if (!['stdio', 'http'].includes(options.transport)) {
    console.error(
      `Invalid --transport value: '${options.transport}'. Must be one of: stdio, http.`
    );
    return false;
  }

  if (!LoggingLevelSchema.options.includes(options.loggingLevel)) {
    console.error(
      `Invalid --logging-level value: '${options.loggingLevel}'. Must be one of: ${LoggingLevelSchema.options.join(', ')}`
    );
    return false;
  }

  if (!options.braveApiKey) {
    console.error(
      'Error: --brave-api-key is required. You can get one at https://brave.com/search/api/.'
    );
    return false;
  }

  if (options.transport === 'http') {
    if (options.port < 1 || options.port > 65535) {
      console.error(
        `Invalid --port value: '${options.port}'. Must be a valid port number between 1 and 65535.`
      );
      return false;
    }

    if (!options.host) {
      console.error('Error: --host is required');
      return false;
    }
  }

  // Normalize stateless to boolean (CLI passes it as string)
  options.stateless = options.stateless === true || options.stateless === 'true';

  // Normalize Skyflow flags
  options.skyflowDeidentify =
    options.skyflowDeidentify === true || options.skyflowDeidentify === 'true';
  options.skyflowFailOpen = options.skyflowFailOpen === true || options.skyflowFailOpen === 'true';

  const parsedEntityTypes = parseEntityTypeList(options.skyflowEntityTypes);
  options.skyflowEntityTypes =
    parsedEntityTypes.length > 0 ? parsedEntityTypes : [...DEFAULT_SKYFLOW_ENTITY_TYPES];

  // Fail-fast on Skyflow misconfiguration when enabled
  if (options.skyflowDeidentify) {
    const missing: string[] = [];
    if (!options.skyflowApiKey) missing.push('--skyflow-api-key (or SKYFLOW_API_KEY)');
    if (!options.skyflowVaultId) missing.push('--skyflow-vault-id (or SKYFLOW_VAULT_ID)');
    if (!options.skyflowClusterId) missing.push('--skyflow-cluster-id (or SKYFLOW_CLUSTER_ID)');
    if (missing.length > 0) {
      console.error(
        `Error: --skyflow-deidentify is enabled but the following are missing: ${missing.join(', ')}`
      );
      return false;
    }
  }

  // Update state
  state.braveApiKey = options.braveApiKey;
  state.transport = options.transport;
  state.port = options.port;
  state.host = options.host;
  state.loggingLevel = options.loggingLevel;
  state.enabledTools = enabledTools;
  state.disabledTools = disabledTools;
  state.stateless = options.stateless;
  state.skyflowDeidentify = options.skyflowDeidentify;
  state.skyflowApiKey = options.skyflowApiKey;
  state.skyflowVaultId = options.skyflowVaultId;
  state.skyflowClusterId = options.skyflowClusterId;
  state.skyflowEntityTypes = options.skyflowEntityTypes;
  state.skyflowFailOpen = options.skyflowFailOpen;
  state.ready = true;

  return options as Configuration;
}

export function setOptions(options: SmitheryConfig) {
  Object.assign(state, options);
  if (state.skyflowDeidentify) {
    const missing: string[] = [];
    if (!state.skyflowApiKey) missing.push('skyflowApiKey');
    if (!state.skyflowVaultId) missing.push('skyflowVaultId');
    if (!state.skyflowClusterId) missing.push('skyflowClusterId');
    if (missing.length > 0) {
      throw new Error(
        `skyflowDeidentify is enabled but the following config fields are missing: ${missing.join(', ')}`
      );
    }
  }
  return state;
}

export default state;
