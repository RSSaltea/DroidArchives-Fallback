export const KYBER_RELEASE_AT=Date.parse('2026-09-26T20:00:00Z');
export const isKyberPreviewUser=user=>Boolean(user?.id&&user?.email?.toLowerCase()==='xraffo@gmail.com');
// Public website release was brought forward by the owner on September 26.
export const kyberIsReleased=()=>true;
export const visiblePatchNotes=(notes,released)=>notes.filter(note=>note.id!=='2026-09-26-kyber'||released);
