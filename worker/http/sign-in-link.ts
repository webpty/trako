// The link in a sign-in message. It spends the same single-use code the six
// digits would have spent, so a link that has been used, or has sat too long,
// fails exactly as a stale code does.

import { build } from "../app";
import { redeemCode } from "../domain/signin";
import { verify } from "../domain/tokens";
import { setSession } from "./cookies";

export async function handleSignInLink(request: Request, env: Env): Promise<Response> {
  const app = build(env);
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const token = decodeURIComponent(url.pathname.slice("/in/".length));

  const subject = await verify(app.sessionSecret, "signin", token);
  const split = subject?.lastIndexOf(":") ?? -1;
  if (!subject || split < 1) return away(url, "link-no-good");

  const outcome = await redeemCode(app, subject.slice(0, split), subject.slice(split + 1));
  if (outcome === "wrong" || outcome === "locked") return away(url, "link-no-good");

  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": setSession(outcome.sessionId, outcome.expiresAt, secure),
    },
  });
}

/** Back to the front page, with enough in the address for it to say what went
    wrong rather than looking like nothing happened. */
function away(url: URL, why: string): Response {
  return new Response(null, { status: 303, headers: { location: `${url.origin}/?${why}` } });
}
