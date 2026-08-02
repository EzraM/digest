# Module composition in Digest

Digest uses a small dependency container together with process modules,
renderer modules, contribution registries, and a typed IPC boundary. The design
is primarily inspired by Atom's package and Service Hub model. Clojure
Component, Duct, and Visual Studio Code provide useful secondary reference
points, but they are not the model we are trying to reproduce wholesale.

## Current Digest model

The composition system has four distinct responsibilities:

| Part | Responsibility |
| --- | --- |
| `Container` | Resolve versioned services, enforce declared dependencies, cache instances, and dispose them in reverse dependency order. |
| `ProcessModuleHost` | Let a feature provide services, select activation roots, contribute process behavior, and register namespaced IPC operations. |
| `ContributionRegistry` | Collect open-ended application contributions such as integrations without teaching the container about each contribution type. |
| `RendererModuleHost` | Mount the renderer half of each installed module so it can contribute React UI through renderer-owned extension points such as `PageToolSlot`. |

A feature that crosses Electron's process boundary is represented by two module
halves and a shared data protocol:

```text
feature/
  FeatureModule.ts             process services and behavior
  FeatureRendererModule.tsx    React components and renderer behavior
  FeatureProtocol.ts           structured-cloneable requests and events
```

The process and renderer bundles currently have static composition roots:

- `builtInModules.ts`
- `builtInRendererModules.ts`

These files are the catalog of plugins shipped with Digest. They are a stand-in
for future installed-plugin discovery, not a place for plugin implementation.
Electron builds the process and renderer separately, so even a future manifest
loader will need to select a distinct entrypoint for each environment.

### Dependency boundaries

Services declare dependencies by name and optional semantic-version range. A
factory receives a lookup containing only those declared dependencies:

```ts
module.provide("google.calendar", {
  dependencies: [
    { name: "database", version: "^1.0.0" },
    { name: "digest.scheduler", version: "^1.0.0" },
    { name: "google.authorization", version: "^1.0.0" },
  ],
  factory: (dependencies) => {
    const database = dependencies.get("database");
    // An undeclared lookup fails.
  },
});
```

This makes the dependency declaration an enforced capability boundary within
the application architecture. It is not a security sandbox: code running in
the Electron main process is still trusted process code.

### Process-to-renderer boundary

React components never cross IPC. The renderer half of a module owns its React
code. The process half sends structured data through a generic namespaced
transport:

```text
modules:invoke
modules:event
```

Each module receives an IPC facade scoped by the platform to its module ID.
Shared protocols define request, response, and event shapes. Payloads are
runtime-validated on the IPC boundary, and event envelopes receive their module
source from the platform rather than from plugin-supplied data.

The Google Calendar renderer module, for example, owns its meeting component,
subscribes to `meetingReady`, invokes `readyMeetings` to recover current state,
and registers its React content with `PageToolSlot` only while content is
available.

## Primary inspiration: Atom

Atom separated package lifecycle, UI contributions, and services exchanged
between packages. Its Service Hub let a package provide a named service at a
semantic version and let other packages consume a compatible version range.
Providers could expose multiple major versions or compatibility shims, while
consumers did not need Atom core to construct either package.

That is the central inspiration for Digest:

- Features own their registration and implementation.
- Core hosts modules without constructing feature internals.
- Modules provide and consume small, named, versioned service interfaces.
- UI contributions belong to the renderer half of the feature.
- Activation and disposal belong to module lifecycle rather than application
  entrypoint special cases.

Digest is not yet a complete Atom-style package system. Its built-in catalogs
are static, it permits one provider per service name, and it does not yet have
installation, package manifests, late provider discovery, or sandboxing. Those
can be introduced behind the current module-host boundary if the product needs
third-party plugins.

Reference: [Atom Service Hub](https://github.com/atom/service-hub)

## Comparison with Clojure Component

[Component](https://github.com/stuartsierra/component) manages a graph of
stateful objects with explicit dependencies and ordered start/stop lifecycle.
Its strongest influence on Digest is the rule that a component should receive
only the dependencies it needs, rather than the entire system.

| Component | Digest |
| --- | --- |
| System map contains component instances and dependency references. | Container contains service definitions and resolved instances. |
| Dependencies are injected before lifecycle start. | Declared dependencies are resolved before a service factory runs. |
| Components start in dependency order and stop in reverse order. | Services resolve in dependency order and dispose in reverse order. |
| The system map is an application composition root. | Built-in module catalogs and `ProcessModuleHost` form the composition root. |

Component is mainly an application lifecycle pattern. It does not by itself
provide package discovery, renderer contributions, or a cross-process protocol.
Digest therefore uses Component-like rules inside a more Atom-like module
system.

## Comparison with Duct

[Duct](https://duct-framework.org/) builds on Integrant and treats application
configuration as data. Duct modules can expand a concise configuration into a
larger system definition. This keeps feature-specific construction out of the
application entrypoint.

Digest borrows the idea that a feature should describe how it expands the
application:

```ts
module.provide(...);
module.activate(...);
module.contribute(...);
module.ipc.handle(...);
```

The important difference is representation. Duct primarily transforms Clojure
data; Digest modules execute TypeScript registration functions because they
must connect typed services, Electron capabilities, and separately bundled
renderer code. A future plugin manifest may add a data layer above this API,
but the runtime module boundary will remain necessary.

## Comparison with Visual Studio Code

[Visual Studio Code extensions](https://code.visualstudio.com/api/get-started/extension-anatomy)
combine declarative contribution points with `activate` and `deactivate`
lifecycle functions. Extensions primarily depend on a stable host API rather
than on a general dependency graph between extensions.

Digest borrows two ideas from VS Code:

- Core exposes generic contribution points instead of importing feature UI.
- Feature code activates behind a host-controlled lifecycle boundary.

The service relationship is different. Digest intentionally supports
Atom-style plugin-to-plugin services, such as Google Calendar consuming a
scope-constrained `google.authorization` service. VS Code's contribution model
is a useful guide for commands, slots, and other host extensions, but it is not
the primary model for service composition.

Reference: [VS Code contribution points](https://code.visualstudio.com/api/references/contribution-points)

## Design direction

The intended direction is an Atom-inspired package system with explicit
capabilities:

1. Keep the container small and concerned only with services and lifecycle.
2. Keep contribution registries separate from dependency resolution.
3. Represent cross-process features with paired process and renderer modules.
4. Keep IPC generic, namespaced, structured-cloneable, and runtime-validated.
5. Let renderer modules own their React components and choose when to occupy
   platform slots.
6. Replace static built-in catalogs with manifest-backed discovery only when
   Digest needs installable plugins.
7. Add process or sandbox isolation before treating third-party modules as
   untrusted code; TypeScript interfaces and dependency declarations alone are
   not security boundaries.

Atom is the main design lineage: independently owned packages, versioned
services, and host-defined extension points. Component sharpens dependency and
lifecycle discipline; Duct informs module-driven composition; VS Code informs
declarative contributions and renderer hosting.
