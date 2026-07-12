# ── PHP Hierarchy Lens — build & release ──────────────────────────────────
# Tokens are read from .env (gitignored). Copy .env.example to .env and set:
#   VSCE_PAT   VS Code Marketplace token   OVSX_PAT   Open VSX token
# vsce/ovsx pick these up from the environment, so they're never on the CLI.
-include .env
export

# Re-evaluated on every use, so it tracks the version after a bump.
VSIX = php-hierarchy-lens-$(shell node -p "require('./package.json').version").vsix

.PHONY: help install compile test package \
        publish publish-vsce publish-ovsx \
        release release-minor release-major _release _git-release

help:
	@echo "make package        Build the .vsix for the current version"
	@echo "make publish        Package + publish the current version to both marketplaces"
	@echo "make release        Test, bump PATCH, package, publish, commit, tag, push"
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

publish-vsce:
	@test -n "$$VSCE_PAT" || { echo "ERROR: VSCE_PAT not set (copy .env.example to .env)"; exit 1; }
	npx @vscode/vsce publish --packagePath $(VSIX)

publish-ovsx:
	@test -n "$$OVSX_PAT" || { echo "ERROR: OVSX_PAT not set (copy .env.example to .env)"; exit 1; }
	npx ovsx publish $(VSIX)

publish: package publish-vsce publish-ovsx
	@echo "✓ Published $(VSIX) to both marketplaces"

# Release = clean check → tests → version bump → package → publish → commit/tag/push
release:       BUMP := patch
release-minor: BUMP := minor
release-major: BUMP := major
release release-minor release-major: _release

_release:
	@git diff-index --quiet HEAD -- || { echo "ERROR: working tree not clean — commit your changes first"; exit 1; }
	$(MAKE) test
	npm version $(BUMP) --no-git-tag-version
	$(MAKE) package
	$(MAKE) publish-vsce publish-ovsx
	$(MAKE) _git-release

_git-release:
	@VER=$$(node -p "require('./package.json').version"); \
		git add package.json package-lock.json; \
		git commit -m "Release v$$VER"; \
		git tag "v$$VER"; \
		git push --follow-tags; \
		echo "✓ Released v$$VER"
