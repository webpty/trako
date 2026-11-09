import type { Mailer, OutgoingMail } from "../../ports";

export class CloudflareMailer implements Mailer {
  constructor(private readonly binding: SendEmailBinding) {}

  async send(mail: OutgoingMail): Promise<void> {
    await this.binding.send({
      to: mail.to,
      from: mail.fromName ? { email: mail.from, name: mail.fromName } : mail.from,
      subject: mail.subject,
      ...(mail.text ? { text: mail.text } : {}),
      ...(mail.html ? { html: mail.html } : {}),
      ...(mail.inline?.length
        ? {
            attachments: mail.inline.map((file) => ({
              content: file.content,
              filename: file.filename,
              type: file.type,
              disposition: "inline" as const,
              contentId: file.contentId,
            })),
          }
        : {}),
    });
  }
}

/** Development has no sender. The message is written to the log so a sign-in
    code can be read off it, and nothing leaves the machine. */
export class LoggingMailer implements Mailer {
  async send(mail: OutgoingMail): Promise<void> {
    console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text ?? ""}`);
  }
}
