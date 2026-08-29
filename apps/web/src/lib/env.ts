export function getApiUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    throw new Error('API_URL is not set. Copy apps/web/.env.example to .env.local and set it.');
  }
  return url;
}
