const fs = require('fs');
const path = require('path');
const https = require('https');
const tl = require('azure-pipelines-task-lib/task');

// SendGrid rejects messages larger than 30 MB in total. Base64 inflates
// content by ~4/3, so compare against the encoded size.
const MAX_TOTAL_ENCODED_BYTES = 30 * 1024 * 1024;

const CONTENT_TYPES = {
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.gif': 'image/gif',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.log': 'text/plain',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xml': 'application/xml',
    '.zip': 'application/zip'
};

function parseAddressList(value) {
    if (!value) {
        return [];
    }
    return value
        .split(/[,;]/)
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => ({ email: a }));
}

function collectAttachmentPaths() {
    const files = [];

    if (tl.filePathSupplied('attachment')) {
        const single = tl.getPathInput('attachment', false, false);
        if (single) {
            if (!fs.existsSync(single) || !fs.statSync(single).isFile()) {
                throw new Error(`Attachment not found or is not a file: ${single}`);
            }
            files.push(single);
        }
    }

    const patternsRaw = tl.getInput('additionalAttachments', false);
    if (patternsRaw) {
        const patterns = patternsRaw
            .split(/\r?\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

        if (patterns.length > 0) {
            const root = tl.getVariable('System.DefaultWorkingDirectory') || process.cwd();
            const matches = tl
                .findMatch(root, patterns)
                .filter(m => fs.existsSync(m) && fs.statSync(m).isFile());

            if (matches.length === 0 && tl.getBoolInput('failIfNoAttachmentsFound', false)) {
                throw new Error(
                    `No files matched the attachment pattern(s):\n${patterns.join('\n')}\n` +
                    `Search root: ${root}. Uncheck 'Fail if attachment patterns match no files' to send anyway.`
                );
            }
            files.push(...matches);
        }
    }

    // De-duplicate while preserving order.
    return [...new Set(files.map(f => path.resolve(f)))];
}

function buildAttachments(filePaths) {
    const attachments = [];
    let totalEncoded = 0;

    for (const filePath of filePaths) {
        const encoded = fs.readFileSync(filePath).toString('base64');
        totalEncoded += encoded.length;
        attachments.push({
            content: encoded,
            filename: path.basename(filePath),
            type: CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            disposition: 'attachment'
        });
        console.log(`Attaching: ${filePath} (${fs.statSync(filePath).size} bytes)`);
    }

    if (totalEncoded > MAX_TOTAL_ENCODED_BYTES) {
        throw new Error(
            `Total attachment size (${(totalEncoded / (1024 * 1024)).toFixed(1)} MB encoded) exceeds ` +
            `SendGrid's 30 MB message limit. Reduce the attachments, or upload the files to storage ` +
            `and send a download link instead.`
        );
    }

    return attachments;
}

function sendMail(apiKey, payload, timeoutSeconds) {
    const body = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: 'api.sendgrid.com',
                path: '/v3/mail/send',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                },
                timeout: timeoutSeconds * 1000
            },
            res => {
                let responseBody = '';
                res.on('data', chunk => (responseBody += chunk));
                res.on('end', () => {
                    if (res.statusCode === 202) {
                        resolve();
                    } else {
                        let details = responseBody;
                        try {
                            details = JSON.parse(responseBody)
                                .errors.map(e => e.field ? `${e.field}: ${e.message}` : e.message)
                                .join('; ');
                        } catch (_) {
                            // keep raw body
                        }
                        reject(new Error(`SendGrid API returned HTTP ${res.statusCode}: ${details}`));
                    }
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error(`SendGrid API call timed out after ${timeoutSeconds} seconds.`));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function run() {
    try {
        const apiKey = tl.getInput('apiKey', true).trim();
        // Ensure the key is masked in logs even if it was not passed as a secret variable.
        tl.setSecret(apiKey);

        const to = parseAddressList(tl.getInput('toAddresses', true));
        if (to.length === 0) {
            throw new Error("The 'To' field contains no valid addresses.");
        }
        const cc = parseAddressList(tl.getInput('ccAddresses', false));
        const bcc = parseAddressList(tl.getInput('bccAddresses', false));

        const personalization = { to };
        if (cc.length > 0) {
            personalization.cc = cc;
        }
        if (bcc.length > 0) {
            personalization.bcc = bcc;
        }

        const from = { email: tl.getInput('fromAddress', true).trim() };
        const fromName = tl.getInput('fromName', false);
        if (fromName) {
            from.name = fromName.trim();
        }

        const bodyIsHtml = tl.getBoolInput('bodyIsHtml', false);
        // SendGrid rejects empty content values, so fall back to a single space.
        const bodyText = tl.getInput('body', false) || ' ';

        const payload = {
            personalizations: [personalization],
            from,
            subject: tl.getInput('subject', true),
            content: [
                {
                    type: bodyIsHtml ? 'text/html' : 'text/plain',
                    value: bodyText
                }
            ]
        };

        const attachmentPaths = collectAttachmentPaths();
        if (attachmentPaths.length > 0) {
            payload.attachments = buildAttachments(attachmentPaths);
        } else {
            console.log('No attachments specified; sending email without attachments.');
        }

        const timeoutSeconds = parseInt(tl.getInput('timeoutSeconds', false) || '60', 10) || 60;

        console.log(`Sending email to ${to.map(a => a.email).join(', ')} via SendGrid...`);
        await sendMail(apiKey, payload, timeoutSeconds);
        console.log('Email accepted by SendGrid (HTTP 202).');
        tl.setResult(tl.TaskResult.Succeeded, 'Email sent successfully.');
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

run();
