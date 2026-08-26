# Security

## Credentials

Do not commit Google OAuth client secrets, refresh tokens, access tokens, cookies, vault data, or local Obsidian settings to this repository.

The public plugin will use a mobile/desktop-compatible OAuth flow with PKCE. Long-lived credentials will be kept outside Git-tracked plugin settings.

If a credential is ever committed accidentally, revoke/rotate it immediately and remove it from repository history before treating the repository as clean.
