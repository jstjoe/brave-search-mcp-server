import config from '../config.js';
import type {
  DeidentifyStringRequest,
  DeidentifyStringResponse,
  StringResponseEntity,
} from './types.js';

const DETECT_PATH = '/v1/detect/deidentify/string';

function getDetectUrl(): string {
  const override = process.env.SKYFLOW_DETECT_URL?.trim();
  if (override) return override;
  return `https://${config.skyflowClusterId}.vault.skyflowapis.com${DETECT_PATH}`;
}

function reconstructFromEntities(entities: StringResponseEntity[], original: string): string {
  const sorted = [...entities]
    .filter((e) => e.location && Number.isFinite(e.location.start_index))
    .sort((a, b) => a.location!.start_index - b.location!.start_index);
  let result = '';
  let cursor = 0;
  for (const e of sorted) {
    const { start_index, end_index } = e.location!;
    if (start_index < cursor || end_index < start_index || end_index > original.length) continue;
    result += original.slice(cursor, start_index);
    const placeholder = e.token ?? `[${(e.entity_type ?? 'REDACTED').toUpperCase()}]`;
    result += placeholder;
    cursor = end_index;
  }
  result += original.slice(cursor);
  return result;
}

export async function deidentify(text: string): Promise<string> {
  if (!text) return text;

  const url = getDetectUrl();
  const requestBody: DeidentifyStringRequest = {
    text,
    vault_id: config.skyflowVaultId,
    entity_types: config.skyflowEntityTypes.length > 0 ? config.skyflowEntityTypes : undefined,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.skyflowApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    throw new Error(
      `Skyflow Detect request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      detail += `\n${await response.text()}`;
    } catch {}
    throw new Error(`Skyflow Detect returned error: ${detail}`);
  }

  const body = (await response.json()) as DeidentifyStringResponse;

  if (typeof body.processed_text === 'string') return body.processed_text;
  if (Array.isArray(body.entities) && body.entities.length > 0) {
    return reconstructFromEntities(body.entities, text);
  }
  throw new Error('Skyflow Detect response contained no processed_text or entities');
}

export default { deidentify };
