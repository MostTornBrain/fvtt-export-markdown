import * as MOD_CONFIG from "./config.js"
import { convertHtml } from './export-markdown.js';

/*
 * MODULE OPTIONS
 */

Hooks.once('ready', () => {
    game.settings.register(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_DUMP, {
		name: "Format for non-decoded data",
		hint: "For document types not otherwise decoded, use this format for the data dump.",
		scope: "world",
		type:  String,
		choices: { 
            "YAML": "YAML",
            "JSON": "JSON"
        },
		default: "YAML",
		config: true,
	});

    game.settings.register(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_LEAFLET, {
		name: "Format Scenes for Leaflet plugin",
		hint: "Create Notes in a format suitable for use with Obsidian's Leaflet plugin",
		scope: "world",
		type:  Boolean,
		default: true,
		config: true,
	});

    game.settings.register(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_FOLDER_AS_UUID, {
		name: "JournalEntry folders use UUID instead of Journal name",
		hint: "When checked, Journals will be placed into a folder based on the UUID of the JournalEntry (if unchecked, the folder will be the Journal's name, but links to that journal will not work)",
		scope: "world",
		type:  Boolean,
		default: true,
		config: true,
	});

    game.settings.register(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_NOTENAME_IS_UUID, {
		name: "Use UUID of each document as the Note name",
		hint: "When checked, the created notes will have a name that matches the UUID of the document allowing for easy unique linking from other documents (when unchecked, the notes will use the name of the document, which might not be unique for linking purposes)",
		scope: "world",
		type:  Boolean,
		default: true,
		config: true,
	});

    // Allow handlebars template to be specified for Actors and Items
    game.settings.register(MOD_CONFIG.MODULE_NAME, `template.Actor`, {
        name: "Actor (generic)",
        hint: "Choose a handlebars template file to be used if a template isn't specified for a specific type of actor",
        scope: "world",
        type:  String,
        default: "",
        config: true,
        filePicker: "text"
    })

    for (const type of game.template.Actor.types) {
        const label = CONFIG.Actor.typeLabels[type];
        const actorname = game.i18n.has(label) ? game.i18n.localize(label) : type;
        game.settings.register(MOD_CONFIG.MODULE_NAME, `template.Actor.${type}`, {
            name: game.i18n.format(`${MOD_CONFIG.MODULE_NAME}.actorTemplate.Name`, {name: actorname}),
            hint: game.i18n.format(`${MOD_CONFIG.MODULE_NAME}.actorTemplate.Hint`, {name: actorname}),
            scope: "world",
            type:  String,
            default: "",
            config: true,
            filePicker: "text"
        })
    }

    // Global Item
    game.settings.register(MOD_CONFIG.MODULE_NAME, `template.Item`, {
        name: "Item (generic)",
        hint: "Choose a handlebars template file to be used if a template isn't specified for a specific type of Item",
        scope: "world",
        type:  String,
        default: "",
        config: true,
        filePicker: "text"
    })

    for (const type of game.template.Item.types) {
        const label = CONFIG.Item.typeLabels[type];
        const itemname = game.i18n.has(label) ? game.i18n.localize(label) : type;
        game.settings.register(MOD_CONFIG.MODULE_NAME, `template.Item.${type}`, {
		    name: game.i18n.format(`${MOD_CONFIG.MODULE_NAME}.itemTemplate.Name`, {name: itemname}),
		    hint: game.i18n.format(`${MOD_CONFIG.MODULE_NAME}.itemTemplate.Hint`, {name: itemname}),
		    scope: "world",
		    type:  String,
		    default: "",
            config: true,
            filePicker: "text"
        })
    }
    
  Handlebars.registerHelper('me-trait', function (value) {
    // Convert a sluggified trait into its localized human-readable text
    let lookUpText = CONFIG.PF2E.npcAttackTraits[value];
    if (lookUpText) {
      return game.i18n.localize(lookUpText)
    } else {
      return value;
    }
  });

  Handlebars.registerHelper('me-spellLevels', function (items, id, spellType) {
    // Return the high-to-low sorted list of spell levels for the given spellCastingAbility ID.
    // If cantrips = true, return the list of cantrip levels, otherwise return the list
    // of non-cantrip levels.
    let item;
    let level_list = {};
    if (items) {
      for (item of items) {
        if (item.type === 'spell' && item.system.location.value == id) {
          const level = item.system.location.heightenedLevel ? item.system.location.heightenedLevel : item.system.level.value;
          if (spellType == 'cantrips') {
            if (item.isCantrip) {
              level_list[level] = true;
            }
          } else {
            if (!(item.isCantrip)) {
              if (spellType == 'constant' && item.name.includes('(Constant)')){
                level_list[level] = true;
              } else if (spellType == 'spells' && !(item.name.includes('(Constant)'))){
                level_list[level] = true;
              }
            }
          }
        }
      }
    }
    const keys = Object.keys(level_list);
    var collator = new Intl.Collator([], {numeric: true});
    keys.sort((a, b) => collator.compare(b, a));
    return keys;
  });

  Handlebars.registerHelper('me-getSpellSlotCount', function (item, level) {
    // Return the the spell slot count for the given level in the 
    // form "(# slots) if it is non-zero.

    const slotKey = "slot" + String(level);
    let value = "";
    if (item.system.slots[slotKey]) {
      if (item.system.slots[slotKey].value != 0) {
        value = "(" + String(item.system.slots[slotKey].value) + " slots)";
      }
    }
    return value;
  });

  Handlebars.registerHelper('me-getSpellList', function (items, id, level, spellType) {
    // Return the list of spells for a level for the given spellCastingAbility ID.
    // If cantrips = true, return the list of cantrip spells, otherwise return the list
    // of non-cantrip spells.
    let item;
    let spell_list = [];
    if (items) {
      for (item of items) {
        if (item.type === 'spell' && item.system.location.value == id) {
          const spell_level = item.system.location.heightenedLevel ? item.system.location.heightenedLevel : item.system.level.value;
          if (level == spell_level) {
            if (spellType == 'cantrips') {
              if (item.isCantrip) {
                spell_list.push(item.name);
              }
            } else {
              if (!(item.isCantrip)) {
                if (spellType == 'constant' && item.name.includes('(Constant)')){
                  spell_list.push(item.name.replace(' (Constant)', ''));
                } else if (spellType == 'spells' && !(item.name.includes('(Constant)'))){
                  spell_list.push(item.name);
                }
              }
            }
          }
        }
      }
    }
    return spell_list;
  });

  Handlebars.registerHelper('me-HTMLtoYAML', function (text, context, options) {
    if (text) {

      // First, check if this item is a reference to another entry. 
      // If it is, remove any localize tags as it is redundent text
      // from the reference.
      if (context && context.flags && context.flags.core && context.flags.core.sourceId) {
        const localizePattern = /@(Localize)\[([^#\]]+)(?:#([^\]]+))?](?:{([^}]+)})?/g;
        text = text.replace(localizePattern, '');
      }

      text = convertHtml(context, text);

      // Replace all \n with "\\n" so YAML in the Statblock doesn't break.
      text = text.replaceAll('\n', '\\n');

      // Replace Markdown "* * *" HR.  It will not work there.
      text = text.replaceAll('\\n* * *', '\\n');

      // Remove any lingering solitary * at the start of a line, such as bullets.
      // text = text.replaceAll('\\n* ', '\\n');

      // Compress repeated newlines into a single one.
      text = text.replace(/(\\n)\1+/g, '\\n');

      // Escape all double quotes.
      text = text.replaceAll('"', '\\"');

      // TODO: If we end of with only whitespace, return ''
      text = text.replace(/^\w+$/g, '');
    }
    return text;
  });

  Handlebars.registerHelper('me-HTMLtoMarkdown', function (text, context) {
     if (text) {
      text = convertHtml(context, text);
    }
    return text;
  });

  Handlebars.registerHelper('me-debugDumpObject', function (msg, options) {
    // Simple debug console dump of the current object being used by the handlebar. 
    // This is much better than the text file JSON dump you can get from Foundry 
    // as the debug console view lets you drill down and see normally hidden items 
    // that can still be referenced via the handlebar.
    console.log(msg, options);
  });


    // End of Hooks Once Ready
})

// Add headers for the Actor and Item settings
Hooks.on('renderSettingsConfig', (app, html, options) => {

    const actorModuleTab = $(app.form).find(`.tab[data-tab=${MOD_CONFIG.MODULE_NAME}]`);
    actorModuleTab
      .find(`input[name=${MOD_CONFIG.MODULE_NAME}\\.template\\.Actor]`)
      .closest('div.form-group')
      .before(
        '<h2 class="setting-header">' +
          game.i18n.localize(`${MOD_CONFIG.MODULE_NAME}.titleActorTemplates`) +
          '</h2>'
      )      

    const itemModuleTab = $(app.form).find(`.tab[data-tab=${MOD_CONFIG.MODULE_NAME}]`);
    itemModuleTab
      .find(`input[name=${MOD_CONFIG.MODULE_NAME}\\.template\\.Item]`)
      .closest('div.form-group')
      .before(
        '<h2 class="setting-header">' +
          game.i18n.localize(`${MOD_CONFIG.MODULE_NAME}.titleItemTemplates`) +
          '</h2>'          
      )

})