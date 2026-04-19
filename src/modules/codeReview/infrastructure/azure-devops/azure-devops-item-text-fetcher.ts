const MAX_TEXT_BYTES = 120_000;

export async function fetchGitItemTextAtCommit(input: {
  readonly collectionBaseUrl: string;
  readonly repositoryId: string;
  readonly commitId: string;
  readonly repositoryPath: string;
  readonly headers: HeadersInit;
}): Promise<string | null> {
  const normalizedPath = normalizeRepositoryPath(input.repositoryPath);
  const itemsUrl = `${input.collectionBaseUrl}/_apis/git/repositories/${encodeURIComponent(input.repositoryId)}/items?path=${encodeURIComponent(normalizedPath)}&versionDescriptor.version=${encodeURIComponent(input.commitId)}&versionDescriptor.versionType=commit&includeContent=true&api-version=7.0`;

  const response = await fetch(itemsUrl, {
    headers: input.headers
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return readJsonItemBody(await response.json());
  }

  const text = await response.text();
  return truncateText(text, MAX_TEXT_BYTES);
}

function normalizeRepositoryPath(repositoryPath: string): string {
  const trimmed = repositoryPath.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function readJsonItemBody(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const content = record.content ?? record.Content;

  if (typeof content !== "string") {
    return null;
  }

  const metadata = (record.contentMetadata ?? record.ContentMetadata) as Record<string, unknown> | undefined;
  const encodingRaw = metadata?.encoding ?? metadata?.Encoding;
  const encoding = typeof encodingRaw === "string" ? encodingRaw.toLowerCase() : "";

  if (encoding === "base64") {
    return decodeBase64TextIfUtf8(content);
  }

  return truncateText(content, MAX_TEXT_BYTES);
}

function decodeBase64TextIfUtf8(base64: string): string | null {
  const buffer = Buffer.from(base64, "base64");

  if (buffer.includes(0)) {
    return null;
  }

  const text = buffer.toString("utf8");
  return truncateText(text, MAX_TEXT_BYTES);
}

function truncateText(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, "utf8");

  if (buffer.length <= maxBytes) {
    return text;
  }

  const slice = buffer.subarray(0, maxBytes).toString("utf8");
  return `${slice}\n\n... (conteudo truncado para revisao automatica)\n`;
}
