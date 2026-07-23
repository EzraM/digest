# Digest visual style guidance

This document describes the visual language for Digest application chrome and
compact controls. It is a working product guideline: prefer consistency with
these principles over the defaults of a component library or older one-off
color definitions.

## Character

Digest should feel calm, thoughtful, and lightly playful. The interface can
show personality—such as the site view's night-to-day loading treatment—but
that personality should support orientation rather than compete with content.

The product should generally feel:

- quiet rather than sterile;
- soft rather than flat or boxy;
- compact without making interaction targets small;
- atmospheric in transient states, restrained when idle;
- consistent between notebook and browser contexts.

## Surfaces and structure

Application chrome uses a shared, continuous surface. In light mode, the title
bar and vertical rails should use the same white base. Do not use divider lines
as the primary way to separate every region.

All Digest-owned chrome follows the active light or dark color scheme. Embedded
site content is not recolored; it continues to render according to the site's
own design. This contrast distinguishes the application frame from the external
page without making different pieces of Digest chrome disagree.

Prefer separation through:

- spacing;
- inset control backgrounds;
- subtle changes in tint;
- content boundaries that already exist in the page.

Use a divider only when two adjacent regions would otherwise be ambiguous. A
title bar and rail that visually meet should read as one piece of chrome.

## Large targets, quiet controls

A large interaction target does not need to look like a large button. This is
especially important for edge controls, where fast pointer acquisition is part
of the interaction design.

For rails and similar controls:

1. Preserve the full available click target.
2. Draw a softly tinted, rounded shape inset inside that target.
3. Center a simple 16–18px icon in the visible shape.
4. Strengthen the tint on hover without changing geometry.
5. Avoid scale animations on large targets; use color for the pressed state.

Current rail geometry is intentional: the primary capture action occupies the
upper 15%, browser-back occupies the next 15% when available, and return to the
notebook fills the remaining space.

## Shape

- Compact controls: 7–8px corner radius.
- Floating or location controls: approximately 8px corner radius.
- Icons: usually 16–18px, with rounded stroke caps and joins.
- Avoid mixing square full-bleed controls with soft rounded controls in the
  same piece of chrome.

## Color

Color identifies a role, but should normally appear as a low-opacity tint
rather than a saturated panel.

- Sky blue: capture, reveal, and bringing web content into Digest.
- Indigo: navigation and movement through browser history.
- Violet: returning to, reflecting on, or synthesizing in a notebook.
- Amber/daylight: successful page reveal; not a generic success dot.
- Slate/cloud: errors or unavailable external content.

Avoid green circular status indicators in macOS title-bar chrome because they
compete visually with the native green traffic-light control. Reserve stronger
red for destructive actions and clear errors, not general decoration.

Color values should use the shared `--digest-chrome-*` semantic tokens defined
in `index.css`. Add a semantic role there rather than introducing another
component-specific palette.

## Interaction states

Every interactive control needs idle, hover, pressed, focus-visible, disabled,
and loading states where applicable.

- Hover: increase background tint; do not move the control.
- Pressed: increase tint once more; avoid shrinking large controls.
- Focus: use a visible two-pixel indigo/blue outline.
- Disabled: retain form and reduce opacity; use a wait cursor only for an
  operation that is actively running.
- Loading motion must respect `prefers-reduced-motion`.

Hidden actions may reveal on hover when their anchor remains understandable.
The site refresh action is an example: it appears next to the page-status icon,
but the status icon remains present at rest.

## Title bar and context

The title bar is contextual application chrome, not a permanent notebook
breadcrumb.

- Notebook view: show the active profile and notebook title.
- Site view: show site status and URL; do not repeat the notebook name.
- Keep a useful draggable region around interactive content.
- On macOS, preserve the native traffic-light position and clearance.

The site location control is centered as a unit. Its URL text is left-aligned
beside the status icon. Loading may use a wider portion of the bar for ambient
feedback, but the atmosphere should become quiet after the site resolves.

### Site loading narrative

- Loading: moon/night backdrop with restrained motion.
- Loaded: dawn transition, resolving to the site's favicon.
- Missing favicon: retain the sun as a friendly fallback.
- Error: cloud/overcast treatment.
- Reload: return to the loading state.

This is product feedback, not ornament: it should communicate the browser's
state even when motion is disabled.

## Menus and compact panels

Menus should feel related to the inset controls that open them.

- Use the shared chrome surface instead of an obviously different default
  component-library surface.
- Use an 8px outer radius and a soft shadow or hairline edge, not both heavily.
- Menu items should have rounded inset hover backgrounds.
- Keep labels quiet and compact; preserve clear grouping through spacing.
- Destructive items may use restrained red text, with a soft red hover tint.
- Trigger icons should use the same stroke weight and interaction states as
  rail and title-bar icons.

Mantine is an implementation tool, not the visual source of truth. Override its
defaults when they conflict with this guidance.

## Reference implementations

Use these components when applying the system elsewhere:

1. **Large edge targets:** `LeftRail.css` and `SidebarToggleButton.css` preserve
   full-size hit areas while drawing quiet inset controls.
2. **Compact selectors and menus:** `ProfileList.css` demonstrates the shared
   radii, semantic tints, menu surface, focus state, and destructive treatment.
3. **Contextual chrome:** `StatusBar.css` and `BlockRouteStatusBar.css` show how
   notebook and site states occupy the same title-bar surface.

When changing one of these areas, compare notebook and site views side by side
at rest, hover, keyboard focus, loading, and reduced-motion settings.
