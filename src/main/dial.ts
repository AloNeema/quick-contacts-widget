import { buildDialUri, fillPhoneTemplate } from "@shared/dialer";
import type { DialRequest } from "@shared/ipc";
import type { DialerProvider } from "@shared/types";

type Result = { ok: true; message?: string } | { ok: false; error: string };
interface DialServices {
  openExternal(uri: string): Promise<Result>;
  copy(phone: string): void;
  recordUse(id: string | undefined): Promise<void>;
}

export async function dispatchDial(provider: DialerProvider, req: DialRequest, services: DialServices): Promise<Result> {
  try {
    if (provider.id === "talkdesk") {
      fillPhoneTemplate("{e164}", req.phone);
      services.copy(req.phone);
      return { ok: true, message: req.action === "sms"
        ? "Number copied. Paste it into Talkdesk SMS. No message was sent."
        : "Number copied. Paste it into the Talkdesk dialer." };
    }
    const result = await services.openExternal(buildDialUri(provider, req.action, req.phone));
    if (result.ok) await services.recordUse(req.contactId);
    if (!result.ok && req.action === "sms") {
      services.copy(req.phone);
      return { ok: false, error: "No texting app is set up for sms: links. The number was copied to your clipboard." };
    }
    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start the action" };
  }
}
