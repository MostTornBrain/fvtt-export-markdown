
# Markdown Exporter, changes for PF2E

**NOTE** This is a very rough modification to the original Markdown Exporter so it
produces more usable Pathfinder 2E Remaster content in markdown format for Obisidian.

This is NOT designed to be module that can be directly imported into Foundry.  The assumption
is you will merge these changes on top of the existing Markdown Exporter to modify its behavior. 

Modified files are:
- scripts/export-markdown.js
- scripts/module-settings.js

After you merge in the changes, you need to restart your world for the changes to the module to 
take effect..

When exporting the Pathfinder compendium, use the included `handlebars/spell_handlebar.hbs` for Spells, `monster_handlebar.hbs` as the general handlebar for Actors, `hazard_handlebar.hbs` as the handlebar for HAzard actors, and `generic_handlebar.hbs` for generic items.  You'll need to manually copy these to Foundry as the Foundry file browser does not let you interact with .hbs files, but the internal handlebar routine requires a file extension of .hbs or other appropriate handlebar-relate name, none of which you can see with the Foundry file browser. Then within Foundry enter the handlebar names in the appropriate locations in the Markdown Exporter mondule settings UI.

Included in this project is a new file `pf2e-spell.css` which is an 
Obsidian CSS snippet which can be installed in your `.obsidian/snippets` directory so the spells resemble the new style used in the Player Core and GM Core books.

# Usage

Please refer to the original project for usage instructions for this module.  They remain the same.

# TODO

## Currently in process:
* spot checking the data for Spells, Monsters, and HAzards comparing to the published PDFs to ensure the handlebars are not missing important data for the export.

## Future:
Convert the rest of the document types, such as Glossary, Actions, etc.
