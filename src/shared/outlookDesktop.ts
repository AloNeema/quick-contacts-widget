import { Buffer } from "node:buffer";

/** Graph entryId uses URL-safe base64 followed by its removed-padding count. */
export function graphEntryIdToHex(value: string): string {
  if (!/^[A-Za-z0-9_-]+[012]$/.test(value) || value.length > 8192) throw new Error("Invalid Outlook entry ID");
  const padding = Number(value.slice(-1));
  const base64 = value.slice(0, -1).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);
  if (base64.length % 4 !== 0) throw new Error("Invalid Outlook entry ID padding");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.toString("base64") !== base64) throw new Error("Invalid Outlook entry ID encoding");
  return bytes.toString("hex").toUpperCase();
}

/** Static program: message IDs and account addresses arrive as JSON on stdin, never as code. */
export const OUTLOOK_DESKTOP_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($request.entryId -notmatch '^[0-9A-F]+$' -or $request.action -notin @('open', 'reply', 'replyAll')) { throw 'Invalid request' }
  try { $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') }
  catch { $outlook = New-Object -ComObject Outlook.Application }
  $session = $outlook.GetNamespace('MAPI')
  $matchedAccount = $null
  foreach ($account in $session.Accounts) {
    if ($request.addresses -contains ([string]$account.SmtpAddress).ToLowerInvariant()) {
      $matchedAccount = $account
      break
    }
  }
  if ($null -eq $matchedAccount -or $null -eq $matchedAccount.DeliveryStore) { throw 'Mailbox not available in Classic Outlook' }
  $item = $session.GetItemFromID([string]$request.entryId, [string]$matchedAccount.DeliveryStore.StoreID)
  if ($null -eq $item -or $item.Class -ne 43) { throw 'Email unavailable' }
  if ($request.action -eq 'reply') {
    $draft = $item.Reply()
    $draft.SendUsingAccount = $matchedAccount
    $draft.Display($false)
    $draft.GetInspector.Activate()
  } elseif ($request.action -eq 'replyAll') {
    $draft = $item.ReplyAll()
    $draft.SendUsingAccount = $matchedAccount
    $draft.Display($false)
    $draft.GetInspector.Activate()
  } else {
    $item.Display($false)
    $item.GetInspector.Activate()
  }
  [Console]::Out.WriteLine('opened')
  exit 0
} catch {
  [Console]::Error.WriteLine('Classic Outlook could not open the requested message.')
  exit 1
}
`;
