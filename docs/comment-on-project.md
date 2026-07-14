# State of the Project

## Sites in Notebooks Cause Confusion
The SiteBlock components do not have a good UX.
Scrolling is confusing.
An embedded website is a lot of conceptual complexity nested into a notebook.
A site just does a lot of things. It's similar to an operating system process.
It deserves nearly a full screen of space to sprawl out and fit the form people are used to.
The tabs of a web browser end up being similar to the tabs in an operating system level dock or taskbar which run programs.
We don't want tabs in Digest.
We are, however, to only opening web pages in the full screen view, where they have sufficient space.

Eventually, I suspect we will remove the site block capability.

## Clip 
The challenge, then, becomes extraction.
We want to be able to pull information from the webpages, when they are open full screen, then save the extracted bits to the notebook, along with a link back so the site can be opened later.
It should be easy to clip text or images.
Maybe we ask for what could be clipped. If looking at an ebay listing, you could ask for a couple images, the product name and the price.
Come back to the notebook and the information you need is there.
It appears proporational to the other content.

Eventually, commands like "make a table with the images, price, and titles of the ebay listings for mugs" should work, using the current page as context, and with tools available for an agent to use.

## Commands
Today, there are slash commands to:
* add blocks to a notebook (add heading, add table)
* search the web
* open a page

For opening pages and search, today, we rely on 3 kinds of site blocks:
URL - enter a url to visit
ChatGPT - open chat gpt in a siteblock and chat
Google - open google in a siteblock and search / chat

We don't have the ability to search blocks yet, but could imagine a command to do that.

Advantages:
Performance. Entering a url is fast.
Cheap and local. There's no model or external dependency.
Predictable. One command, one result.
Digest Architecture (grounded in the current app)

Disadvantages:
You create new command for every kind of search you want to do.
Want to search google scholar? You can open the page, or create a command for it.
Commands feel like learning the language of the computer or the program.
You find the exact magic words, and that's how you'll get a result from the system.
With llm's the goalposts are shifting.
With llm's, the machine can map your language to an intent it can execute on.

Today, the slash command metaphor is of an autocomplete.
In the future, I think we want to think of it as a lightweight agent.
You tell it what you're thinking, what you're interested in, and it'll help surface resources from you notebook, or the web, or tools, to help answer your questions.