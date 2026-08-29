# SendGrid Email with Attachments

An Azure Pipelines task that sends email through the [SendGrid v3 API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send) — **with attachments**, which the classic workarounds (inline PowerShell scripts) make painful.

Works in **Classic** and **YAML** pipelines, on **Windows, Linux, and macOS** agents (Node handler, no PowerShell dependency).

## Features

- **Attachments three ways**
  - Pick a file from your repository with the file picker (Classic editor)
  - Use a variable path, e.g. `$(Build.ArtifactStagingDirectory)/report.pdf`
  - Match multiple files with wildcard patterns, e.g. `drop/**/*.zip`
- To / Cc / Bcc with multiple recipients (comma or semicolon separated)
- Plain-text or HTML body
- Correct MIME content types for common file extensions
- Guards against SendGrid's 30 MB total message limit with a clear error
- API key is registered as a secret so it is masked in logs

## Setup

1. Create a SendGrid API key with **Mail Send** permission (SendGrid → Settings → API Keys).
2. In your pipeline, add a variable (e.g. `SendGridApiKey`), paste the key, and **click the lock icon** to make it secret. Variable groups / Azure Key Vault also work.
3. Verify your sender address or domain in SendGrid (Sender Authentication), otherwise SendGrid rejects the mail.

## Usage

### Classic pipelines

Add the **Send Email via SendGrid** task (Utility category) and fill in the fields. For the attachment, either click **…** to browse, or type a variable-based path.

### YAML pipelines

```yaml
- task: SendGridEmail@1
  displayName: 'Email build report'
  inputs:
    apiKey: '$(SendGridApiKey)'
    fromAddress: 'builds@yourcompany.com'
    fromName: 'Build Pipeline'
    toAddresses: 'team@yourcompany.com; qa@yourcompany.com'
    subject: 'Build $(Build.BuildNumber) finished'
    body: 'The build has finished. Report attached.'
    attachment: '$(Build.ArtifactStagingDirectory)/report.pdf'
    additionalAttachments: |
      $(Build.ArtifactStagingDirectory)/logs/*.txt
      drop/**/*.zip
```

## Inputs

| Input | Required | Description |
| --- | --- | --- |
| `apiKey` | Yes | SendGrid API key. Always pass a **secret variable**, e.g. `$(SendGridApiKey)`. |
| `fromAddress` | Yes | Verified sender address. |
| `fromName` | No | Sender display name. |
| `toAddresses` | Yes | Recipients, separated by `,` or `;`. |
| `ccAddresses` / `bccAddresses` | No | Cc / Bcc recipients. |
| `subject` | Yes | Subject line; variables supported. |
| `body` | No | Email body. |
| `bodyIsHtml` | No | Send body as `text/html` (default `false`). |
| `attachment` | No | Single file: repository file picker or variable path. |
| `additionalAttachments` | No | One pattern per line; wildcards supported; relative paths resolve against `$(System.DefaultWorkingDirectory)`. |
| `failIfNoAttachmentsFound` | No | Fail when patterns match nothing (default `true`). |
| `timeoutSeconds` | No | API timeout (default `60`). |

## Limits and notes

- SendGrid rejects messages over **30 MB total**. For bigger payloads, publish the file to storage and email a link instead.
- The task talks directly to `api.sendgrid.com` over HTTPS (port 443); self-hosted agents behind a firewall need that outbound access.

## Building and publishing (for maintainers)

Prerequisites: Node.js LTS, then `npm install -g tfx-cli`.

```powershell
./buildAndPackage.ps1
```

This restores the task's dependencies and produces a `.vsix` in the repo root.

To publish to the Visual Studio Marketplace:

1. Create a publisher at https://marketplace.visualstudio.com/manage (one-time).
2. Set `publisher` in `vss-extension.json` to your publisher ID.
3. Create an Azure DevOps PAT with the **Marketplace → Manage** scope.
4. `tfx extension publish --vsix <file>.vsix --token <PAT>`
5. Start private (`"public": false`), share it to a test organization from the publisher portal, verify a real pipeline run, then flip `"public": true` and republish to make it available to everyone.

Remember to bump **both** the extension version (`vss-extension.json`) and the task version (`task.json`) on every update — the Marketplace rejects re-uploads of the same version, and agents cache tasks by version.

## Support this project

Found a bug or have a feature request? [Open an issue](https://github.com/ParagSaxena/azure-devops-sendgrid-email/issues).

Starring the [GitHub repository](https://github.com/ParagSaxena/azure-devops-sendgrid-email) helps other Azure DevOps users find the task.

## License

[MIT](https://github.com/ParagSaxena/azure-devops-sendgrid-email/blob/main/LICENSE)
