import { useState } from "react";
import { parseSignature, SIGNATURE_LIMIT, type SignatureDraft } from "@shared/signature";
import { Button } from "@renderer/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@renderer/components/ui/dialog";
import { Label } from "@renderer/components/ui/label";

export function SignaturePaste({ onReview, onClose }: { onReview: (draft: SignatureDraft) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const review = () => {
    try { onReview(parseSignature(text)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not read this signature."); }
  };
  return <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Paste an email signature</DialogTitle>
        <DialogDescription>Copy one person's signature from Outlook and paste it below. You'll review the suggested details before adding the contact.</DialogDescription>
      </DialogHeader>
      <Label htmlFor="signature-text">Signature text</Label>
      <textarea id="signature-text" autoFocus rows={9} value={text} onChange={e => { setText(e.target.value); setError(""); }}
        onPaste={e => { if (!e.clipboardData.getData("text/plain")) { e.preventDefault(); setError("This clipboard item has no text. Copy the signature's text rather than its image."); } }}
        placeholder={'Jane Doe\nVP, Lending\nAcme Capital\nOffice: (202) 555-0101\nMobile: (202) 555-0102\njane@acme.example'}
        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <p className="text-xs text-muted-foreground">Processed on this computer. Logos and image-only signatures aren't read. Paste just the signature, not the whole email.</p>
      {text.length > SIGNATURE_LIMIT ? <p role="alert" className="text-sm text-destructive">This is too long. Keep just the signature (up to 12,000 characters).</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!text.trim() || text.length > SIGNATURE_LIMIT} onClick={review}>Review contact</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
