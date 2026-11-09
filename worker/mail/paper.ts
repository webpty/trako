// The one message the site sends in this phase: six digits and a link that
// does the same job in one tap. Plain words, no pictures, nothing that needs
// loading from anywhere.

const PAGE = "#0d0d11";

export interface Letter {
  subject: string;
  text: string;
  html: string;
}

export function codeLetter(code: string, link: string, minutes: number): Letter {
  const subject = `${code} is your sign-in code`;

  const text = [
    `Your code is ${code}.`,
    "",
    `Or open this link to sign in without typing it:`,
    link,
    "",
    `The code is good for ${minutes} minutes.`,
    "If you did not ask for it, nothing has happened and you can ignore this.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${PAGE}">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px">
    <tr><td style="padding:24px">
      <p style="margin:0 0 16px;font-size:15px">Your sign-in code:</p>
      <p style="margin:0 0 20px;font-size:34px;letter-spacing:6px;font-weight:600;font-variant-numeric:tabular-nums">${code}</p>
      <p style="margin:0 0 20px">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:${PAGE};color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px">Sign in without typing it</a>
      </p>
      <p style="margin:0;font-size:13px;color:#52525b">The code is good for ${minutes} minutes. If you did not ask for it, nothing has happened.</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
