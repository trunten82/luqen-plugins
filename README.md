# Luqen Plugin Catalogue

The official plugin catalogue for [Luqen](https://github.com/trunten82/luqen), an enterprise accessibility platform. This repository serves as the central registry that the Luqen dashboard uses to discover, download, and install plugins.

## Available Plugins

| Name | Display Name | Type | Version | Description |
|------|-------------|------|---------|-------------|
| `auth-entra` | Azure Entra ID | auth | 1.1.0 | Single sign-on via Azure Entra ID with IdP group-to-team sync |
| `auth-okta` | Okta | auth | 1.0.0 | Single sign-on via Okta OIDC with IdP group-to-team sync |
| `auth-google` | Google Workspace | auth | 1.0.0 | Single sign-on via Google OAuth 2.0 / OpenID Connect |
| `notify-slack` | Slack Notifications | notification | 1.0.0 | Send scan results to Slack channels via webhooks |
| `notify-teams` | Microsoft Teams | notification | 1.0.0 | Send scan results to Teams channels via webhook connectors |
| `notify-email` | Email Notifications | notification | 1.0.0 | Send notifications and reports via SMTP with PDF/Excel |
| `storage-s3` | AWS S3 Storage | storage | 1.0.0 | Store reports in AWS S3 |
| `storage-azure` | Azure Blob Storage | storage | 1.0.0 | Store reports in Azure Blob Storage |
| `storage-mongodb` | MongoDB Storage | storage | 1.0.0 | Store reports in MongoDB |
| `storage-postgres` | PostgreSQL Storage | storage | 1.0.0 | Store reports in PostgreSQL |
| `scanner-axe` | axe-core Scanner | scanner | 1.0.0 | Alternative scanner engine using axe-core |
| `git-host-github` | GitHub | git-host | 1.0.0 | Git integration with GitHub/GitHub Enterprise for PR creation |
| `git-host-gitlab` | GitLab | git-host | 1.0.0 | Git integration with GitLab for merge request creation |
| `git-host-azure-devops` | Azure DevOps | git-host | 1.0.0 | Git integration with Azure DevOps for pull request creation |

**14 plugins** across 5 types: auth, notification, storage, scanner, git-host.

## Plugin Types

| Type | Description |
|------|-------------|
| `auth` | Single sign-on providers (Entra ID, Okta, Google) |
| `notification` | Scan result delivery (Slack, Teams, Email) |
| `storage` | Report storage backends (S3, Azure Blob, MongoDB, PostgreSQL) |
| `scanner` | Alternative scanning engines (axe-core) |
| `git-host` | Git platform integration for reading source files and creating PRs from accessibility fixes |

## Git Host Plugins

Git host plugins enable the **PR creation flow** — developers can select accessibility fix proposals from a scan report and create a pull request directly:

1. **Admin** installs a git-host plugin (e.g., GitHub) from the Plugins page
2. **Admin** configures the host URL via Admin → Git Hosts
3. **Admin** connects a website to a repo via Admin → Repositories (with org assignment)
4. **Developer** stores their PAT via Profile → Git Credentials (encrypted AES-256-GCM)
5. **Developer** runs a scan, selects fixes, clicks "Create PR"

Supported platforms: GitHub (including Enterprise), GitLab (including self-hosted), Azure DevOps (including on-prem).

## Installing

### From the Dashboard

Admin → Plugins → find plugin → **Install** → **Configure** → **Activate**

### From CLI

```bash
luqen-dashboard plugin install git-host-github
luqen-dashboard plugin activate git-host-github
```

## Full Documentation

- [Plugin Development Guide](https://github.com/trunten82/luqen/blob/master/docs/reference/plugin-development.md)
- [Git Host Plugins](https://github.com/trunten82/luqen/blob/master/docs/reference/git-host-plugins.md)
- [Dashboard Configuration](https://github.com/trunten82/luqen/blob/master/docs/reference/dashboard-config.md)

## License

MIT
