# OAuth callback

This directory is reserved for the public HTTPS callback page used by the Google Calendar OAuth flow.

The callback must not contain client secrets or long-lived Google credentials. The implementation will use PKCE and return the authorization result to the Obsidian plugin without publishing tokens.

The callback page will be enabled through GitHub Pages after the plugin authentication flow has been implemented and tested on desktop, Android, and iOS.
