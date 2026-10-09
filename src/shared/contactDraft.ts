import type { Contact } from "./types";
import { hueForName } from "./merge";
import { normalizeEmail, normalizeUsPhone } from "./phone";

/**
 * Validate and tidy a contact being added or edited by hand (the full form and the widget's
 * quick add share this). Phones arrive as typed text; they must be 10-digit US numbers.
 */
export function finalizeContactDraft(
  draft: Contact,
  phoneText: string,
  mobileText: string,
  opts: { keepHue: boolean; now?: string },
): { contact: Contact } | { error: string } {
  const name = draft.name.trim();
  const phone = phoneText.trim() ? normalizeUsPhone(phoneText) : "";
  const mobilePhone = mobileText.trim() ? normalizeUsPhone(mobileText) : "";
  const email = draft.email?.trim() ? normalizeEmail(draft.email) : "";
  if (!name) return { error: "Name is required." };
  if (phoneText.trim() && !phone) return { error: "Office phone must be a 10-digit US number." };
  if (mobileText.trim() && !mobilePhone) return { error: "Cell phone must be a 10-digit US number." };
  if (draft.email?.trim() && !email) return { error: "That email address doesn't look right." };
  if (!phone && !mobilePhone && !email) return { error: "Add a phone number or an email so the quick actions have something to use." };
  return {
    contact: {
      ...draft,
      name,
      title: draft.title?.trim() || undefined,
      company: draft.company?.trim() || undefined,
      linkedinUrl: draft.linkedinUrl?.trim() || undefined,
      website: draft.website?.trim() || undefined,
      group: draft.group?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      phone: phone || undefined,
      mobilePhone: mobilePhone || undefined,
      email: email || undefined,
      hue: opts.keepHue ? draft.hue : hueForName(name),
      updatedAt: opts.now ?? new Date().toISOString(),
    },
  };
}
