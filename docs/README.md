# Digest Project Documentation

This directory contains documentation for the Digest project.

## Directory Structure

- **[product/](./product/)**: Product documentation
  - **[goals_and_priorities.md](./product/goals_and_priorities.md)**: Overview of project goals and priorities
  - **[development_roadmap.md](./product/development_roadmap.md)**: Detailed roadmap with priorities and timelines
  - **[technical_architecture.md](./product/technical_architecture.md)**: Technical architecture documentation
  - **[visual-style-guidance.md](./product/visual-style-guidance.md)**: Visual language for application chrome, controls, menus, and interaction states
- **[plans/](./plans/)**: Technical plans / design docs
  - **[clip-architecture-plan.md](./plans/clip-architecture-plan.md)**: Clipping pipeline (selection → proposed blocks → insert), deterministic vs LLM conversion, and review/edit UX
  - **[sync-refactor-plan.md](./plans/sync-refactor-plan.md)**: Refactor persistence/sync to granular BlockNote changes, preserving provenance and supporting snapshots, image cleanup, and clip insertion

## About Digest

Digest is an Electron-based application designed to enhance web browsing and note-taking with integrated AI capabilities. The application allows users to:

- Browse web content
- Take notes in blocks
- Interact with AI assistants like Claude
- Maintain context across different sources of information

## Contributing to Documentation

When adding to this documentation:

1. Keep files organized by topic
2. Use Markdown for all documentation
3. Include diagrams where helpful (ASCII diagrams or links to external diagrams)
4. Update this README when adding new documentation files

## Development Process

The development process follows these general steps:

1. Identify priorities from the roadmap
2. Create technical designs for new features
3. Implement and test features
4. Update documentation as needed

For more detailed information about the project, refer to the specific documentation files listed above.
