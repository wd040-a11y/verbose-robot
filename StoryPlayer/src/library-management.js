// Exact package identity only: similar titles never authorize replacement.
export const personalPrefixes = ['state:','enrichment:','edits:','history:','snapshots:','place-names:'];
export const cachePrefixes = ['places-v2:','resource-report:'];
export function relatedGameKey(key,id){return typeof key==='string' && (key===id || [...personalPrefixes,...cachePrefixes].some(p=>key===p+id));}
