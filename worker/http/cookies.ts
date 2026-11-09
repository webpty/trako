// The one cookie the site sets. Named after the project so it cannot collide
// with another site sharing a machine in development.

const NAME = "trako_session";

export function readSession(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === NAME) return rest.join("=") || null;
  }
  return null;
}

export function setSession(id: string, expiresAt: Date, secure: boolean): string {
  return [
    `${NAME}=${id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Expires=${expiresAt.toUTCString()}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSession(secure: boolean): string {
  return [
    `${NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ]
    .filter(Boolean)
    .join("; ");
}
