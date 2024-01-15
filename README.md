
# Markdown Exporter, changes for PF2E

**NOTE** This is a very rough modification to the original Markdown Exporter so it
produces more usable Pathfinder 2E Remaster content in markdown format for Obisidian.

This is NOT designed to be module that can be directly imported into Foundry.  The assumption
is you will merge these changes on top of the existing Markdown Exporter to modify its behavior. 

Currently this only addresses exporting spells.

Modified files are:
- scripts/export-markdown.js
- scripts/module-settings.js

After you merge in the changes, you need to restart your world for the changes to the module to 
take effect..

When exporting the Pathfinder spells, use the included `handlebars/spell_handlebar.hbs` file.  You'll need to manually copy this to Foundry as the file browser does not let you interact with .hbs files, but the internal handlebar routine require a file extension of .hbs or other appropriate handlebar-relate name, none of which you can see with the Foundry file browser.

Included in this project is a new file `pf2e-spell.css` which is an 
Obsidian CSS snippet which can be installed in your `.obsidian/snippets` directory so the spells resemble the new style used in the Player Core and GM Core books.

# Usage

Selecting the "Export to Markdown" option from the Journal Sidebar generates a ZIP file containing the selected journal/folder tree.

It is possible to export:

- one individual journal
- a folder of journals
- the entire sidebar of journals
- the contents of a Journal compendium
- the contents of Journal compendiums in a compendium folder

The contents of the downloaded ZIP can then be exported into your Obsidian Vault.

Links to non-journal entries will be converted to Markdown-format links (which will obviously point to non-existent pages).

## Options

### Format for non-decoded data

You can select either YAML or JSON for notes created from Actors and Items, to specify the format in which the data should be displayed within the note.

### Format Scenes for Leaflet plugin

All scenes will be converted to use the syntax required for Obsidian's "Leaflet" plugin.

### JournalEntry folders use UUID instead of Journal name

When not checked, folders will use the journal entry's name; when checked, folders will use the journal entry's UUID.

(Note that Obsidian's "AidenLX's Folder Note" plugin will show the journal's title in the note explorer.)

*Using UUID allows for easier (and more unique) linking of links between documents.*

### Use UUID of each document as the Note name

With this option checked, all documents will be stored in a file whose name is Foundry's UUID. (Obsidian's "Front Matter Title" plugin will show the document's title in Obsidian's note explorer panel)

With this option unchecked, all documents will be stored in a file whose name is the Document's name.

*Using UUID allows for easier (and more unique) linking of links between documents.*

## Installation

The module can be installed directly from your Foundry server's module management page.

Alternatively, you can install manually using the link:

https://github.com/farling42/fvtt-export-markdown/releases/latest/download/module.json

## Dependencies

This library requires the libWrapper module in order to work properly.

## Plugins for use with Obsidian.md

- "Front Matter Title" - To have document names appearing in Obsidian's Explorer (left sidebar). The only Feature which needs to be enabled is "Explorer".
- "AidenLX's Folder Note" and "Folder Note Core" - So that journal entries have their main contents page accessible directly from the containing folder.
- "Obsidian Leaflet" - For display of scenes with notes.

## Libraries

- [JSZip](https://stuk.github.io/jszip)
- [JSYAML](https://github.com/nodeca/js-yaml) (for Object to YAML conversion)
- [turndown](https://www.npmjs.com/package/turndown) (for HTML to Markdown conversion) 
- [turndown-plugin-gfm](https://www.npmjs.com/package/turndown-plugin-gfm) (to convert HTML tables to GFM format) 
- [string-replace-async](https://github.com/dsblv/string-replace-async) (to provide async version of String.replaceAll)
