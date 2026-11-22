# Droid Archives project instructions

- Read [style.md](style.md) before changing any page, component, CSS or public UI copy. Apply its spacing rules and verification checklist to every UI change.
- Text must never touch a card border or divider. Outer margins and grid gaps do not replace inner padding. Check desktop and mobile renders, including page headings and introductions.
- Never mention datamining, datamined data/assets/positions, extraction, or reverse engineering in public-facing copy, patch notes or release announcements. Describe the feature itself. Private technical research may discuss these when requested.
- Do not mention the unpublished general progression guide in public patch notes, announcements or navigation until explicitly authorized. Public event guides are separate.

- Read [shared-data.md](shared-data.md) before adding droid facts, game rules or reusable UI. Use the canonical catalogue, shared rule modules and renderers instead of duplicating data or formulas in a page.

## Private backup and working across PCs

- These rules apply on every PC and in future conversations. For private backup implementation details, read [research/tools/private_sync/README.md](research/tools/private_sync/README.md) in the private checkout.
- Before syncing work from another PC, inspect local changes and fetch/check both the public and private repositories. Integrate relevant remote changes without overwriting uncommitted work. Private backup uploads local contents; it is not a substitute for pulling another PC's changes.
- Use `powershell -NoProfile -ExecutionPolicy Bypass -File .\backup.ps1 -CheckOnly`, review the change report, then run the same command without `-CheckOnly` when a private push is authorized. Use the default incremental workflow, not a new full project copy or a manual full upload.
- Keep exports, research, references, emojis and private tools in the private backup scope, including unchanged exports. Unchanged files already on the remote stay there: do not recopy, recompress or reupload them just to include them. New or modified files are uploaded; unchanged large exports reuse their checksum-verified manifest and archive parts.
- Preserve remote-only files. Do not infer deletions from an incomplete checkout or remove older exports to make a sync faster. Use `-FullSnapshot` only when the user explicitly requests a complete replacement snapshot and its deletion effects have been reviewed.
- The fingerprint and archive cache is local to each PC at `%LOCALAPPDATA%\DroidArchives\private-sync`. A new PC's first scan takes longer; later scans reuse the cache. Do not commit or transfer this cache as project content.
- Keep secrets, dependencies, logs, caches and packaged executables excluded. Include optional runtime files only when explicitly requested, using `-IncludeRuntime`. Private backup authorization does not authorize publishing private files to the public repositories.
- After a private push, verify the final remote commit and changed paths. When checking export coverage, also verify that unchanged sources match their cached fingerprints and remote blob IDs or archive checksums, and that every referenced archive part exists. Report a no-op as already up to date, not as a new upload.
- Public deployment remains a separate operation: use `deploy.ps1 -CheckOnly` followed by `deploy.ps1` when authorized, then verify the completed deployments and live files. Never push private repository history to a public remote.
