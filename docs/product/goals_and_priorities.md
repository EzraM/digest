## UI flows

**Remove a block** when we remove a site block, it doesn't go away

**Add a block** When you open the heads up display to add a block, the styling of the UI is very basic. The input should be full width. Likely we want to use Mantine, similar to the other parts of the UI.

You can't just start typing into the input because it doesn't autofocus.

**Floating editor** There's a floating editor that comes with BlockNote that we've turned off somehow. The floating editor allows you to do things like click "B" for bold text, or add links. Issue with it is that it has dropdown menus that are not perfectly square. The way we're building the application is in layers that sit on top of each other. The embedded web browsers would, naively, sit on top of the floating editor bar. Probably simplest thing is to rework the editor bar to be in the heads-up-display in the lower right, similar to the choose-a-block editor.

**Scrolling** We might want to experiment with scrolling rules. Maybe first one would be, when you scroll to the bottom of a webpage and keep scrolling down, forward those events somehow to the app, so it scrolls down.

**Selection** We want to be able to select text in a browser and have it land in a block.

## Agent
**Ships with Claude** I'd like to be able to chat with Claude from the browser, using recent notes as context, along with a `question` block, where I can ask things.

**Ships with MCP** Cline is a VS Code extenion that's been developing a pattern for an MCP 'store'. It'd be nice to be able to have a conversation to add a Jira integration, and then you would in your conversations with Claude moving forward be able to reference Jira tickets. Or git.

## Search
Maybe sqlite search of notes to start. But, could also think about embeddings in the local sqlite. Or, send it all to Gemini

## Backend
**Save state locally** We don't store state at the moment. The browser closes and your notes are gone. Probably want to save these somewhere, maybe sqlite.

**Save to backend** Today, there is no backend. I'm split-mind about it.
On the server, probably interested in something dangerous and interesting, like Rama.
