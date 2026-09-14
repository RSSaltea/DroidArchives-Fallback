# Repository and publishing instructions

This workspace contains the public website and a private desktop companion app.
Keep the app on disk, but out of both public website repositories.

## Publishing the website

When the user asks to push or deploy the website:

1. Review the working tree and staged changes. Preserve unrelated work.
2. Check `git config --get core.hooksPath`. It should be `.githooks`. If unset,
   enable it with `git config core.hooksPath .githooks`. If another hook directory
   is configured, investigate and preserve its protections before proceeding.
3. Commit the intended website changes and any pending privacy safeguards.
4. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1 -CheckOnly`.
5. If validation succeeds, run
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1`.

`deploy.ps1` publishes website snapshots to `origin` and `fallback`, each based
only on that public repository's history. It keeps `CNAME` on origin and omits
it on fallback. Local branch history can contain private app files even after
those files have been removed from tracking.

- Do not push local branches directly to either public repo, including through
  a GUI, GitHub API, alternate remote name, or raw repository URL.
- Do not use `git push --all`, `--mirror`, `--tags`, force pushes, or merge local
  history into a public branch to publish the website.
- Do not bypass the push hook with `--no-verify` or disable its configuration.
  A blocked push means use the deployment script, not override the guard.
- If deployment fails, fix the reported cause and rerun the script. Do not fall
  back to a direct push. Do not reset or clean the workspace to make it pass.

## Private app and local files

- Preserve `.gitignore` exclusions for `desktop/`, `build-companion.bat`,
  `release/`, OCR models (`*.traineddata`), `research/`, `references/`, private
  backup tools, conversation archives, and app-only calibration assets.
- Do not force-add ignored files, copy app source into website paths, or add
  ignore exceptions for app tests, tools, fixtures, or detection templates.
- Pending staged deletions of these files may be intentional removals from Git
  tracking. Check the local copies; do not restore tracking or delete the copies.
- `references/` and `research/` stay local and must not be pushed to any repo,
  including a private backup repository.
- Private app backups are separate from website deployment. Run the local
  `backup.ps1` only when the user requests a private backup; never retarget it
  to either public website repository.
- Do not bundle or build an `.exe` as part of website work. The user builds the
  companion with the local `build-companion.bat`.
- Existing published app download releases are separate from Git source
  tracking. Do not upload, delete, or migrate releases, or change download and
  updater destinations, as a side effect of a website deployment.
