# ── PHP Hierarchy Lens — build & release ──────────────────────────────────
# Tokens are read from .env (gitignored). Copy .env.example to .env and set:
#   VSCE_PAT   VS Code Marketplace token   OVSX_PAT   Open VSX token
# vsce/ovsx pick these up from the environment, so they're never on the CLI.
-include .env
export

# Re-evaluated on every use, so it tracks the version after a bump.
VSIX = php-hierarchy-lens-$(shell node -p "require('./package.json').version").vsix

.PHONY: help install compile test package verify github-release \
        publish publish-vsce publish-ovsx \
        release release-minor release-major _release _git-release

help:
	@echo "make verify         Check marketplace tokens work (no publish)"
	@echo "make package        Build the .vsix for the current version"
	@echo "make publish        Package + publish the current version to both marketplaces"
	@echo "make github-release Create a GitHub release with the .vsix attached"
	@echo "make release        Test, bump PATCH, package, publish, commit, tag, push, GitHub release"
	@echo "make release-minor  Same, bumping the MINOR version"
	@echo "make release-major  Same, bumping the MAJOR version"

install:
	npm install

compile:
	npm run compile

test:
	npm test

package: compile
	npx @vscode/vsce package

# Check token/auth for each configured marketplace without publishing anything.
verify:
	@if [ -n "$$VSCE_PAT" ]; then \
		echo "→ Verifying VS Code Marketplace token…"; \
		npx @vscode/vsce verify-pat igaster; \
	else echo "⏭  VS Code Marketplace: VSCE_PAT not set"; fi
	@if [ -n "$$OVSX_PAT" ]; then \
		echo "→ Verifying Open VSX token…"; \
		npx ovsx verify-pat igaster; \
	else echo "⏭  Open VSX: OVSX_PAT not set"; fi

publish-vsce:
	@if [ -n "$$VSCE_PAT" ]; then \
		echo "→ Publishing $(VSIX) to the VS Code Marketplace…"; \
		npx @vscode/vsce publish --packagePath $(VSIX); \
	else \
		echo "⏭  Skipping VS Code Marketplace (VSCE_PAT not set in .env)"; \
	fi

publish-ovsx:
	@if [ -n "$$OVSX_PAT" ]; then \
		echo "→ Publishing $(VSIX) to Open VSX…"; \
		npx ovsx publish $(VSIX); \
	else \
		echo "⏭  Skipping Open VSX (OVSX_PAT not set in .env)"; \
	fi

# Create a GitHub release for the current version with the .vsix attached, so
# plain-VS-Code users (and editors without a store) can install from VSIX.
# Uses the current tag if it exists, otherwise creates it at HEAD.
github-release:
	@command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI not installed — https://cli.github.com"; exit 1; }
	@test -f "$(VSIX)" || { echo "ERROR: $(VSIX) not found — run 'make package' first"; exit 1; }
	@VER=$$(node -p "require('./package.json').version"); \
		gh release create "v$$VER" "$(VSIX)" \
			--title "v$$VER" \
			--notes "**VS Code:** download the attached \`.vsix\` → *Extensions → ⋯ → Install from VSIX…*.  **Cursor / VSCodium / Windsurf / Gitpod:** search \"PHP Hierarchy Lens\" (Open VSX)." \
		&& echo "✓ GitHub release v$$VER created"

publish: package publish-vsce publish-ovsx
	@done=""; \
		[ -n "$$VSCE_PAT" ] && done="$$done VS-Code-Marketplace"; \
		[ -n "$$OVSX_PAT" ] && done="$$done Open-VSX"; \
		[ -n "$$done" ] && echo "✓ Published $(VSIX) to:$$done" || echo "⚠  Nothing published (no tokens set in .env)"

# Release = clean check → tests → bump → package → publish → commit/tag/push → GitHub release
release:       BUMP := patch
release-minor: BUMP := minor
release-major: BUMP := major
release release-minor release-major: _release

_release:
	@git diff-index --quiet HEAD -- || { echo "ERROR: working tree not clean — commit your changes first"; exit 1; }
	@[ -n "$$VSCE_PAT" ] || [ -n "$$OVSX_PAT" ] || { echo "ERROR: no tokens set — configure VSCE_PAT and/or OVSX_PAT in .env"; exit 1; }
	$(MAKE) test
	npm version $(BUMP) --no-git-tag-version
	$(MAKE) package
	$(MAKE) publish-vsce publish-ovsx
	$(MAKE) _git-release
	$(MAKE) github-release

_git-release:
	@VER=$$(node -p "require('./package.json').version"); \
		git add package.json package-lock.json; \
		git commit -m "Release v$$VER"; \
		git tag "v$$VER"; \
		git push --follow-tags; \
		echo "✓ Released v$$VER"
